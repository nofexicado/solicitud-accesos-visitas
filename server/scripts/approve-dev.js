// SOLO DESARROLLO: lleva una solicitud hasta "aprobada" pasando por las dos firmas (HSE y
// autorizante), con su historial, para probar el QR y el PDF antes de que exista el panel (Fase 2).
//   node scripts/approve-dev.js ACC-2026-000001
//   node scripts/approve-dev.js ACC-2026-000001 --rechazar "Falta la ART vigente"
import { transicion } from '@accesos/shared';
import { config } from '../src/config.js';
import { pool, transaccion } from '../src/db.js';
import { alCambiarEstado } from '../src/modules/avisos.js';

if (config.esProduccion) {
  console.error('approve-dev.js no corre en producción.');
  process.exit(1);
}
const [numero, flag, motivo] = process.argv.slice(2);
if (!numero) {
  console.error('Uso: node scripts/approve-dev.js ACC-AAAA-NNNNNN [--rechazar "motivo"]');
  process.exit(1);
}

const pasos = flag === '--rechazar' ? ['rechazar_hse'] : ['tomar_hse', 'validar_hse', 'aprobar'];
try {
  const final = await transaccion(async (c) => {
    const { rows: [s] } = await c.query('SELECT id, estado FROM solicitudes WHERE numero = $1 FOR UPDATE', [numero]);
    if (!s) throw new Error(`No existe ${numero}`);
    let estado = s.estado;
    for (const accion of pasos) {
      const t = transicion(accion, estado);
      if (!t) continue;
      await c.query(
        `UPDATE solicitudes SET estado = $2, motivo_rechazo = COALESCE($3, motivo_rechazo), updated_at = now(),
                cerrada_at = CASE WHEN $2 = 'rechazada' THEN now() ELSE cerrada_at END
         WHERE id = $1`,
        [s.id, t.hacia, t.requiereMotivo ? (motivo ?? 'Rechazada en desarrollo') : null],
      );
      await c.query(
        `INSERT INTO solicitud_eventos (solicitud_id, estado_anterior, estado_nuevo, accion, actor, detalle)
         VALUES ($1, $2, $3, $4, 'sistema', '{"dev": true}')`,
        [s.id, estado, t.hacia, accion],
      );
      await alCambiarEstado(c, s.id, t.hacia);
      estado = t.hacia;
    }
    return estado;
  });
  console.log(`${numero} → ${final}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
