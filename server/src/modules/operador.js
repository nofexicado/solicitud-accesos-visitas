// Panel de operador (solo canal interno, con sesión): HSE ve todas las solicitudes; el autorizante
// solo las de sus plantas o las que tiene asignadas. El alcance se filtra en el SQL y lo que queda
// afuera responde 404, igual que si no existiera.
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import {
  ESTADOS_APROBADOS, fechaLocalISO, normalizarCuit, normalizarDocumento, normalizarPatente, transicion,
} from '@accesos/shared';
import { config } from '../config.js';
import { query, transaccion } from '../db.js';
import { ErrorHttp } from '../middleware/errores.js';
import { encolar } from '../notificaciones/cola.js';
import { alCambiarEstado } from './avisos.js';
import { personasDentro, sinEgreso } from './control.js';

export const operador = Router();

const ZONA = 'America/Argentina/Ushuaia';
const esHse = (u) => u.roles.includes('hse');
const esAutorizante = (u) => u.roles.includes('autorizante');

/**
 * Condición SQL de alcance sobre la solicitud `s`. HSE: todas. Autorizante: plantas suyas o
 * asignadas a él. `n` es el número del primer parámetro libre.
 */
function alcance(u, n) {
  if (esHse(u)) return { sql: 'true', params: [] };
  return { sql: `(s.planta_id = ANY($${n}::int[]) OR s.autorizante_id = $${n + 1})`, params: [u.plantas, u.id] };
}

/** ¿Este autorizante puede decidir sobre esta solicitud? (sus plantas o asignada a él) */
const autorizaEsta = (u, s) => esAutorizante(u) && (u.plantas.includes(s.planta_id) || s.autorizante_id === u.id);
/** Nadie firma lo propio: ni lo que cargó con su usuario ni lo pedido con su mismo email. */
const esPropia = (u, s) => s.creado_por_usuario === u.id || s.email.trim().toLowerCase() === u.email.toLowerCase();

/**
 * Qué puede hacer el usuario con la solicitud y, si algo está trabado, por qué. La misma función
 * decide los botones del expediente y valida cada acción dentro de su transacción.
 */
export function permisos(u, s, { docs, validadoPor, asignado = null }) {
  const hse = esHse(u);
  const pendientes = docs.filter((d) => d.estado_revision !== 'aceptado').length;
  const propia = esPropia(u, s);
  const enAutorizacion = autorizaEsta(u, s) && s.estado === 'pendiente_autorizacion';
  // La autorización es de quien la tiene asignada; si no hay nadie, del primer autorizante que actúa.
  const deOtro = Boolean(s.autorizante_id) && s.autorizante_id !== u.id;
  const p = {
    tomar: hse && s.estado === 'enviada',
    tomar_autorizacion: enAutorizacion && !s.autorizante_id && !propia && validadoPor !== u.id,
    revisar_documentos: hse && s.estado === 'validacion_hse',
    validar: hse && s.estado === 'validacion_hse',
    rechazar: (hse && ['enviada', 'validacion_hse'].includes(s.estado)) || (enAutorizacion && !deOtro),
    asignar: hse && ['enviada', 'validacion_hse', 'pendiente_autorizacion'].includes(s.estado),
    aprobar: enAutorizacion,
    bloqueos: {},
  };
  if (p.validar) {
    if (propia) p.bloqueos.validar = 'Es una solicitud tuya: la tiene que validar otra persona de HSE.';
    else if (pendientes) p.bloqueos.validar = `Falta aceptar ${pendientes} ${pendientes === 1 ? 'documento' : 'documentos'}`;
    else if (!s.induccion_fin) p.bloqueos.validar = 'Falta la inducción';
  }
  if (p.aprobar) {
    if (deOtro) p.bloqueos.aprobar = `La tomó ${asignado ?? 'otro autorizante'}. Si hace falta cambiarla, HSE la reasigna.`;
    else if (propia) p.bloqueos.aprobar = 'Es una solicitud tuya: la tiene que aprobar otra persona.';
    else if (validadoPor === u.id) p.bloqueos.aprobar = 'La validaste como HSE: la tiene que aprobar otra persona.';
  }
  return p;
}

// ---------- KPIs ----------

operador.get('/kpis', async (req, res) => {
  const u = req.usuario;
  const a = alcance(u, 3);
  const hoy = fechaLocalISO();
  const manana = fechaLocalISO(new Date(Date.now() + 864e5));
  const { rows: [k] } = await query(
    `SELECT
       count(*) FILTER (WHERE s.estado IN ('enviada','validacion_hse'))::int AS en_hse,
       count(*) FILTER (WHERE s.estado IN ('enviada','validacion_hse') AND s.fecha_desde <= $2)::int AS en_hse_manana,
       count(*) FILTER (WHERE s.estado = 'pendiente_autorizacion')::int AS para_autorizar,
       count(*) FILTER (WHERE s.estado = 'pendiente_autorizacion' AND s.fecha_desde <= $2)::int AS para_autorizar_manana,
       count(*) FILTER (WHERE s.estado = 'pendiente_autorizacion' AND s.autorizante_id IS NULL)::int AS sin_autorizante,
       (SELECT count(*) FROM solicitud_eventos e JOIN solicitudes s ON s.id = e.solicitud_id
        WHERE e.accion = 'aprobar' AND (e.created_at AT TIME ZONE '${ZONA}')::date = $1 AND ${a.sql})::int AS aprobadas_hoy
     FROM solicitudes s WHERE ${a.sql}`,
    [hoy, manana, ...a.params],
  );
  // Personas dentro se cuenta desde portería (Fase 3).
  // Personas dentro: ingresos sin egreso en las plantas que el usuario ve.
  res.json({
    ...k,
    personas_dentro: (await personasDentro(u)).length,
    sin_egreso: esHse(u) ? (await sinEgreso()).personas.length : null,
    roles: u.roles,
  });
});

// ---------- Bandeja ----------

const VISTAS = {
  hse: { estados: ['enviada', 'validacion_hse'], orden: 's.fecha_desde, s.created_at' },
  autorizar: { estados: ['pendiente_autorizacion'], orden: 's.fecha_desde, s.created_at' },
  aprobadas: { estados: ESTADOS_APROBADOS, orden: 's.fecha_desde DESC, s.created_at DESC' },
  rechazadas: { estados: ['rechazada', 'vencida'], orden: 's.updated_at DESC' },
  todas: { estados: null, orden: 's.created_at DESC' },
};

const filtroBandeja = z.object({
  vista: z.enum(Object.keys(VISTAS)).default('todas'),
  orden: z.enum(['llegada', 'antiguedad']).default('llegada'),
  q: z.string().trim().max(60).default(''),
});

operador.get('/solicitudes', async (req, res) => {
  const u = req.usuario;
  const { vista, orden, q } = filtroBandeja.parse(req.query);
  const v = VISTAS[vista];
  const params = [];
  const donde = [];
  const a = alcance(u, 1);
  donde.push(a.sql);
  params.push(...a.params);
  if (v.estados) { params.push(v.estados); donde.push(`s.estado = ANY($${params.length})`); }
  if (q) {
    // N° o empresa por texto; CUIT, DNI y patente normalizados y exactos.
    params.push(`%${q.replace(/[%_\\]/g, '\\$&')}%`);
    const texto = params.length;
    const alternativas = [`s.numero ILIKE $${texto}`, `e.razon_social ILIKE $${texto}`];
    const cuit = normalizarCuit(q);
    if (cuit.length === 11) { params.push(cuit); alternativas.push(`e.cuit = $${params.length}`); }
    const doc = normalizarDocumento('pasaporte', q);
    if (doc.length >= 6) { params.push(doc); alternativas.push(`EXISTS (SELECT 1 FROM solicitud_personas p WHERE p.solicitud_id = s.id AND p.nro_doc = $${params.length})`); }
    const patente = normalizarPatente(q);
    if (patente.length >= 6) { params.push(patente); alternativas.push(`EXISTS (SELECT 1 FROM solicitud_vehiculos x WHERE x.solicitud_id = s.id AND x.patente = $${params.length})`); }
    donde.push(`(${alternativas.join(' OR ')})`);
  }
  const ordenSql = orden === 'antiguedad' && v.estados?.some((x) => ['enviada', 'validacion_hse', 'pendiente_autorizacion'].includes(x))
    ? 's.created_at, s.fecha_desde'
    : v.orden;
  const { rows } = await query(
    `SELECT s.numero, s.estado, s.categoria, e.razon_social AS empresa, pl.nombre AS planta, s.otra_locacion,
            pk.nombre AS pack, s.fecha_desde, s.fecha_hasta, s.created_at, s.autorizante_id IS NULL AS sin_autorizante,
            (SELECT count(*) FROM solicitud_personas WHERE solicitud_id = s.id)::int AS personas,
            (SELECT count(*) FROM solicitud_vehiculos WHERE solicitud_id = s.id)::int AS vehiculos,
            t.usuario_id AS tomada_por_id, tu.nombre AS tomada_por, s.autorizante_id, au.nombre AS autorizante,
            ${PLANTA_SIN_AUTORIZANTES} AS planta_sin_autorizantes
     FROM solicitudes s
     JOIN empresas e ON e.id = s.empresa_id
     JOIN packs pk ON pk.id = s.pack_id
     LEFT JOIN plantas pl ON pl.id = s.planta_id
     LEFT JOIN LATERAL (SELECT usuario_id FROM solicitud_eventos WHERE solicitud_id = s.id AND accion = 'tomar_hse'
                        ORDER BY created_at DESC, id DESC LIMIT 1) t ON s.estado = 'validacion_hse'
     LEFT JOIN usuarios tu ON tu.id = t.usuario_id
     LEFT JOIN usuarios au ON au.id = s.autorizante_id
     WHERE ${donde.join(' AND ')}
     ORDER BY ${ordenSql}
     LIMIT 200`,
    params,
  );
  res.json(rows);
});

// ---------- Expediente ----------

/** Planta conocida sin ningún autorizante activo (las de "otra locación" se asignan a mano). */
const PLANTA_SIN_AUTORIZANTES = `(s.planta_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM autorizante_plantas ap
  JOIN usuarios ua ON ua.id = ap.usuario_id AND ua.activo AND NOT ua.es_invitado
  JOIN usuario_roles ur ON ur.usuario_id = ua.id AND ur.rol = 'autorizante'
  WHERE ap.planta_id = s.planta_id))`;

const numeroValido = z.string().regex(/^ACC-\d{4}-\d{6}$/);

/** Solicitud dentro del alcance (opcionalmente bloqueada para actualizar). 404 si no está. */
async function solicitudEnAlcance(c, u, numero, { bloquear = false } = {}) {
  const a = alcance(u, 2);
  const { rows: [s] } = await c.query(
    `SELECT s.* FROM solicitudes s WHERE s.numero = $1 AND ${a.sql} ${bloquear ? 'FOR UPDATE' : ''}`,
    [numeroValido.parse(numero), ...a.params],
  );
  if (!s) throw new ErrorHttp(404, 'No encontramos esa solicitud o no está entre las tuyas.');
  return s;
}

const documentosDe = async (c, id) => (await c.query(
  `SELECT d.id, d.tipo, d.nombre_original, d.tamano, d.mime_real, d.archivo IS NOT NULL AS disponible,
          d.estado_revision, d.observacion, d.revisado_at, d.subido_at, u.nombre AS revisado_por
   FROM documentos d LEFT JOIN usuarios u ON u.id = d.revisado_por
   WHERE d.solicitud_id = $1 ORDER BY d.id`, [id])).rows;

const validadoPorDe = async (c, id) => (await c.query(
  "SELECT usuario_id FROM solicitud_eventos WHERE solicitud_id = $1 AND accion = 'validar_hse' ORDER BY created_at DESC, id DESC LIMIT 1",
  [id])).rows[0]?.usuario_id ?? null;

/** Lo que necesita permisos(): documentos, quién validó y el nombre del autorizante a cargo. */
async function contexto(c, s) {
  const [docs, validadoPor, asignado] = await Promise.all([
    documentosDe(c, s.id),
    validadoPorDe(c, s.id),
    s.autorizante_id ? c.query('SELECT nombre FROM usuarios WHERE id = $1', [s.autorizante_id]).then((r) => r.rows[0]?.nombre ?? null) : null,
  ]);
  return { docs, validadoPor, asignado };
}

operador.get('/solicitudes/:numero', async (req, res) => {
  const u = req.usuario;
  const base = await solicitudEnAlcance({ query }, u, req.params.numero);
  const [detalle, personas, vehiculos, ctx, eventos, candidatos, movimientos] = await Promise.all([
    query(
      `SELECT s.numero, s.estado, s.categoria, s.solicitante_nombre, s.email, s.telefono, e.razon_social AS empresa, e.cuit,
              pk.nombre AS pack, s.planta_id, pl.nombre AS planta, s.otra_locacion, s.contacto_interno, s.autorizante_id,
              au.nombre AS autorizante, s.fecha_desde, s.fecha_hasta, to_char(s.hora_desde, 'HH24:MI') AS hora_desde,
              to_char(s.hora_hasta, 'HH24:MI') AS hora_hasta, s.motivo, s.contrato_ref, s.motivo_rechazo,
              s.induccion_fin, s.epp_aceptado_at, s.created_at, s.depurada_at,
              ${PLANTA_SIN_AUTORIZANTES} AS planta_sin_autorizantes
       FROM solicitudes s JOIN empresas e ON e.id = s.empresa_id JOIN packs pk ON pk.id = s.pack_id
       LEFT JOIN plantas pl ON pl.id = s.planta_id LEFT JOIN usuarios au ON au.id = s.autorizante_id
       WHERE s.id = $1`, [base.id]),
    query(
      `SELECT p.id, p.nombre_apellido, p.tipo_doc, p.nro_doc, p.cargo, (u.tipo = 'ingreso') IS TRUE AS dentro
       FROM solicitud_personas p
       LEFT JOIN LATERAL (SELECT tipo FROM movimientos m WHERE m.persona_id = p.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) u ON true
       WHERE p.solicitud_id = $1 ORDER BY p.id`, [base.id]),
    query('SELECT patente, marca_modelo, vto_seguro, vto_vtv FROM solicitud_vehiculos WHERE solicitud_id = $1 ORDER BY id', [base.id]),
    contexto({ query }, base),
    query(
      `SELECT ev.accion, ev.estado_anterior, ev.estado_nuevo, ev.actor, ev.detalle, ev.created_at, us.nombre AS usuario
       FROM solicitud_eventos ev LEFT JOIN usuarios us ON us.id = ev.usuario_id
       WHERE ev.solicitud_id = $1 ORDER BY ev.created_at, ev.id`, [base.id]),
    // Para asignar: autorizantes de la planta (o todos si es "otra locación").
    query(
      `SELECT DISTINCT u.id, u.nombre FROM usuarios u JOIN usuario_roles r ON r.usuario_id = u.id AND r.rol = 'autorizante'
       LEFT JOIN autorizante_plantas ap ON ap.usuario_id = u.id
       WHERE u.activo AND NOT u.es_invitado AND ($1::int IS NULL OR ap.planta_id = $1)
       ORDER BY u.nombre`, [base.planta_id]),
    // Ingresos y egresos de cada persona, con quién los registró.
    query(
      `SELECT m.id, m.tipo, m.created_at, m.origen, m.observacion, p.nombre_apellido, p.tipo_doc, p.nro_doc,
              v.patente, pl.nombre AS planta, us.nombre AS usuario
       FROM movimientos m JOIN solicitud_personas p ON p.id = m.persona_id
       LEFT JOIN solicitud_vehiculos v ON v.id = m.vehiculo_id LEFT JOIN plantas pl ON pl.id = m.planta_id
       LEFT JOIN usuarios us ON us.id = m.usuario_id
       WHERE m.solicitud_id = $1 ORDER BY m.created_at, m.id`, [base.id]),
  ]);
  const s = detalle.rows[0];
  res.json({
    ...s,
    personas: personas.rows,
    vehiculos: vehiculos.rows,
    documentos: ctx.docs,
    eventos: eventos.rows,
    movimientos: movimientos.rows,
    autorizantes: candidatos.rows,
    permisos: permisos(u, base, ctx),
  });
});

// Descarga autenticada de un adjunto: siempre como archivo (nunca se interpreta en el navegador).
operador.get('/documentos/:id/archivo', async (req, res) => {
  const u = req.usuario;
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const a = alcance(u, 2);
  const { rows: [d] } = await query(
    `SELECT d.archivo, d.nombre_original, d.mime_real FROM documentos d JOIN solicitudes s ON s.id = d.solicitud_id
     WHERE d.id = $1 AND ${a.sql}`, [id, ...a.params]);
  if (!d) throw new ErrorHttp(404, 'No encontramos ese documento.');
  if (!d.archivo) throw new ErrorHttp(410, 'El archivo se borró por la política de retención.');
  const nombre = d.nombre_original.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_') || 'documento';
  res.set('Cache-Control', 'private, no-store');
  res.attachment(nombre);
  res.type(d.mime_real);
  res.sendFile(path.join(config.dirs.uploads, d.archivo), { dotfiles: 'deny', headers: { 'X-Content-Type-Options': 'nosniff' } });
});

// ---------- Acciones ----------

const conMotivo = z.object({
  motivo: z.string({ error: 'Escribí el motivo' }).trim().min(10, 'Contá el motivo con un poco más de detalle (10 caracteres o más)').max(1000),
});

/** Cambia el estado con su evento y sus mails, dentro de la transacción. */
async function cambiarEstado(c, req, s, accion, { motivo = null, actor } = {}) {
  const t = transicion(accion, s.estado);
  if (!t) throw new ErrorHttp(409, 'La solicitud cambió de estado mientras la mirabas. Recargá para ver cómo está.');
  await c.query(
    `UPDATE solicitudes SET estado = $2, updated_at = now(),
            motivo_rechazo = CASE WHEN $2 = 'rechazada' THEN $3 ELSE motivo_rechazo END,
            cerrada_at = CASE WHEN $2 = 'rechazada' THEN now() ELSE cerrada_at END,
            autorizante_id = CASE WHEN $4 IN ('aprobar', 'rechazar') THEN COALESCE(autorizante_id, $5) ELSE autorizante_id END
     WHERE id = $1`,
    [s.id, t.hacia, motivo, accion, req.usuario.id],
  );
  // El motivo queda en la solicitud (se depura con ella), nunca en el historial.
  await c.query(
    `INSERT INTO solicitud_eventos (solicitud_id, estado_anterior, estado_nuevo, accion, usuario_id, actor, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [s.id, s.estado, t.hacia, accion, req.usuario.id, actor, req.ip],
  );
  await alCambiarEstado(c, s.id, t.hacia);
  return t.hacia;
}

/** Corre una acción sobre la solicitud bloqueada, con los permisos recalculados adentro. */
async function accion(req, res, hacer) {
  const estado = await transaccion(async (c) => {
    const s = await solicitudEnAlcance(c, req.usuario, req.params.numero, { bloquear: true });
    const ctx = await contexto(c, s);
    return hacer(c, s, permisos(req.usuario, s, ctx), ctx.docs);
  });
  res.json({ estado });
}

const negar = (mensaje = 'Esa acción no corresponde en el estado actual de la solicitud. Recargá para ver cómo está.') => {
  throw new ErrorHttp(409, mensaje);
};

operador.post('/solicitudes/:numero/tomar', (req, res) => accion(req, res, async (c, s, p) => {
  if (!p.tomar) negar();
  return cambiarEstado(c, req, s, 'tomar_hse', { actor: 'hse' });
}));

operador.post('/solicitudes/:numero/validar-hse', (req, res) => accion(req, res, async (c, s, p) => {
  if (!p.validar) negar();
  if (p.bloqueos.validar) throw new ErrorHttp(esPropia(req.usuario, s) ? 403 : 409, p.bloqueos.validar);
  return cambiarEstado(c, req, s, 'validar_hse', { actor: 'hse' });
}));

operador.post('/solicitudes/:numero/aprobar', (req, res) => accion(req, res, async (c, s, p) => {
  if (!p.aprobar) negar();
  if (p.bloqueos.aprobar) throw new ErrorHttp(403, p.bloqueos.aprobar);
  return cambiarEstado(c, req, s, 'aprobar', { actor: 'autorizante' });
}));

// El autorizante la toma para él: los demás de la planta ven quién la tiene y no pueden decidirla.
operador.post('/solicitudes/:numero/tomar-autorizacion', (req, res) => accion(req, res, async (c, s, p) => {
  if (s.autorizante_id && s.autorizante_id !== req.usuario.id) negar(p.bloqueos.aprobar);
  if (!p.tomar_autorizacion) negar();
  await c.query('UPDATE solicitudes SET autorizante_id = $2, updated_at = now() WHERE id = $1', [s.id, req.usuario.id]);
  await c.query(
    `INSERT INTO solicitud_eventos (solicitud_id, accion, usuario_id, actor, ip) VALUES ($1, 'tomar_autorizacion', $2, 'autorizante', $3)`,
    [s.id, req.usuario.id, req.ip],
  );
  return s.estado;
}));

operador.post('/solicitudes/:numero/rechazar', (req, res) => accion(req, res, async (c, s, p) => {
  const { motivo } = conMotivo.parse(req.body);
  if (!p.rechazar) negar(p.bloqueos.aprobar);
  const comoHse = s.estado !== 'pendiente_autorizacion';
  return cambiarEstado(c, req, s, comoHse ? 'rechazar_hse' : 'rechazar', { motivo, actor: comoHse ? 'hse' : 'autorizante' });
}));

const asignacion = z.object({ usuario_id: z.number({ error: 'Elegí a quién asignarla' }).int().positive() });

operador.post('/solicitudes/:numero/asignar-autorizante', (req, res) => accion(req, res, async (c, s, p) => {
  const { usuario_id: elegido } = asignacion.parse(req.body);
  if (!p.asignar) negar();
  const { rowCount } = await c.query(
    `SELECT 1 FROM usuarios u JOIN usuario_roles r ON r.usuario_id = u.id AND r.rol = 'autorizante'
     WHERE u.id = $1 AND u.activo AND NOT u.es_invitado
       AND ($2::int IS NULL OR EXISTS (SELECT 1 FROM autorizante_plantas ap WHERE ap.usuario_id = u.id AND ap.planta_id = $2))`,
    [elegido, s.planta_id],
  );
  if (!rowCount) throw new ErrorHttp(422, 'Esa persona no autoriza visitas a esta planta.', { campos: { usuario_id: 'Elegí un autorizante de la planta' } });
  await c.query('UPDATE solicitudes SET autorizante_id = $2, updated_at = now() WHERE id = $1', [s.id, elegido]);
  await c.query(
    `INSERT INTO solicitud_eventos (solicitud_id, accion, usuario_id, actor, ip) VALUES ($1, 'asignar_autorizante', $2, 'hse', $3)`,
    [s.id, req.usuario.id, req.ip],
  );
  // Si ya espera autorización, el nuevo autorizante recibe el aviso ahora.
  if (s.estado === 'pendiente_autorizacion' && s.autorizante_id !== elegido) {
    const { rows: [a] } = await c.query('SELECT email FROM usuarios WHERE id = $1', [elegido]);
    await encolar(c, { destinatario: a.email, plantilla: 'aviso_autorizante', solicitudId: s.id });
  }
  return s.estado;
}));

const revision = z.discriminatedUnion('estado', [
  z.object({ estado: z.literal('aceptado') }),
  z.object({
    estado: z.literal('observado'),
    observacion: z.string({ error: 'Escribí qué hay que corregir' }).trim().min(5, 'Escribí qué hay que corregir').max(500),
  }),
], { error: 'Elegí aceptar u observar' });

operador.patch('/documentos/:id', async (req, res) => {
  const u = req.usuario;
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const cambio = revision.parse(req.body);
  const documentos = await transaccion(async (c) => {
    const a = alcance(u, 2);
    const { rows: [d] } = await c.query(
      `SELECT d.id, d.tipo, s.id AS solicitud_id, s.numero, s.email FROM documentos d JOIN solicitudes s ON s.id = d.solicitud_id
       WHERE d.id = $1 AND ${a.sql} FOR UPDATE OF d, s`, [id, ...a.params]);
    if (!d) throw new ErrorHttp(404, 'No encontramos ese documento.');
    const s = await solicitudEnAlcance(c, u, d.numero);
    const p = permisos(u, s, { docs: [], validadoPor: null });
    if (!p.revisar_documentos) {
      negar(s.estado === 'enviada' ? 'Tomá la solicitud antes de revisar los documentos.' : undefined);
    }
    await c.query(
      `UPDATE documentos SET estado_revision = $2, observacion = $3, revisado_por = $4, revisado_at = now() WHERE id = $1`,
      [d.id, cambio.estado, cambio.estado === 'observado' ? cambio.observacion : null, u.id],
    );
    // En el historial va el tipo y el resultado; la observación (texto libre) no.
    await c.query(
      `INSERT INTO solicitud_eventos (solicitud_id, accion, usuario_id, actor, detalle, ip) VALUES ($1, 'revisar_documento', $2, 'hse', $3, $4)`,
      [d.solicitud_id, u.id, { documento: d.tipo, resultado: cambio.estado }, req.ip],
    );
    // Al solicitante le llega la observación con el enlace para reemplazar el archivo.
    if (cambio.estado === 'observado') {
      await encolar(c, { destinatario: d.email, plantilla: 'documento_observado', solicitudId: d.solicitud_id, payload: { documento: d.tipo, observacion: cambio.observacion } });
    }
    return documentosDe(c, d.solicitud_id);
  });
  res.json(documentos);
});
