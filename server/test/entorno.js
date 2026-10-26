// Antes de importar la app: apunta a la base de tests y a carpetas de datos temporales.
// dotenv no pisa variables ya definidas, así que estas ganan sobre server/.env.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';

const env = dotenv.parse(fs.readFileSync(new URL('../.env', import.meta.url)));
const aTest = (url) => url.replace(/\/accesos_visitas(\?|$)/, '/accesos_visitas_test$1');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = aTest(env.DATABASE_URL);
process.env.DATABASE_URL_MIGRATOR = aTest(env.DATABASE_URL_MIGRATOR);
process.env.AV_ENABLED = 'false';
process.env.MAIL_ENABLED = 'false';
const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'accesos-test-'));
process.env.DATA_DIR = datos;
process.env.LOG_DIR = path.join(datos, 'logs');
for (const d of ['uploads', 'tmp', 'videos']) fs.mkdirSync(path.join(datos, d), { recursive: true });
fs.writeFileSync(path.join(datos, 'videos', 'induccion-prueba.mp4'), Buffer.alloc(1024));
