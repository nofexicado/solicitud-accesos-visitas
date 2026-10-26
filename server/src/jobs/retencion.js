// Retención (Ley 25.326): N meses (configuracion.retencion_meses, 12 por defecto) después de que una
// solicitud se cierra (vencida, rechazada o egreso) se borran sus adjuntos y datos personales.
// Queda lo no personal para estadística: N°, empresa, destino, categoría, fechas e historial.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { query, transaccion, leerConfiguracion } from '../db.js';

const LOTE = 200;

async function depurar(id) {
  const archivos = await transaccion(async (c) => {
    const { rows: [s] } = await c.query('SELECT id FROM solicitudes WHERE id = $1 AND depurada_at IS NULL FOR UPDATE', [id]);
    if (!s) return [];
    const { rows: docs } = await c.query('SELECT archivo FROM documentos WHERE solicitud_id = $1 AND archivo IS NOT NULL', [id]);
    await c.query("UPDATE documentos SET archivo = NULL, nombre_original = '' WHERE solicitud_id = $1", [id]);
    await c.query(
      `UPDATE solicitudes SET solicitante_nombre = '', email = '', telefono = '', ip = NULL, motivo = '',
              contacto_interno = '', depurada_at = now(), updated_at = now()
       WHERE id = $1`,
      [id],
    );
    await c.query(
      `UPDATE solicitud_personas p SET nombre_apellido = 'Persona ' || n.orden, nro_doc = NULL
       FROM (SELECT id, row_number() OVER (ORDER BY id) AS orden FROM solicitud_personas WHERE solicitud_id = $1) n
       WHERE p.id = n.id`,
      [id],
    );
    await c.query('UPDATE solicitud_vehiculos SET patente = NULL WHERE solicitud_id = $1', [id]);
    await c.query("UPDATE notificaciones_cola SET destinatario = '', payload = '{}' WHERE solicitud_id = $1", [id]);
    await c.query('DELETE FROM dispositivo_solicitudes WHERE solicitud_id = $1', [id]);
    await c.query("INSERT INTO solicitud_eventos (solicitud_id, accion, actor) VALUES ($1, 'depurada', 'sistema')", [id]);
    return docs.map((d) => d.archivo);
  });
  // Los archivos se borran después del COMMIT: si la transacción falla, no se pierde nada.
  await Promise.all(archivos.map((a) => fsp.rm(path.join(config.dirs.uploads, a), { force: true })));
}

export async function aplicarRetencion() {
  const meses = Number(await leerConfiguracion('retencion_meses', 12));
  const { rows } = await query(
    `SELECT id FROM solicitudes
     WHERE depurada_at IS NULL AND cerrada_at IS NOT NULL AND cerrada_at < now() - make_interval(months => $1)
     ORDER BY cerrada_at LIMIT $2`,
    [meses, LOTE],
  );
  for (const { id } of rows) {
    try {
      await depurar(id);
    } catch (err) {
      logger.error({ err, solicitud: id }, 'falló la depuración de una solicitud');
    }
  }
  return rows.length;
}
