// Cada 15 minutos: las solicitudes abiertas cuya fecha de fin ya pasó (en hora de Tierra del Fuego)
// pasan a "vencida", con su evento. Desde ahí cuenta el plazo de retención.
import { TRANSICIONES, fechaLocalISO } from '@accesos/shared';
import { transaccion } from '../db.js';

export async function vencerSolicitudes(hoy = fechaLocalISO()) {
  return transaccion(async (c) => {
    const { rows } = await c.query(
      `UPDATE solicitudes s SET estado = 'vencida', cerrada_at = now(), updated_at = now()
       FROM (SELECT id, estado FROM solicitudes WHERE estado = ANY($1) AND fecha_hasta < $2 FOR UPDATE) v
       WHERE s.id = v.id
       RETURNING s.id, v.estado AS anterior`,
      [TRANSICIONES.vencer.desde, hoy],
    );
    for (const r of rows) {
      await c.query(
        `INSERT INTO solicitud_eventos (solicitud_id, estado_anterior, estado_nuevo, accion, actor)
         VALUES ($1, $2, 'vencida', 'vencer', 'sistema')`,
        [r.id, r.anterior],
      );
    }
    return rows.length;
  });
}
