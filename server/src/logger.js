// Logs en archivo con rotación diaria (LOG_DIR) y en consola durante el desarrollo.
// Nunca se loguean cuerpos de request; DNI, CUIT y mails se enmascaran con enmascarar().
import pino from 'pino';
import path from 'node:path';
import { config } from './config.js';

const destinos = [
  {
    target: 'pino-roll',
    level: 'info',
    options: { file: path.join(config.dirs.logs, 'accesos'), frequency: 'daily', size: '20m', mkdir: true, limit: { count: 30 } },
  },
];
if (!config.esProduccion) destinos.push({ target: 'pino/file', level: 'debug', options: { destination: 1 } });

export const logger =
  config.NODE_ENV === 'test'
    ? pino({ level: 'silent' })
    : pino({ level: config.esProduccion ? 'info' : 'debug', redact: ['req.headers.cookie', 'req.headers.authorization'] }, pino.transport({ targets: destinos }));

/** "28441902" → "28****02"; "ana@dominio.com" → "a***@dominio.com". */
export function enmascarar(valor) {
  const v = String(valor ?? '');
  if (v.includes('@')) return v.replace(/^(.).*(@.*)$/, '$1***$2');
  if (v.length <= 4) return '****';
  return v.slice(0, 2) + '*'.repeat(v.length - 4) + v.slice(-2);
}
