// Control de acceso en planta (solo canal interno, con sesión). Recepción (rol porteria, o HSE)
// escanea el QR o busca el pase, ve si está habilitado y registra ingreso y egreso por persona.
// Personas en planta (evacuación) la ven también los autorizantes de sus plantas; el cierre de los
// egresos que faltaron es de HSE.
import { Router } from 'express';
import { z } from 'zod';
import { fechaLocalISO, normalizarDocumento, normalizarPatente, transicion, ZONA_HORARIA } from '@accesos/shared';
import { leerConfiguracion, query, transaccion } from '../db.js';
import { ErrorHttp } from '../middleware/errores.js';
import { requireRol } from './auth.js';
import { RESULTADO, validarPase } from './validacion.js';

export const control = Router();

const esHse = (u) => u.roles.includes('hse');

/** Plantas donde el usuario recibe: HSE en todas; recepción en las asignadas. */
async function plantasDeRecepcion(u) {
  const { rows } = esHse(u)
    ? await query('SELECT pl.id, pl.nombre, pk.nombre AS pack FROM plantas pl JOIN packs pk ON pk.id = pl.pack_id WHERE pl.activo ORDER BY pk.orden, pl.orden')
    : await query(
      `SELECT pl.id, pl.nombre, pk.nombre AS pack FROM recepcion_plantas rp
       JOIN plantas pl ON pl.id = rp.planta_id AND pl.activo JOIN packs pk ON pk.id = pl.pack_id
       WHERE rp.usuario_id = $1 ORDER BY pk.orden, pl.orden`, [u.id]);
  return rows;
}

/** Plantas que el usuario puede ver en "Personas en planta": HSE todas, recepción y autorizantes las suyas. */
async function plantasVisibles(u) {
  if (esHse(u)) return null; // todas
  const { rows } = await query(
    `SELECT planta_id FROM recepcion_plantas WHERE usuario_id = $1
     UNION SELECT planta_id FROM autorizante_plantas WHERE usuario_id = $1`, [u.id]);
  return rows.map((r) => r.planta_id);
}

async function exigirPlanta(u, plantaId) {
  const plantas = await plantasDeRecepcion(u);
  const p = plantas.find((x) => x.id === plantaId);
  if (!p) throw new ErrorHttp(403, 'No recibís en esa planta.');
  return p;
}

/** Último movimiento de cada persona (subconsulta reutilizable). */
const ULTIMO = `SELECT DISTINCT ON (m.persona_id) m.id, m.persona_id, m.solicitud_id, m.tipo, m.planta_id, m.vehiculo_id, m.created_at
  FROM movimientos m ORDER BY m.persona_id, m.created_at DESC, m.id DESC`;

async function personasDe(c, solicitudId) {
  const { rows } = await c.query(
    `SELECT p.id::int, p.nombre_apellido, p.tipo_doc, p.nro_doc, p.cargo,
            (u.tipo = 'ingreso') AS dentro, CASE WHEN u.tipo = 'ingreso' THEN u.created_at END AS desde,
            u.planta_id AS planta_actual
     FROM solicitud_personas p
     LEFT JOIN LATERAL (SELECT tipo, created_at, planta_id FROM movimientos m WHERE m.persona_id = p.id
                        ORDER BY m.created_at DESC, m.id DESC LIMIT 1) u ON true
     WHERE p.solicitud_id = $1 ORDER BY p.id`, [solicitudId]);
  return rows.map((r) => ({ ...r, dentro: Boolean(r.dentro) }));
}

const vehiculosDe = async (c, solicitudId) => (await c.query(
  'SELECT id::int, patente, marca_modelo, vto_seguro, vto_vtv FROM solicitud_vehiculos WHERE solicitud_id = $1 ORDER BY id', [solicitudId])).rows;

/** Lo que ve recepción: el resultado y, si el pase existe, quién viene y quién ya está adentro. */
async function respuestaRecepcion(c, v) {
  const s = v.solicitud;
  if (!s) return { resultado: v.resultado, habilitado: false, motivo: v.motivo, avisos: [], solicitud: null, personas: [], vehiculos: [] };
  const [personas, vehiculos] = await Promise.all([personasDe(c, s.id), vehiculosDe(c, s.id)]);
  return {
    resultado: v.resultado,
    habilitado: v.habilitado,
    motivo: v.motivo,
    avisos: v.avisos,
    solicitud: {
      numero: s.numero, estado: s.estado, empresa: s.empresa, categoria: s.categoria,
      planta: s.planta ?? (s.otra_locacion ? `Otra locación: ${s.otra_locacion}` : null), pack: s.pack,
      fecha_desde: s.fecha_desde, fecha_hasta: s.fecha_hasta, hora_desde: s.hora_desde, hora_hasta: s.hora_hasta,
      contacto_interno: s.contacto_interno,
    },
    personas,
    vehiculos: vehiculos.map((x) => ({ ...x, vencido: x.vto_seguro < fechaLocalISO() || x.vto_vtv < fechaLocalISO() })),
  };
}

const plantaParam = z.coerce.number({ error: 'Elegí la planta' }).int().positive();

// ---------- Recepción ----------

const recepcion = requireRol('porteria', 'hse');

control.get('/plantas', recepcion, async (req, res) => res.json(await plantasDeRecepcion(req.usuario)));

// Lo que leyó la cámara (o el lector): la URL del QR o el token. Ver docs/validacion-qr.md.
control.post('/validar', recepcion, async (req, res) => {
  const { codigo, planta_id: plantaId } = z.object({ codigo: z.string().trim().min(1).max(600), planta_id: plantaParam }).parse(req.body);
  await exigirPlanta(req.usuario, plantaId);
  const v = await validarPase({ codigo }, { plantaId });
  res.set('Cache-Control', 'no-store').json(await respuestaRecepcion({ query }, v));
});

control.get('/pases/:numero', recepcion, async (req, res) => {
  const numero = z.string().regex(/^ACC-\d{4}-\d{6}$/).parse(req.params.numero);
  const plantaId = plantaParam.parse(req.query.planta_id);
  await exigirPlanta(req.usuario, plantaId);
  const v = await validarPase({ numero }, { plantaId });
  if (v.resultado === RESULTADO.DESCONOCIDO) throw new ErrorHttp(404, v.motivo);
  res.set('Cache-Control', 'no-store').json(await respuestaRecepcion({ query }, v));
});

// Si el QR no se puede leer: por N° (completo o los últimos 6 dígitos), DNI/pasaporte o patente.
control.get('/buscar', recepcion, async (req, res) => {
  const q = z.string().trim().min(3, 'Escribí al menos 3 caracteres').max(30).parse(req.query.q ?? '');
  const plantaId = plantaParam.parse(req.query.planta_id);
  await exigirPlanta(req.usuario, plantaId);
  const limpio = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const numero = /^\d{1,6}$/.test(limpio) ? `ACC-${fechaLocalISO().slice(0, 4)}-${limpio.padStart(6, '0')}` : q.toUpperCase();
  const { rows } = await query(
    `SELECT DISTINCT s.numero, s.created_at FROM solicitudes s
     LEFT JOIN solicitud_personas p ON p.solicitud_id = s.id
     LEFT JOIN solicitud_vehiculos v ON v.solicitud_id = s.id
     WHERE s.depurada_at IS NULL AND s.fecha_hasta >= $4::date - 7
       AND (s.numero = $1 OR p.nro_doc = $2 OR v.patente = $3)
     ORDER BY s.created_at DESC LIMIT 10`,
    [numero, normalizarDocumento('pasaporte', q), normalizarPatente(q), fechaLocalISO()],
  );
  const resultados = [];
  for (const r of rows) {
    const v = await validarPase({ numero: r.numero }, { plantaId });
    resultados.push({ numero: r.numero, resultado: v.resultado, motivo: v.motivo, empresa: v.solicitud.empresa, planta: v.solicitud.planta, fecha_desde: v.solicitud.fecha_desde, fecha_hasta: v.solicitud.fecha_hasta });
  }
  // Primero los que pueden entrar.
  resultados.sort((a, b) => Number(b.resultado === RESULTADO.HABILITADO) - Number(a.resultado === RESULTADO.HABILITADO));
  res.json(resultados);
});

const movimiento = z.object({
  numero: z.string().regex(/^ACC-\d{4}-\d{6}$/),
  planta_id: plantaParam,
  tipo: z.enum(['ingreso', 'egreso']),
  persona_ids: z.array(z.number().int().positive()).min(1, 'Marcá al menos una persona').max(200),
  vehiculo_id: z.number().int().positive().nullable().default(null),
});

/** Cambia el estado de la solicitud si corresponde y deja el evento con los movimientos (sin datos personales). */
async function asentar(c, req, s, { accion, ids, plantaId, actor }) {
  let nuevo = null;
  if (accion === 'registrar_ingreso' && ['aprobada', 'egreso'].includes(s.estado)) nuevo = transicion('registrar_ingreso', s.estado)?.hacia ?? null;
  if (accion !== 'registrar_ingreso' && s.estado === 'ingreso') {
    const { rowCount } = await c.query(`SELECT 1 FROM (${ULTIMO}) u WHERE u.solicitud_id = $1 AND u.tipo = 'ingreso'`, [s.id]);
    if (!rowCount) nuevo = 'egreso';
  }
  if (nuevo) {
    // Con alguien adentro la solicitud no está cerrada; cuando sale el último, empieza a contar la retención.
    await c.query(
      `UPDATE solicitudes SET estado = $2, updated_at = now(), cerrada_at = CASE WHEN $2 = 'egreso' THEN now() ELSE NULL END WHERE id = $1`,
      [s.id, nuevo]);
  }
  await c.query(
    `INSERT INTO solicitud_eventos (solicitud_id, estado_anterior, estado_nuevo, accion, usuario_id, actor, detalle, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [s.id, nuevo ? s.estado : null, nuevo, accion, req.usuario.id, actor, { movimientos: ids, planta: plantaId }, req.ip]);
}

control.post('/movimientos', recepcion, async (req, res) => {
  const m = movimiento.parse(req.body);
  await exigirPlanta(req.usuario, m.planta_id);
  const respuesta = await transaccion(async (c) => {
    const { rows: [s] } = await c.query('SELECT id, estado FROM solicitudes WHERE numero = $1 FOR UPDATE', [m.numero]);
    if (!s) throw new ErrorHttp(404, 'No encontramos ese pase.');
    const personas = await personasDe(c, s.id);
    const elegidas = m.persona_ids.map((id) => personas.find((p) => p.id === id));
    if (elegidas.some((p) => !p)) throw new ErrorHttp(422, 'Alguna de las personas no es de este pase.');

    if (m.tipo === 'ingreso') {
      // Para entrar, el pase tiene que estar habilitado ahora y en esta planta.
      const v = await validarPase({ numero: m.numero }, { plantaId: m.planta_id, consulta: (t, p) => c.query(t, p) });
      if (!v.habilitado) throw new ErrorHttp(409, `No habilitado: ${v.motivo}`);
      const adentro = elegidas.filter((p) => p.dentro);
      if (adentro.length) throw new ErrorHttp(409, `${adentro.map((p) => p.nombre_apellido).join(', ')} ya ${adentro.length === 1 ? 'está' : 'están'} adentro.`);
      if (m.vehiculo_id && !(await vehiculosDe(c, s.id)).some((x) => x.id === m.vehiculo_id)) throw new ErrorHttp(422, 'Ese vehículo no es de este pase.');
    } else {
      // Salir se puede siempre (aunque el pase haya vencido mientras estaba adentro).
      const afuera = elegidas.filter((p) => !p.dentro);
      if (afuera.length) throw new ErrorHttp(409, `${afuera.map((p) => p.nombre_apellido).join(', ')} no ${afuera.length === 1 ? 'figura' : 'figuran'} adentro.`);
    }

    const ids = [];
    for (const p of elegidas) {
      const vehiculo = m.tipo === 'egreso' ? null : m.vehiculo_id;
      const { rows: [nuevo] } = await c.query(
        `INSERT INTO movimientos (solicitud_id, persona_id, vehiculo_id, tipo, pack_id, planta_id, usuario_id, origen, ip)
         SELECT $1, $2, $3, $4, pl.pack_id, pl.id, $6, 'recepcion', $7 FROM plantas pl WHERE pl.id = $5 RETURNING id`,
        [s.id, p.id, vehiculo, m.tipo, m.planta_id, req.usuario.id, req.ip]);
      ids.push(Number(nuevo.id));
    }
    const actor = req.usuario.roles.includes('porteria') ? 'porteria' : 'hse';
    await asentar(c, req, s, { accion: m.tipo === 'ingreso' ? 'registrar_ingreso' : 'registrar_egreso', ids, plantaId: m.planta_id, actor });
    const v = await validarPase({ numero: m.numero }, { plantaId: m.planta_id, consulta: (t, p) => c.query(t, p) });
    return respuestaRecepcion(c, v);
  });
  res.status(201).json(respuesta);
});

// ---------- Personas en planta (evacuación) ----------

const PERSONAS_DENTRO = `
  SELECT u.id::int AS movimiento_id, u.created_at AS desde, u.planta_id, pl.nombre AS planta, pk.nombre AS pack,
         p.id::int AS persona_id, p.nombre_apellido, p.tipo_doc, p.nro_doc, p.cargo,
         s.numero, s.fecha_hasta, s.contacto_interno, s.telefono, e.razon_social AS empresa, v.patente
  FROM (${ULTIMO}) u
  JOIN solicitud_personas p ON p.id = u.persona_id
  JOIN solicitudes s ON s.id = u.solicitud_id
  JOIN empresas e ON e.id = s.empresa_id
  LEFT JOIN plantas pl ON pl.id = u.planta_id
  LEFT JOIN packs pk ON pk.id = pl.pack_id
  LEFT JOIN solicitud_vehiculos v ON v.id = u.vehiculo_id
  WHERE u.tipo = 'ingreso'`;

export async function personasDentro(u, { plantaId = null } = {}) {
  const visibles = await plantasVisibles(u);
  const { rows } = await query(
    `${PERSONAS_DENTRO} AND ($1::int[] IS NULL OR u.planta_id = ANY($1)) AND ($2::int IS NULL OR u.planta_id = $2)
     ORDER BY pk.nombre, pl.nombre, e.razon_social, p.nombre_apellido`,
    [visibles, plantaId]);
  return rows;
}

control.get('/en-planta', requireRol('hse', 'autorizante', 'porteria'), async (req, res) => {
  const plantaId = req.query.planta_id ? plantaParam.parse(req.query.planta_id) : null;
  res.set('Cache-Control', 'no-store').json({ generado: new Date().toISOString(), personas: await personasDentro(req.usuario, { plantaId }) });
});

// ---------- Sin egreso al final del día (HSE) ----------

/** Adentro desde un día anterior, o de hoy pasada la hora de cierre del día (configuracion.cierre_dia_hora). */
export async function sinEgreso() {
  const hora = String(await leerConfiguracion('cierre_dia_hora', '20:00'));
  const ahora = new Date().toLocaleTimeString('es-AR', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const { rows } = await query(
    `${PERSONAS_DENTRO} AND ((u.created_at AT TIME ZONE '${ZONA_HORARIA}')::date < $1 OR $2)
     ORDER BY u.created_at`,
    [fechaLocalISO(), ahora >= hora]);
  return { hora_cierre: hora, personas: rows };
}

control.get('/sin-egreso', requireRol('hse'), async (_req, res) => {
  res.set('Cache-Control', 'no-store').json(await sinEgreso());
});

const cierre = z.object({
  movimiento_ids: z.array(z.number().int().positive()).min(1, 'Marcá al menos una persona').max(500),
  motivo: z.string({ error: 'Escribí cómo se confirmó la salida' }).trim().min(5, 'Escribí cómo se confirmó la salida').max(500),
});

// HSE cierra el egreso que no se registró: queda como movimiento aparte, con su motivo.
control.post('/sin-egreso/cerrar', requireRol('hse'), async (req, res) => {
  const { movimiento_ids: ids, motivo } = cierre.parse(req.body);
  const cerrados = await transaccion(async (c) => {
    const { rows: abiertos } = await c.query(`SELECT * FROM (${ULTIMO}) u WHERE u.id = ANY($1) AND u.tipo = 'ingreso'`, [ids]);
    if (abiertos.length !== ids.length) throw new ErrorHttp(409, 'Alguna de esas personas ya tiene egreso. Recargá la lista.');
    const porSolicitud = new Map();
    for (const a of abiertos) {
      const { rows: [n] } = await c.query(
        `INSERT INTO movimientos (solicitud_id, persona_id, tipo, pack_id, planta_id, usuario_id, origen, observacion, ip)
         SELECT $1, $2, 'egreso', pl.pack_id, pl.id, $4, 'cierre_hse', $5, $6 FROM plantas pl WHERE pl.id = $3 RETURNING id`,
        [a.solicitud_id, a.persona_id, a.planta_id, req.usuario.id, motivo, req.ip]);
      porSolicitud.set(a.solicitud_id, [...(porSolicitud.get(a.solicitud_id) ?? []), { id: Number(n.id), planta: a.planta_id }]);
    }
    for (const [solicitudId, movs] of porSolicitud) {
      const { rows: [s] } = await c.query('SELECT id, estado FROM solicitudes WHERE id = $1 FOR UPDATE', [solicitudId]);
      await asentar(c, req, s, { accion: 'cerrar_egreso', ids: movs.map((x) => x.id), plantaId: movs[0].planta, actor: 'hse' });
    }
    return abiertos.length;
  });
  res.json({ cerrados });
});
