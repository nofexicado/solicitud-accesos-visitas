// PostgreSQL embebido para desarrollo (no se usa en producción).
// Primera vez: inicializa el cluster, crea base y usuarios como deploy/db-setup.sql y escribe server/.env.
// Queda corriendo hasta Ctrl+C.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import { asegurarBaseTest, BASE_TEST } from './base-test.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(raiz, '.pgdata');
const PUERTO = Number(process.env.DEV_DB_PORT ?? 5433);
const SUPER_PASS = 'postgres-dev';
const PASS = { migrator: 'migrator-dev', app: 'app-dev' };

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: SUPER_PASS,
  port: PUERTO,
  persistent: true,
  onLog: () => {},
});

const nuevo = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
if (nuevo) await pg.initialise();
await pg.start();

if (nuevo) {
  const setup = fs
    .readFileSync(path.join(raiz, '..', 'deploy', 'db-setup.sql'), 'utf8')
    .replace(/--.*$/gm, '')
    .replace('CAMBIAR_MIGRATOR', PASS.migrator)
    .replace('CAMBIAR_APP', PASS.app);
  const [global, enBase] = setup.split(/^\\connect .*$/m);
  const admin = pg.getPgClient();
  await admin.connect();
  for (const sentencia of global.split(';').map((s) => s.trim()).filter(Boolean)) {
    await admin.query(sentencia);
  }
  await admin.end();
  const base = pg.getPgClient('accesos_visitas');
  await base.connect();
  await base.query(enBase);
  await base.end();
  console.log('Base accesos_visitas creada con usuarios accesos_migrator y accesos_app.');
}

if (await asegurarBaseTest({ puerto: PUERTO, clave: SUPER_PASS })) console.log(`Base ${BASE_TEST} creada para los tests.`);

const envPath = path.join(raiz, '.env');
if (!fs.existsSync(envPath)) {
  const secreto = () => crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(
    envPath,
    [
      'NODE_ENV=development',
      'HOST=127.0.0.1',
      'PORT=3100',
      'PUBLIC_URL=http://localhost:5173',
      `DATABASE_URL=postgres://accesos_app:${PASS.app}@127.0.0.1:${PUERTO}/accesos_visitas`,
      `DATABASE_URL_MIGRATOR=postgres://accesos_migrator:${PASS.migrator}@127.0.0.1:${PUERTO}/accesos_visitas`,
      `JWT_SECRET=${secreto()}`,
      `QR_SECRET=${secreto()}`,
      `INDUCCION_SECRET=${secreto()}`,
      'AV_ENABLED=false',
      'MAIL_ENABLED=false',
      'MAIL_PROVIDER=smtp',
      '',
    ].join('\n'),
  );
  console.log('server/.env de desarrollo creado.');
}

console.log(`PostgreSQL de desarrollo en 127.0.0.1:${PUERTO}. Ctrl+C para detener.`);

const detener = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', detener);
process.on('SIGTERM', detener);
setInterval(() => {}, 1 << 30);
