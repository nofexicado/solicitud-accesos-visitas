// Login de operadores (solo canal interno). JWT corto en cookie httpOnly; cada token tiene un jti
// en `sesiones`, así el logout o la baja de un usuario lo invalidan antes de que venza.
import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db.js';
import { logger } from '../logger.js';
import { ErrorHttp } from '../middleware/errores.js';
import { limiteLogin } from '../middleware/limites.js';

export const COOKIE_SESION = 'acc_sesion';
const DURACION_H = 8;
const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 15;
export const COSTO_BCRYPT = 12;
// Para que un email inexistente tarde lo mismo que una contraseña mal.
const HASH_FALSO = bcrypt.hashSync('nadie-tiene-esta-clave', COSTO_BCRYPT);

const cookieOpciones = { httpOnly: true, sameSite: 'strict', secure: config.esProduccion, path: '/api' };

/** Usuario con roles y plantas (las de autorizante). null si no existe o no está activo. */
export async function cargarUsuario(id) {
  const { rows: [u] } = await query(
    `SELECT u.id, u.email, u.nombre,
            COALESCE(array_agg(DISTINCT r.rol) FILTER (WHERE r.rol IS NOT NULL), '{}') AS roles,
            COALESCE(array_agg(DISTINCT ap.planta_id) FILTER (WHERE ap.planta_id IS NOT NULL), '{}') AS plantas
     FROM usuarios u
     LEFT JOIN usuario_roles r ON r.usuario_id = u.id
     LEFT JOIN autorizante_plantas ap ON ap.usuario_id = u.id
     WHERE u.id = $1 AND u.activo AND NOT u.es_invitado
     GROUP BY u.id`,
    [id],
  );
  return u ?? null;
}

/** Usuario de la cookie si la sesión es válida (token firmado, jti vigente, usuario activo); si no, null. */
async function leerSesion(req) {
  let datos;
  try {
    datos = jwt.verify(req.cookies?.[COOKIE_SESION] ?? '', config.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
  const { rowCount } = await query('SELECT 1 FROM sesiones WHERE jti = $1 AND usuario_id = $2 AND NOT revocada AND expira > now()', [datos.jti, Number(datos.sub)]);
  const usuario = rowCount ? await cargarUsuario(Number(datos.sub)) : null;
  return usuario ? { usuario, jti: datos.jti } : null;
}

/** Exige una sesión válida; si no, 401 y se borra la cookie. */
export async function sesion(req, res, next) {
  const s = await leerSesion(req);
  if (!s) {
    res.clearCookie(COOKIE_SESION, cookieOpciones);
    return res.status(401).json({ error: 'Tu sesión terminó. Ingresá de nuevo.' });
  }
  req.usuario = s.usuario;
  req.jti = s.jti;
  next();
}

/** 403 si el usuario no tiene ninguno de los roles. */
export const requireRol = (...roles) => (req, res, next) =>
  req.usuario?.roles.some((r) => roles.includes(r)) ? next() : res.status(403).json({ error: 'Tu usuario no tiene acceso a esta sección.' });

const credenciales = z.object({
  email: z.email({ error: 'Escribí tu email' }).transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, 'Escribí tu contraseña').max(200),
});

export const auth = Router();

auth.post('/login', limiteLogin, async (req, res) => {
  const { email, password } = credenciales.parse(req.body);
  const { rows: [u] } = await query(
    'SELECT id, password_hash, bloqueado_hasta FROM usuarios WHERE lower(email) = $1 AND activo AND NOT es_invitado',
    [email],
  );
  if (u?.bloqueado_hasta && u.bloqueado_hasta > new Date()) {
    const hora = u.bloqueado_hasta.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Ushuaia' });
    throw new ErrorHttp(423, `Demasiados intentos fallidos. Probá de nuevo a las ${hora}.`);
  }
  const ok = await bcrypt.compare(password, u?.password_hash ?? HASH_FALSO);
  if (!u || !ok) {
    if (u) {
      await query(
        `UPDATE usuarios SET
           intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= $2 THEN 0 ELSE intentos_fallidos + 1 END,
           bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE bloqueado_hasta END
         WHERE id = $1`,
        [u.id, MAX_INTENTOS, BLOQUEO_MIN],
      );
    }
    logger.warn({ ip: req.ip, existe: Boolean(u) }, 'login fallido');
    throw new ErrorHttp(401, 'El email o la contraseña no son correctos.');
  }

  const jti = crypto.randomUUID();
  await query('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_login = now() WHERE id = $1', [u.id]);
  await query(`INSERT INTO sesiones (jti, usuario_id, expira) VALUES ($1, $2, now() + make_interval(hours => $3))`, [jti, u.id, DURACION_H]);
  const token = jwt.sign({ sub: String(u.id), jti }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: `${DURACION_H}h` });
  res.cookie(COOKIE_SESION, token, { ...cookieOpciones, maxAge: DURACION_H * 3600 * 1000 });
  logger.info({ usuario: u.id }, 'login');
  res.json(await cargarUsuario(u.id));
});

auth.post('/logout', async (req, res) => {
  try {
    const datos = jwt.verify(req.cookies?.[COOKIE_SESION] ?? '', config.JWT_SECRET, { algorithms: ['HS256'] });
    await query('UPDATE sesiones SET revocada = true WHERE jti = $1', [datos.jti]);
  } catch { /* sin sesión válida: igual se borra la cookie */ }
  res.clearCookie(COOKIE_SESION, cookieOpciones);
  res.status(204).end();
});

auth.get('/me', sesion, (req, res) => res.json(req.usuario));
// Para el front al arrancar: ¿hay sesión? Responde siempre 200 (sin sesión, usuario null).
auth.get('/sesion', async (req, res) => {
  const s = await leerSesion(req);
  if (!s && req.cookies?.[COOKIE_SESION]) res.clearCookie(COOKIE_SESION, cookieOpciones);
  res.set('Cache-Control', 'no-store').json({ usuario: s?.usuario ?? null });
});
