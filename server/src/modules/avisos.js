// Mails por evento de la solicitud. Se encolan dentro de la misma transacción que cambia el estado,
// así un mail nunca queda sin su solicitud ni al revés. El worker los envía después.
import { encolar } from '../notificaciones/cola.js';

/** HSE: usuarios activos con rol hse (y los roles extra pedidos) más configuracion.notificar_hse. */
export async function casillasHse(c, roles = ['hse']) {
  const { rows } = await c.query(
    `SELECT DISTINCT email FROM (
       SELECT u.email FROM usuarios u JOIN usuario_roles r ON r.usuario_id = u.id AND r.rol = ANY($1)
       WHERE u.activo AND NOT u.es_invitado
       UNION ALL
       SELECT jsonb_array_elements_text(valor) FROM configuracion WHERE clave = 'notificar_hse'
     ) t WHERE email <> ''`,
    [roles],
  );
  return rows.map((r) => r.email);
}

const datos = async (c, id) => (await c.query(
  `SELECT s.email, u.email AS autorizante_email
   FROM solicitudes s LEFT JOIN usuarios u ON u.id = s.autorizante_id AND u.activo
   WHERE s.id = $1`, [id])).rows[0];

export async function alEnviar(c, solicitudId) {
  const s = await datos(c, solicitudId);
  await encolar(c, { destinatario: s.email, plantilla: 'recibida', solicitudId });
  for (const casilla of await casillasHse(c)) await encolar(c, { destinatario: casilla, plantilla: 'aviso_hse', solicitudId });
}

/** Autorizantes activos de la planta de la solicitud (cuando todavía no tiene uno asignado). */
async function autorizantesDePlanta(c, solicitudId) {
  const { rows } = await c.query(
    `SELECT DISTINCT u.email FROM solicitudes s
     JOIN autorizante_plantas ap ON ap.planta_id = s.planta_id
     JOIN usuarios u ON u.id = ap.usuario_id AND u.activo AND NOT u.es_invitado
     JOIN usuario_roles r ON r.usuario_id = u.id AND r.rol = 'autorizante'
     WHERE s.id = $1`, [solicitudId]);
  return rows.map((r) => r.email);
}

export async function alCambiarEstado(c, solicitudId, estado) {
  const s = await datos(c, solicitudId);
  if (estado === 'pendiente_autorizacion') {
    // Al solicitante: pasó HSE. Al autorizante asignado; si no hay, a todos los de la planta (la
    // toma el primero que actúa); si la planta no tiene ninguno, a HSE y admin para que lo resuelvan.
    await encolar(c, { destinatario: s.email, plantilla: 'validada_hse', solicitudId });
    if (s.autorizante_email) {
      await encolar(c, { destinatario: s.autorizante_email, plantilla: 'aviso_autorizante', solicitudId });
    } else {
      const deLaPlanta = await autorizantesDePlanta(c, solicitudId);
      for (const d of deLaPlanta) await encolar(c, { destinatario: d, plantilla: 'aviso_autorizante', solicitudId, payload: { compartida: deLaPlanta.length > 1 } });
      if (!deLaPlanta.length) {
        for (const d of await casillasHse(c, ['hse', 'admin'])) await encolar(c, { destinatario: d, plantilla: 'sin_autorizante', solicitudId });
      }
    }
  }
  if (estado === 'aprobada') await encolar(c, { destinatario: s.email, plantilla: 'aprobada', solicitudId });
  if (estado === 'rechazada') await encolar(c, { destinatario: s.email, plantilla: 'rechazada', solicitudId });
}
