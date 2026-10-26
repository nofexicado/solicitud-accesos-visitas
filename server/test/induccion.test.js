import { afterEach, describe, expect, it, vi } from 'vitest';
import { equipo } from './ayuda.js';
import { leerComprobante } from '../src/modules/induccion.js';
import { firmar } from '../src/firmas.js';

afterEach(() => vi.useRealTimers());

async function iniciar(e) {
  const v = await e.get('/api/induccion/video');
  expect(v.status).toBe(200);
  const r = await e.post('/api/induccion/iniciar', { video_id: v.body.id });
  expect(r.status).toBe(200);
  return { video: v.body, recibo: r.body.recibo };
}

describe('inducción', () => {
  it('informa el video general con su duración', async () => {
    const r = await equipo().get('/api/induccion/video?planta=1');
    expect(r.body).toMatchObject({ duracion_seg: 120, url: expect.stringMatching(/^\/api\/induccion\/video\/\d+\/archivo$/) });
    expect(r.body.archivo).toBeUndefined();
  });

  it('no da comprobante si el video no duró lo suficiente', async () => {
    const e = equipo();
    const { recibo } = await iniciar(e);
    const r = await e.post('/api/induccion/completar', { recibo });
    expect(r.status).toBe(422);
    expect(r.body.faltan_seg).toBeGreaterThan(100);
  });

  it('da comprobante cuando pasó la duración menos la tolerancia', async () => {
    const e = equipo();
    const { recibo } = await iniciar(e);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 116_000);
    const r = await e.post('/api/induccion/completar', { recibo });
    expect(r.status).toBe(200);
    expect(r.body.comprobante).toMatch(/^[\w-]+\.[\w-]+$/);
  });

  it('el recibo de un equipo no sirve en otro', async () => {
    const { recibo } = await iniciar(equipo());
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 200_000);
    const otro = equipo();
    await otro.get('/api/induccion/video');
    const r = await otro.post('/api/induccion/completar', { recibo });
    expect(r.status).toBe(422);
  });

  it('rechaza un comprobante alterado, de otro equipo o vencido', () => {
    const secreto = process.env.INDUCCION_SECRET ?? '';
    expect(() => leerComprobante('a.b', 'x')).toThrow();
    expect(() => leerComprobante(firmar('otro-secreto-de-32-caracteres-xxxxx', { t: 'ok', d: 'x', f: Date.now() }), 'x')).toThrow();
    const viejo = Date.now() - 49 * 3600 * 1000;
    expect(secreto.length).toBeGreaterThanOrEqual(32);
    expect(() => leerComprobante(firmar(secreto, { t: 'ok', v: 1, d: 'x', i: viejo, f: viejo }), 'x')).toThrow(/48 horas/);
    expect(leerComprobante(firmar(secreto, { t: 'ok', v: 1, d: 'x', i: Date.now(), f: Date.now() }), 'x').video).toBe(1);
  });
});
