// Punto de entrada del servicio (NSSM en producción). Escucha solo en HOST (127.0.0.1): nginx es el único cliente.
import fs from 'node:fs';
import { config } from './config.js';
import { logger } from './logger.js';
import { pool } from './db.js';
import cron from 'node-cron';
import { crearApp } from './app.js';
import { avisoSiDesactivado } from './modules/antivirus.js';
import { limpiarUploadsVencidos } from './modules/uploads.js';
import { procesarCola } from './notificaciones/cola.js';
import { vencerSolicitudes } from './jobs/vencimientos.js';
import { aplicarRetencion } from './jobs/retencion.js';
import { programarAvisoSinEgreso } from './jobs/sin-egreso.js';

for (const dir of Object.values(config.dirs)) fs.mkdirSync(dir, { recursive: true });

avisoSiDesactivado();

// Uploads temporales que nadie usó en 48 h.
cron.schedule('17 * * * *', () => limpiarUploadsVencidos()
  .then((n) => n && logger.info({ n }, 'uploads vencidos borrados'))
  .catch((err) => logger.error({ err }, 'falló la limpieza de uploads')));

// Vencimientos cada 15 minutos; retención de datos todas las noches a las 03:00 (hora de TDF).
const job = (nombre, fn) => () => fn()
  .then((n) => n && logger.info({ n }, nombre))
  .catch((err) => logger.error({ err }, `falló el job: ${nombre}`));
cron.schedule('*/15 * * * *', job('solicitudes vencidas', vencerSolicitudes));
cron.schedule('0 3 * * *', job('solicitudes depuradas por retención', aplicarRetencion), { timezone: 'America/Argentina/Ushuaia' });
// Al cierre del día (configuracion.cierre_dia_hora, 20:00 por defecto) HSE recibe el aviso de quién sigue sin egreso.
programarAvisoSinEgreso((hora, fn) => {
  const [hh, mm] = hora.split(':').map(Number);
  cron.schedule(`${mm} ${hh} * * *`, job('aviso de personas sin egreso', fn), { timezone: 'America/Argentina/Ushuaia' });
}).catch((err) => logger.error({ err }, 'no se pudo programar el aviso de personas sin egreso'));

// Worker de mails: cada 30 s toma un lote de la cola (si MAIL_ENABLED y la casilla están configurados).
let enviando = false;
setInterval(async () => {
  if (enviando) return;
  enviando = true;
  try { await procesarCola(); } catch (err) { logger.error({ err }, 'falló el worker de mails'); } finally { enviando = false; }
}, 30_000).unref();

const server = crearApp().listen(config.PORT, config.HOST, () => {
  logger.info({ host: config.HOST, port: config.PORT, entorno: config.NODE_ENV }, 'API de accesos escuchando');
});

const cerrar = async (senal) => {
  logger.info({ senal }, 'deteniendo');
  server.close();
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
process.on('unhandledRejection', (err) => logger.error({ err }, 'promesa rechazada sin manejar'));
