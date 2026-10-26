import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, equipo } from './ayuda.js';
import { firmar, verificar } from '../src/firmas.js';
import { canal, requireCanal } from '../src/middleware/canal.js';

describe('canal', () => {
  it('sin header es externo; el header solo vale desde loopback (nginx)', async () => {
    expect((await request(app).get('/api/canal')).body.canal).toBe('externo');
    expect((await request(app).get('/api/canal').set('X-Canal', 'interno')).body.canal).toBe('interno');
    expect((await request(app).get('/api/canal').set('X-Canal', 'otra-cosa')).body.canal).toBe('externo');
  });

  it('X-Canal: interno desde una IP que no es loopback se trata como externo y las rutas internas dan 404', () => {
    const req = { socket: { remoteAddress: '203.0.113.9' }, get: (h) => (h === 'x-canal' ? 'interno' : undefined) };
    canal(req, {}, () => {});
    expect(req.canal).toBe('externo');
    let estado = null;
    const res = { status: (n) => { estado = n; return { json: () => {} }; } };
    requireCanal('interno')(req, res, () => { estado = 'siguió'; });
    expect(estado).toBe(404);
  });
});

describe('seguridad de mutaciones', () => {
  it('rechaza POST sin el header propio o desde otro origen', async () => {
    expect((await request(app).post('/api/induccion/iniciar').send({ video_id: 1 })).status).toBe(403);
    const r = await request(app).post('/api/induccion/iniciar').set('X-Requested-With', 'accesos').set('Origin', 'https://otro.sitio').send({ video_id: 1 });
    expect(r.status).toBe(403);
  });
  it('responde 422 con errores por campo ante datos inválidos', async () => {
    const r = await equipo().post('/api/induccion/iniciar', { video_id: 'uno' });
    expect(r.status).toBe(422);
    expect(r.body.campos.video_id).toBeTruthy();
  });
});

describe('catálogo', () => {
  it('lista los packs con sus plantas', async () => {
    const r = await request(app).get('/api/catalogo/packs');
    expect(r.body.map((p) => p.nombre)).toEqual(['Pack Norte', 'Pack Centro', 'Pack Sur']);
    expect(r.body[0].plantas).toHaveLength(2);
  });
  it('sin autorizantes cargados devuelve lista vacía', async () => {
    expect((await request(app).get('/api/catalogo/plantas/1/autorizantes')).body).toEqual([]);
  });
});

describe('firmas', () => {
  it('verifica lo propio y rechaza lo alterado', () => {
    const t = firmar('s'.repeat(32), { a: 1 });
    expect(verificar('s'.repeat(32), t)).toEqual({ a: 1 });
    expect(verificar('s'.repeat(32), t.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))).toBeNull();
    expect(verificar('x'.repeat(32), t)).toBeNull();
  });
});
