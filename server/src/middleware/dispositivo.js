// Identifica el equipo del invitado con una cookie httpOnly. En la base se guarda solo el hash del
// token, nunca el token. "Mis solicitudes" son las ligadas a este dispositivo.
import crypto from 'node:crypto';
import { query } from '../db.js';
import { config } from '../config.js';

export const COOKIE_DISPOSITIVO = 'acc_disp';
const DOS_ANIOS = 2 * 365 * 24 * 3600 * 1000;
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function buscar(token) {
  if (!token || token.length > 100) return null;
  const { rows } = await query('UPDATE dispositivos SET ultimo_uso = now() WHERE token_hash = $1 RETURNING id', [hash(token)]);
  return rows[0]?.id ?? null;
}

/**
 * Agrega req.dispositivo(crear): devuelve el id del dispositivo de la cookie. Con crear=true,
 * si no hay uno válido lo crea y setea la cookie; con crear=false devuelve null.
 */
export function dispositivo(req, res, next) {
  let cache;
  req.dispositivo = async (crear = false) => {
    if (cache !== undefined && (cache || !crear)) return cache;
    cache = await buscar(req.cookies?.[COOKIE_DISPOSITIVO]);
    if (!cache && crear) {
      const token = crypto.randomBytes(32).toString('base64url');
      const id = crypto.randomUUID();
      await query('INSERT INTO dispositivos (id, token_hash) VALUES ($1, $2)', [id, hash(token)]);
      res.cookie(COOKIE_DISPOSITIVO, token, {
        httpOnly: true, sameSite: 'strict', secure: config.esProduccion, maxAge: DOS_ANIOS, path: '/api',
      });
      cache = id;
    }
    return cache;
  };
  next();
}
