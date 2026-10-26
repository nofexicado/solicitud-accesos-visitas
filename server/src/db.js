// Pool de PostgreSQL con el usuario acotado de la app (accesos_app).
import pg from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

// DATE se devuelve como texto AAAA-MM-DD: las fechas de negocio no tienen hora ni zona.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });
pool.on('error', (err) => logger.error({ err }, 'error en una conexión ociosa de PostgreSQL'));

export const query = (texto, params) => pool.query(texto, params);

/** Ejecuta fn dentro de una transacción; hace ROLLBACK si fn lanza. */
export async function transaccion(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function leerConfiguracion(clave, porDefecto) {
  const { rows } = await pool.query('SELECT valor FROM configuracion WHERE clave = $1', [clave]);
  return rows[0]?.valor ?? porDefecto;
}
