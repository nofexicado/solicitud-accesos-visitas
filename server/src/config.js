// Configuración leída de .env y validada al arrancar: si falta algo crítico, el servicio no inicia.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const raizServer = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(raizServer, '.env'), quiet: true });

const booleano = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const secreto = z.string().min(32, 'Debe tener al menos 32 caracteres');

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().default(3100),
  PUBLIC_URL: z.url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: secreto,
  QR_SECRET: secreto,
  INDUCCION_SECRET: secreto,

  DATA_DIR: z.string().default(path.join(raizServer, 'data')),
  LOG_DIR: z.string().default(path.join(raizServer, 'logs')),
  UPLOAD_MAX_MB: z.coerce.number().positive().default(10),

  // Escaneo de uploads con Microsoft Defender antes de aceptarlos (falla cerrada si da error).
  AV_ENABLED: booleano,
  AV_MPCMDRUN: z.string().default('C:\\Program Files\\Windows Defender\\MpCmdRun.exe'),
  AV_TIMEOUT_SEG: z.coerce.number().int().positive().default(60),

  MAIL_ENABLED: booleano,
  MAIL_PROVIDER: z.enum(['smtp', 'graph']).default('smtp'),
  MAIL_FROM: z.string().default(''),
  MAIL_FROM_NAME: z.string().default('Accesos a yacimientos'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: booleano,
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  GRAPH_TENANT_ID: z.string().default(''),
  GRAPH_CLIENT_ID: z.string().default(''),
  GRAPH_CLIENT_SECRET: z.string().default(''),
  GRAPH_SENDER: z.string().default(''),
});

const resultado = esquema.safeParse(process.env);
if (!resultado.success) {
  const detalle = resultado.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Configuración inválida en .env:\n${detalle}`);
}

const env = resultado.data;

export const config = {
  ...env,
  esProduccion: env.NODE_ENV === 'production',
  raizServer,
  dirs: {
    uploads: path.join(env.DATA_DIR, 'uploads'),
    tmp: path.join(env.DATA_DIR, 'tmp'),
    videos: path.join(env.DATA_DIR, 'videos'),
    logs: env.LOG_DIR,
  },
};
