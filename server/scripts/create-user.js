// Alta o actualización de un operador (HSE, autorizante, portería, admin).
//   node scripts/create-user.js --email laura.benitez@ejemplo.com --nombre "Laura Benítez" \
//        --roles autorizante --plantas norte-1,norte-2 [--password "…"]
// --plantas son las plantas que autoriza (autorizante) o donde recibe (porteria).
// Sin --password, a un usuario nuevo se le genera una contraseña y se muestra una sola vez; a uno
// existente se le conserva la que tiene. --roles y --plantas reemplazan los que tuviera.
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';
import { pool, transaccion } from '../src/db.js';
import { COSTO_BCRYPT } from '../src/modules/auth.js';

const ROLES_OPERADOR = ['hse', 'autorizante', 'porteria', 'admin'];
const USO = 'Uso: node scripts/create-user.js --email EMAIL --nombre "Nombre Apellido" --roles hse,autorizante [--plantas codigo,codigo] [--password CLAVE] [--desactivar]';

const { values: a } = parseArgs({
  options: {
    email: { type: 'string' }, nombre: { type: 'string' }, roles: { type: 'string' },
    plantas: { type: 'string' }, password: { type: 'string' }, desactivar: { type: 'boolean' },
  },
});
const lista = (v) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);

function fallar(mensaje) {
  console.error(`${mensaje}\n${USO}`);
  process.exit(1);
}

const email = a.email?.trim().toLowerCase();
const roles = lista(a.roles);
const plantas = lista(a.plantas);
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fallar('Falta un --email válido.');
if (!a.desactivar) {
  if (!a.nombre?.trim()) fallar('Falta --nombre.');
  if (!roles.length) fallar('Falta --roles.');
  const desconocidos = roles.filter((r) => !ROLES_OPERADOR.includes(r));
  if (desconocidos.length) fallar(`Roles desconocidos: ${desconocidos.join(', ')}. Válidos: ${ROLES_OPERADOR.join(', ')}.`);
  if (roles.some((r) => ['autorizante', 'porteria'].includes(r)) && !plantas.length) fallar('Autorizante y recepción (porteria) necesitan --plantas (códigos de planta).');
  if (plantas.length && !roles.some((r) => ['autorizante', 'porteria'].includes(r))) fallar('--plantas solo aplica a los roles autorizante y porteria.');
}
if (a.password !== undefined && a.password.length < 12) fallar('La contraseña tiene que tener 12 caracteres o más.');

try {
  const r = await transaccion(async (c) => {
    if (a.desactivar) {
      const { rows: [u] } = await c.query('UPDATE usuarios SET activo = false WHERE lower(email) = $1 AND NOT es_invitado RETURNING id', [email]);
      if (!u) throw new Error(`No existe ${email}`);
      // Cierra sus sesiones abiertas.
      await c.query('UPDATE sesiones SET revocada = true WHERE usuario_id = $1', [u.id]);
      return { accion: 'desactivado' };
    }
    const { rows: plantasDb } = await c.query('SELECT id, codigo FROM plantas WHERE codigo = ANY($1) AND activo', [plantas]);
    const faltan = plantas.filter((p) => !plantasDb.some((x) => x.codigo === p));
    if (faltan.length) {
      const { rows: todas } = await c.query('SELECT codigo FROM plantas WHERE activo ORDER BY codigo');
      throw new Error(`Plantas desconocidas: ${faltan.join(', ')}. Válidas: ${todas.map((x) => x.codigo).join(', ')}.`);
    }

    const { rows: [existente] } = await c.query('SELECT id FROM usuarios WHERE lower(email) = $1', [email]);
    const generada = !existente && a.password === undefined ? crypto.randomBytes(12).toString('base64url') : null;
    const clave = a.password ?? generada;
    const hash = clave ? await bcrypt.hash(clave, COSTO_BCRYPT) : null;

    let id;
    if (existente) {
      id = existente.id;
      await c.query(
        `UPDATE usuarios SET nombre = $2, activo = true, es_invitado = false,
                password_hash = COALESCE($3, password_hash), intentos_fallidos = 0, bloqueado_hasta = NULL
         WHERE id = $1`, [id, a.nombre.trim(), hash]);
      if (hash) await c.query('UPDATE sesiones SET revocada = true WHERE usuario_id = $1', [id]);
    } else {
      ({ rows: [{ id }] } = await c.query(
        'INSERT INTO usuarios (email, nombre, password_hash) VALUES ($1, $2, $3) RETURNING id', [email, a.nombre.trim(), hash]));
    }
    await c.query('DELETE FROM usuario_roles WHERE usuario_id = $1', [id]);
    for (const rol of roles) await c.query('INSERT INTO usuario_roles (usuario_id, rol) VALUES ($1, $2)', [id, rol]);
    await c.query('DELETE FROM autorizante_plantas WHERE usuario_id = $1', [id]);
    await c.query('DELETE FROM recepcion_plantas WHERE usuario_id = $1', [id]);
    for (const p of plantasDb) {
      if (roles.includes('autorizante')) await c.query('INSERT INTO autorizante_plantas (usuario_id, planta_id) VALUES ($1, $2)', [id, p.id]);
      if (roles.includes('porteria')) await c.query('INSERT INTO recepcion_plantas (usuario_id, planta_id) VALUES ($1, $2)', [id, p.id]);
    }
    await c.query(
      `INSERT INTO auditoria_admin (entidad, entidad_id, accion, despues) VALUES ('usuario', $1, $2, $3)`,
      [String(id), existente ? 'actualizar_cli' : 'crear_cli', { roles, plantas }],
    );
    return { accion: existente ? 'actualizado' : 'creado', generada };
  });
  console.log(`${email}: ${r.accion}${roles.length ? ` · roles ${roles.join(', ')}` : ''}${plantas.length ? ` · plantas ${plantas.join(', ')}` : ''}`);
  if (r.generada) console.log(`Contraseña generada (se muestra una sola vez): ${r.generada}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
