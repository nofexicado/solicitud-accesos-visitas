// Cola de mails en la base. Encolar va dentro de la transacción del evento; el worker envía después.
// Con MAIL_ENABLED=false o la configuración incompleta, los mails quedan "pendiente" (y se avisa en
// el log); al activarlo salen todos los pendientes.
import { config } from '../config.js';
import { logger, enmascarar } from '../logger.js';
import { query } from '../db.js';
import { ADJUNTO_CABECERA, PLANTILLAS } from './plantillas.js';
import { faltantes, proveedorConfigurado } from './proveedores.js';
import { cargarDetalle } from '../modules/detalle.js';
import { qrPng, urlPdfFirmado } from '../modules/pase.js';
import { generarPdf } from '../modules/pdf.js';

const MAX_INTENTOS = 8;
const LOTE = 10;

export async function encolar(cliente, { destinatario, plantilla, solicitudId = null, payload = {} }) {
  if (!destinatario) return;
  if (!PLANTILLAS[plantilla]) throw new Error(`Plantilla desconocida: ${plantilla}`);
  await cliente.query(
    'INSERT INTO notificaciones_cola (destinatario, plantilla, payload, solicitud_id) VALUES ($1, $2, $3, $4)',
    [destinatario, plantilla, payload, solicitudId],
  );
}

/** Arma el mensaje con los datos actuales de la solicitud (no con una foto del momento de encolar). */
export async function armarMensaje(fila) {
  const s = fila.solicitud_id ? await cargarDetalle({ id: fila.solicitud_id }) : null;
  const extra = fila.plantilla === 'aprobada' && s ? { qrPng: await qrPng(s, 360), urlPdf: urlPdfFirmado(s), pdf: await generarPdf(s) } : {};
  const m = PLANTILLAS[fila.plantilla]({ s, payload: fila.payload, ...extra });
  return { para: fila.destinatario, asunto: m.asunto, html: m.html, texto: m.texto, adjuntos: [ADJUNTO_CABECERA, ...(m.adjuntos ?? [])] };
}

let ultimoAviso = 0;
async function avisarPendientes(motivo) {
  if (Date.now() - ultimoAviso < 3600_000) return;
  const { rows: [{ n }] } = await query("SELECT count(*)::int AS n FROM notificaciones_cola WHERE estado IN ('pendiente', 'error')");
  if (n) logger.warn({ pendientes: n, motivo }, 'hay mails en cola sin enviar');
  ultimoAviso = Date.now();
}

/**
 * Procesa un lote. `enviar` se puede inyectar (tests); por defecto, el proveedor de MAIL_PROVIDER.
 * Devuelve { enviados, fallidos } o { omitido: motivo } si los mails están desactivados.
 */
export async function procesarCola({ enviar } = {}) {
  if (!enviar) {
    if (!config.MAIL_ENABLED) { await avisarPendientes('MAIL_ENABLED=false'); return { omitido: 'MAIL_ENABLED=false' }; }
    const falta = faltantes();
    if (falta.length) { await avisarPendientes(`falta configurar ${falta.join(', ')}`); return { omitido: `falta ${falta.join(', ')}` }; }
    enviar = proveedorConfigurado();
  }
  // Lo que quedó "enviando" por un corte (servicio reiniciado) vuelve a la cola.
  await query("UPDATE notificaciones_cola SET estado = 'pendiente' WHERE estado = 'enviando' AND proximo_intento_at < now() - interval '10 minutes'");
  const { rows } = await query(
    `UPDATE notificaciones_cola SET estado = 'enviando', proximo_intento_at = now()
     WHERE id IN (SELECT id FROM notificaciones_cola
                  WHERE estado IN ('pendiente', 'error') AND proximo_intento_at <= now() AND intentos < $1 AND destinatario <> ''
                  ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED)
     RETURNING *`,
    [MAX_INTENTOS, LOTE],
  );
  let enviados = 0;
  let fallidos = 0;
  for (const fila of rows) {
    try {
      await enviar(await armarMensaje(fila));
      await query("UPDATE notificaciones_cola SET estado = 'enviado', enviado_at = now(), intentos = intentos + 1, ultimo_error = NULL WHERE id = $1", [fila.id]);
      enviados += 1;
    } catch (err) {
      fallidos += 1;
      // Espera creciente: 2, 4, 8… minutos, hasta una hora.
      await query(
        `UPDATE notificaciones_cola SET estado = 'error', intentos = intentos + 1, ultimo_error = $2,
           proximo_intento_at = now() + make_interval(mins => LEAST(60, power(2, intentos + 1)::int))
         WHERE id = $1`,
        [fila.id, String(err.message).slice(0, 500)],
      );
      logger.error({ id: fila.id, plantilla: fila.plantilla, para: enmascarar(fila.destinatario), err: err.message }, 'no se pudo enviar un mail');
    }
  }
  if (enviados) logger.info({ enviados }, 'mails enviados');
  return { enviados, fallidos };
}
