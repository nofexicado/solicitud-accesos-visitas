import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { query } from '../src/db.js';
import { config } from '../src/config.js';
import { vencerSolicitudes } from '../src/jobs/vencimientos.js';
import { aplicarRetencion } from '../src/jobs/retencion.js';
import { equipoListo, solicitud, enviar } from './fabrica.js';

async function nueva() {
  const listo = await equipoListo();
  const { body } = await enviar(listo.e, solicitud(listo));
  return (await query('SELECT id, numero FROM solicitudes WHERE numero = $1', [body.numero])).rows[0];
}

describe('vencimientos', () => {
  it('vence las abiertas cuya fecha de fin pasó y deja las demás', async () => {
    const vieja = await nueva();
    const vigente = await nueva();
    await query("UPDATE solicitudes SET fecha_desde = current_date - 5, fecha_hasta = current_date - 1 WHERE id = $1", [vieja.id]);
    await vencerSolicitudes();
    const estado = async (id) => (await query('SELECT estado, cerrada_at FROM solicitudes WHERE id = $1', [id])).rows[0];
    expect(await estado(vieja.id)).toMatchObject({ estado: 'vencida', cerrada_at: expect.any(Date) });
    expect((await estado(vigente.id)).estado).toBe('enviada');
    const { rows } = await query("SELECT accion, actor FROM solicitud_eventos WHERE solicitud_id = $1 AND accion = 'vencer'", [vieja.id]);
    expect(rows).toEqual([{ accion: 'vencer', actor: 'sistema' }]);
  });
});

describe('retención', () => {
  it('borra adjuntos y datos personales N meses después del cierre; conserva lo estadístico', async () => {
    const vieja = await nueva();
    const reciente = await nueva();
    const archivos = (await query('SELECT archivo FROM documentos WHERE solicitud_id = $1', [vieja.id])).rows.map((r) => r.archivo);
    expect(archivos.every((a) => fs.existsSync(path.join(config.dirs.uploads, a)))).toBe(true);
    await query("UPDATE solicitudes SET estado = 'rechazada', cerrada_at = now() - interval '13 months' WHERE id = $1", [vieja.id]);
    await query("UPDATE solicitudes SET estado = 'vencida', cerrada_at = now() - interval '2 months' WHERE id = $1", [reciente.id]);

    await aplicarRetencion();

    const { rows: [s] } = await query('SELECT numero, solicitante_nombre, email, telefono, motivo, ip, depurada_at, fecha_desde, categoria FROM solicitudes WHERE id = $1', [vieja.id]);
    expect(s).toMatchObject({ numero: vieja.numero, solicitante_nombre: '', email: '', telefono: '', motivo: '', ip: null, categoria: 'contratista' });
    expect(s.depurada_at).toBeInstanceOf(Date);
    expect((await query('SELECT nombre_apellido, nro_doc FROM solicitud_personas WHERE solicitud_id = $1 ORDER BY id', [vieja.id])).rows)
      .toEqual([{ nombre_apellido: 'Persona 1', nro_doc: null }, { nombre_apellido: 'Persona 2', nro_doc: null }]);
    expect((await query('SELECT patente FROM solicitud_vehiculos WHERE solicitud_id = $1', [vieja.id])).rows).toEqual([{ patente: null }]);
    expect((await query('SELECT archivo, nombre_original FROM documentos WHERE solicitud_id = $1', [vieja.id])).rows.every((d) => d.archivo === null && d.nombre_original === '')).toBe(true);
    expect(archivos.some((a) => fs.existsSync(path.join(config.dirs.uploads, a)))).toBe(false);
    expect((await query("SELECT count(*) FROM notificaciones_cola WHERE solicitud_id = $1 AND destinatario <> ''", [vieja.id])).rows[0].count).toBe('0');
    expect((await query('SELECT count(*) FROM dispositivo_solicitudes WHERE solicitud_id = $1', [vieja.id])).rows[0].count).toBe('0');

    // La cerrada hace 2 meses no se toca.
    expect((await query('SELECT email, depurada_at FROM solicitudes WHERE id = $1', [reciente.id])).rows[0]).toMatchObject({ email: 'mojeda@ejemplo.com', depurada_at: null });
  });
});
