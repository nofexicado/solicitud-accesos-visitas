// Crea la base de tests (accesos_visitas_test) con los mismos usuarios y permisos que la de
// desarrollo. La usa dev-db.js al arrancar; los tests la migran desde cero en cada corrida.
// Uso directo: node scripts/base-test.js (con el PostgreSQL de desarrollo corriendo).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASE_TEST = 'accesos_visitas_test';

export async function asegurarBaseTest({ puerto, usuario = 'postgres', clave }) {
  const admin = new pg.Client({ host: '127.0.0.1', port: puerto, user: usuario, password: clave, database: 'postgres' });
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [BASE_TEST]);
  if (!rowCount) await admin.query(`CREATE DATABASE ${BASE_TEST} OWNER accesos_migrator ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  if (rowCount) return false;

  const setup = fs.readFileSync(path.join(raiz, '..', 'deploy', 'db-setup.sql'), 'utf8').replace(/--.*$/gm, '');
  const enBase = setup.split(/^\\connect .*$/m)[1].replaceAll('accesos_visitas', BASE_TEST);
  const base = new pg.Client({ host: '127.0.0.1', port: puerto, user: usuario, password: clave, database: BASE_TEST });
  await base.connect();
  await base.query(enBase);
  await base.end();
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const creada = await asegurarBaseTest({ puerto: Number(process.env.DEV_DB_PORT ?? 5433), clave: 'postgres-dev' });
  console.log(creada ? `Base ${BASE_TEST} creada.` : `La base ${BASE_TEST} ya existía.`);
}
