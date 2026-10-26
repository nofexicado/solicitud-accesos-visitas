import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { query } from '../src/db.js';
import { equipo } from './ayuda.js';
import { equipoListo, solicitud, enviar } from './fabrica.js';

describe('envío de solicitudes', () => {
  it('crea la solicitud con número del año, personas, vehículos, documentos e historial', async () => {
    const listo = await equipoListo();
    const r = await enviar(listo.e, solicitud(listo));
    expect(r.status).toBe(201);
    expect(r.body.numero).toMatch(/^ACC-\d{4}-\d{6}$/);

    const { rows: [s] } = await query('SELECT id, estado, autorizante_id, induccion_fin FROM solicitudes WHERE numero = $1', [r.body.numero]);
    expect(s.estado).toBe('enviada');
    expect(s.induccion_fin).toBeTruthy();
    const cuenta = async (t) => Number((await query(`SELECT count(*) FROM ${t} WHERE solicitud_id = $1`, [s.id])).rows[0].count);
    expect(await cuenta('solicitud_personas')).toBe(2);
    expect(await cuenta('solicitud_vehiculos')).toBe(1);
    expect(await cuenta('documentos')).toBe(2);
    const { rows: ev } = await query('SELECT accion, estado_nuevo, detalle FROM solicitud_eventos WHERE solicitud_id = $1', [s.id]);
    expect(ev).toEqual([{ accion: 'enviar', estado_nuevo: 'enviada', detalle: { personas: 2, vehiculos: 1, documentos: 2 } }]);
    // Los uploads pasaron a ser documentos de la solicitud.
    expect((await query('SELECT count(*) FROM uploads_temporales WHERE id = ANY($1)', [[listo.docs.doc_art, listo.docs.doc_nomina]])).rows[0].count).toBe('0');
    // DNI normalizado y patente normalizada
    expect((await query('SELECT nro_doc FROM solicitud_personas WHERE solicitud_id = $1 ORDER BY id LIMIT 1', [s.id])).rows[0].nro_doc).toBe('28441902');
    expect((await query('SELECT patente FROM solicitud_vehiculos WHERE solicitud_id = $1', [s.id])).rows[0].patente).toBe('AE908TR');
  });

  it('dos envíos con la misma clave crean una sola solicitud', async () => {
    const listo = await equipoListo();
    const clave = crypto.randomUUID();
    const [a, b] = await Promise.all([enviar(listo.e, solicitud(listo), clave), enviar(listo.e, solicitud(listo), clave)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.numero).toBe(b.body.numero);
    expect((await query('SELECT count(*) FROM solicitudes WHERE idempotency_key = $1', [clave])).rows[0].count).toBe('1');
  });

  it('solo el equipo que la envió puede ver el detalle', async () => {
    const listo = await equipoListo();
    const { body } = await enviar(listo.e, solicitud(listo));
    const propio = await listo.e.get(`/api/solicitudes/${body.numero}`);
    expect(propio.status).toBe(200);
    expect(propio.body).toMatchObject({ numero: body.numero, estado: 'enviada', planta: 'Planta Norte 1' });
    expect(propio.body.id).toBeUndefined();
    expect((await equipo().get(`/api/solicitudes/${body.numero}`)).status).toBe(404);
  });

  it('rechaza un comprobante de inducción de otro equipo', async () => {
    const a = await equipoListo();
    const b = await equipoListo();
    const r = await enviar(b.e, solicitud({ comprobante: a.comprobante, docs: b.docs }));
    expect(r.status).toBe(422);
    expect(r.body.campos['seguridad.induccion_comprobante']).toBeTruthy();
  });

  it('rechaza documentos subidos desde otro equipo', async () => {
    const a = await equipoListo();
    const b = await equipoListo();
    const r = await enviar(b.e, solicitud({ comprobante: b.comprobante, docs: a.docs }));
    expect(r.status).toBe(422);
    expect(r.body.campos['documentos.doc_art']).toMatch(/volvé a subirlo/);
  });

  it('una visita puede ir sin documentos; un contratista no', async () => {
    const listo = await equipoListo({ subirDocs: false });
    const base = solicitud(listo);
    const contratista = await enviar(listo.e, base);
    expect(contratista.status).toBe(422);
    expect(contratista.body.campos['documentos.doc_art']).toBeTruthy();
    const visita = await enviar(listo.e, { ...base, motivo: { ...base.motivo, categoria: 'visita' } });
    expect(visita.status).toBe(201);
  });

  it('las categorías sin documentos salen de la configuración', async () => {
    const poner = (v) => query("UPDATE configuracion SET valor = $1 WHERE clave = 'categorias_sin_documentos'", [JSON.stringify(v)]);
    try {
      await poner(['visita', 'auditoria']);
      const listo = await equipoListo({ subirDocs: false });
      const base = solicitud(listo);
      expect((await equipo().get('/api/catalogo/reglas')).body).toEqual({ categorias_sin_documentos: ['visita', 'auditoria'] });
      const auditoria = await enviar(listo.e, { ...base, motivo: { ...base.motivo, categoria: 'auditoria' } });
      expect(auditoria.status).toBe(201);

      await poner([]);
      const otro = await equipoListo({ subirDocs: false });
      const visita = await enviar(otro.e, { ...solicitud(otro), motivo: { ...solicitud(otro).motivo, categoria: 'visita' } });
      expect(visita.status).toBe(422);
      expect(visita.body.campos['documentos.doc_nomina']).toBeTruthy();

      // Un valor mal cargado no deja a todos sin documentos: vuelve al valor por defecto.
      await poner('cualquiera');
      expect((await equipo().get('/api/catalogo/reglas')).body).toEqual({ categorias_sin_documentos: ['visita'] });
    } finally {
      await poner(['visita']);
    }
  });

  it('rechaza una planta que no es del pack elegido', async () => {
    const listo = await equipoListo();
    const base = solicitud(listo);
    const r = await enviar(listo.e, { ...base, destino: { ...base.destino, pack_id: 2 } });
    expect(r.status).toBe(422);
    expect(r.body.campos['destino.planta_id']).toBeTruthy();
  });

  it('pide la clave de envío', async () => {
    const listo = await equipoListo();
    const r = await listo.e.agente.post('/api/solicitudes').set('X-Requested-With', 'accesos').send(solicitud(listo));
    expect(r.status).toBe(422);
  });
});
