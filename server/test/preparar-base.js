// Una vez por corrida: deja la base de tests vacía, migrada y con los seeds.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { runner } from 'node-pg-migrate';

export default async function () {
  const env = dotenv.parse(fs.readFileSync(new URL('../.env', import.meta.url)));
  const url = env.DATABASE_URL_MIGRATOR.replace(/\/accesos_visitas(\?|$)/, '/accesos_visitas_test$1');
  const dir = fileURLToPath(new URL('../src/db/migrations', import.meta.url));
  const comun = { databaseUrl: url, dir, migrationsTable: 'pgmigrations', log: () => {} };
  await runner({ ...comun, direction: 'down', count: Infinity });
  await runner({ ...comun, direction: 'up', count: Infinity });
  execFileSync(process.execPath, [fileURLToPath(new URL('../src/db/seeds/run.js', import.meta.url))], {
    env: { ...process.env, DATABASE_URL_MIGRATOR: url },
    stdio: 'ignore',
  });
}
