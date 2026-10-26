// Carga de una solicitud con todo lo que muestran el detalle, el PDF y los mails.
import { query } from '../db.js';

/** Detalle completo (con id y qr_version, de uso interno). where: 'numero' + dispositivo, o 'id'. */
export async function cargarDetalle({ numero, dispositivo, id }) {
  const filtro = id
    ? { join: '', where: 's.id = $1', params: [id] }
    : { join: 'JOIN dispositivo_solicitudes ds ON ds.solicitud_id = s.id AND ds.dispositivo_id = $2', where: 's.numero = $1', params: [numero, dispositivo] };
  if (!id && !dispositivo) return null;
  const { rows: [s] } = await query(
    `SELECT s.id, s.qr_version, s.numero, s.estado, s.categoria, s.solicitante_nombre, s.email, s.telefono,
            e.razon_social AS empresa, e.cuit, pk.nombre AS pack, pl.nombre AS planta, s.otra_locacion,
            s.contacto_interno, u.nombre AS autorizante, s.fecha_desde, s.fecha_hasta,
            to_char(s.hora_desde, 'HH24:MI') AS hora_desde, to_char(s.hora_hasta, 'HH24:MI') AS hora_hasta,
            s.motivo, s.contrato_ref, s.motivo_rechazo, s.induccion_fin, s.created_at, s.depurada_at
     FROM solicitudes s
     ${filtro.join}
     JOIN empresas e ON e.id = s.empresa_id
     JOIN packs pk ON pk.id = s.pack_id
     LEFT JOIN plantas pl ON pl.id = s.planta_id
     LEFT JOIN usuarios u ON u.id = s.autorizante_id
     WHERE ${filtro.where}`,
    filtro.params,
  );
  if (!s) return null;
  const [personas, vehiculos, documentos, eventos] = await Promise.all([
    query('SELECT nombre_apellido, tipo_doc, nro_doc, cargo FROM solicitud_personas WHERE solicitud_id = $1 ORDER BY id', [s.id]),
    query('SELECT patente, marca_modelo, vto_seguro, vto_vtv FROM solicitud_vehiculos WHERE solicitud_id = $1 ORDER BY id', [s.id]),
    query(`SELECT tipo, nombre_original AS nombre, estado_revision,
                  CASE WHEN estado_revision = 'observado' THEN observacion END AS observacion
           FROM documentos WHERE solicitud_id = $1 ORDER BY id`, [s.id]),
    // Al invitado: cambios de estado y lo que hizo él (reemplazos), no la revisión interna.
    query(`SELECT estado_nuevo AS estado, accion, CASE WHEN accion = 'reemplazar_documento' THEN detalle END AS detalle, created_at
           FROM solicitud_eventos WHERE solicitud_id = $1 AND (estado_nuevo IS NOT NULL OR accion IN ('depurada', 'reemplazar_documento'))
           ORDER BY created_at, id`, [s.id]),
  ]);
  return { ...s, personas: personas.rows, vehiculos: vehiculos.rows, documentos: documentos.rows, eventos: eventos.rows };
}
