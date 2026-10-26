import { describe, expect, it } from 'vitest';
import { query } from '../src/db.js';
import { equipo } from './ayuda.js';
import { equipoListo, solicitud, enviar } from './fabrica.js';
import { tokenQr, tokenPdf, vigencia } from '../src/modules/pase.js';
import { firmar } from '../src/firmas.js';

async function aprobada() {
  const listo = await equipoListo();
  const { body } = await enviar(listo.e, solicitud(listo));
  const { rows: [s] } = await query("UPDATE solicitudes SET estado = 'aprobada', fecha_desde = current_date WHERE numero = $1 RETURNING id, qr_version, numero", [body.numero]);
  return { ...listo, s };
}

describe('QR y comprobante', () => {
  it('el detalle trae QR solo cuando la solicitud tiene pase', async () => {
    const listo = await equipoListo();
    const { body } = await enviar(listo.e, solicitud(listo));
    const antes = await listo.e.get(`/api/solicitudes/${body.numero}`);
    expect(antes.body.qr_svg).toBeNull();
    await query("UPDATE solicitudes SET estado = 'aprobada' WHERE numero = $1", [body.numero]);
    const despues = await listo.e.get(`/api/solicitudes/${body.numero}`);
    expect(despues.body.qr_svg).toMatch(/^<svg/);
  });

  it('verificar: vigente solo si está aprobada y hoy está dentro de las fechas', async () => {
    const { s } = await aprobada();
    const ok = await equipo().get(`/api/verificar/${tokenQr(s)}`);
    expect(ok.body).toMatchObject({ valido: true, numero: s.numero, planta: 'Planta Norte 1' });
    // Sin datos personales en la verificación pública.
    expect(JSON.stringify(ok.body)).not.toMatch(/Ojeda|28441902|mojeda/);
    await query("UPDATE solicitudes SET fecha_desde = current_date + 5, fecha_hasta = current_date + 6 WHERE id = $1", [s.id]);
    const antes = await equipo().get(`/api/verificar/${tokenQr(s)}`);
    expect(antes.body).toMatchObject({ valido: false, motivo: expect.stringMatching(/Vale desde/) });
  });

  it('subir qr_version revoca el QR anterior', async () => {
    const { s } = await aprobada();
    await query('UPDATE solicitudes SET qr_version = qr_version + 1 WHERE id = $1', [s.id]);
    const r = await equipo().get(`/api/verificar/${tokenQr(s)}`);
    expect(r.body).toMatchObject({ valido: false, motivo: expect.stringMatching(/reemplazado/) });
  });

  it('un token alterado o de otro propósito no sirve', async () => {
    const { s } = await aprobada();
    expect((await equipo().get(`/api/verificar/${tokenPdf(s)}`)).body.valido).toBe(false);
    expect((await equipo().get(`/api/verificar/${firmar('x'.repeat(40), { p: 'qr', s: Number(s.id), v: 1 })}`)).body.valido).toBe(false);
  });

  it('PDF: el equipo ligado lo descarga; con el link firmado, cualquiera', async () => {
    const { e, s } = await aprobada();
    const propio = await e.get(`/api/solicitudes/${s.numero}/comprobante.pdf`);
    expect(propio.status).toBe(200);
    expect(propio.headers['content-type']).toBe('application/pdf');
    expect(propio.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await equipo().get(`/api/solicitudes/${s.numero}/comprobante.pdf`)).status).toBe(404);
    expect((await equipo().get(`/api/comprobantes/${tokenPdf(s)}.pdf`)).status).toBe(200);
    expect((await equipo().get(`/api/comprobantes/${tokenQr(s)}.pdf`)).status).toBe(404);
  });

  it('vigencia cubre los casos de estado y fechas', () => {
    const base = { estado: 'aprobada', fecha_desde: '2026-10-23', fecha_hasta: '2026-10-25' };
    expect(vigencia(base, '2026-10-24').vigente).toBe(true);
    expect(vigencia(base, '2026-10-26').motivo).toMatch(/Venció/);
    expect(vigencia({ ...base, estado: 'enviada' }, '2026-10-24').vigente).toBe(false);
    expect(vigencia({ ...base, estado: 'ingreso' }, '2026-10-24').vigente).toBe(true);
  });
});
