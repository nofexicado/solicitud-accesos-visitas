import { describe, expect, it } from 'vitest';
import { equipo } from './ayuda.js';
import { equipoListo, solicitud, enviar } from './fabrica.js';

describe('mis solicitudes', () => {
  it('lista solo las de este equipo', async () => {
    const listo = await equipoListo();
    const { body } = await enviar(listo.e, solicitud(listo));
    const propias = (await listo.e.get('/api/mis-solicitudes')).body;
    expect(propias.map((s) => s.numero)).toContain(body.numero);
    expect(propias[0]).toMatchObject({ empresa: 'Contratista Ejemplo SA', planta: 'Planta Norte 1', personas: 2, vehiculos: 1, vigente: false });
    expect((await equipo().get('/api/mis-solicitudes')).body).toEqual([]);
  });

  it('consulta por N° + DNI o CUIT liga la solicitud a otro equipo', async () => {
    const listo = await equipoListo();
    const { body } = await enviar(listo.e, solicitud(listo));
    const otro = equipo();
    const numeroSuelto = body.numero.replace('ACC-', 'vel ').replace(/-0+/, '-');
    const r = await otro.post('/api/consulta', { numero: numeroSuelto, documento: '35.118.276' });
    expect(r.status).toBe(200);
    expect(r.body.numero).toBe(body.numero);
    expect((await otro.get(`/api/solicitudes/${body.numero}`)).status).toBe(200);
    const porCuit = equipo();
    expect((await porCuit.post('/api/consulta', { numero: body.numero, documento: '30-12345678-1' })).status).toBe(200);
  });

  it('número inexistente y documento equivocado dan la misma respuesta', async () => {
    const listo = await equipoListo();
    const { body } = await enviar(listo.e, solicitud(listo));
    const mal = await equipo().post('/api/consulta', { numero: body.numero, documento: '99999999' });
    const inexistente = await equipo().post('/api/consulta', { numero: 'ACC-2099-999999', documento: '35118276' });
    expect(mal.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(mal.body).toEqual(inexistente.body);
  });

  it('quitar de este equipo la saca de la lista y del detalle', async () => {
    const listo = await equipoListo();
    const { body } = await enviar(listo.e, solicitud(listo));
    expect((await listo.e.del(`/api/mis-solicitudes/${body.numero}`)).status).toBe(204);
    expect((await listo.e.get('/api/mis-solicitudes')).body.map((s) => s.numero)).not.toContain(body.numero);
    expect((await listo.e.get(`/api/solicitudes/${body.numero}`)).status).toBe(404);
  });
});
