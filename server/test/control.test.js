import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fechaLocalISO } from '@accesos/shared';
import { query } from '../src/db.js';
import { armarMensaje } from '../src/notificaciones/cola.js';
import { urlQr } from '../src/modules/pase.js';
import { avisarSinEgreso } from '../src/jobs/sin-egreso.js';
import { app } from './ayuda.js';
import { equipoListo, solicitud, enviar } from './fabrica.js';

const CLAVE = 'clave-de-prueba-123';
const creados = [];
async function usuario(email, roles, { recibe = [], autoriza = [] } = {}) {
  const { rows: [u] } = await query(
    `INSERT INTO usuarios (email, nombre, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET activo = true RETURNING id`, [email, email.split('@')[0], bcrypt.hashSync(CLAVE, 4)]);
  await query('DELETE FROM usuario_roles WHERE usuario_id = $1', [u.id]);
  for (const r of roles) await query('INSERT INTO usuario_roles VALUES ($1, $2)', [u.id, r]);
  for (const p of recibe) await query('INSERT INTO recepcion_plantas VALUES ($1, $2) ON CONFLICT DO NOTHING', [u.id, p]);
  for (const p of autoriza) await query('INSERT INTO autorizante_plantas VALUES ($1, $2) ON CONFLICT DO NOTHING', [u.id, p]);
  creados.push(u.id);
  return { id: u.id, email };
}
async function enLaLan(email) {
  const agente = request.agent(app);
  const h = (r) => r.set('X-Canal', 'interno').set('X-Requested-With', 'accesos');
  await h(agente.post('/api/auth/login')).send({ email, password: CLAVE });
  return { get: (ruta) => agente.get(ruta).set('X-Canal', 'interno'), post: (ruta, cuerpo) => h(agente.post(ruta)).send(cuerpo) };
}

/** Solicitud aprobada que vale desde hoy, para planta 1 (Norte 1). */
async function aprobada({ estado = 'aprobada' } = {}) {
  const listo = await equipoListo();
  const base = solicitud(listo);
  const r = await enviar(listo.e, { ...base, motivo: { ...base.motivo, fecha_desde: fechaLocalISO() } });
  expect(r.status).toBe(201);
  const { rows: [s] } = await query("UPDATE solicitudes SET estado = $2 WHERE numero = $1 RETURNING id, numero, qr_version", [r.body.numero, estado]);
  return s;
}

let recepcionSs, recepcionCds, hse, autSs;
beforeAll(async () => {
  recepcionSs = await usuario('recepcion.ss@ejemplo.test', ['porteria'], { recibe: [1] });
  recepcionCds = await usuario('recepcion.cds@ejemplo.test', ['porteria'], { recibe: [2] });
  hse = await usuario('hse.control@ejemplo.test', ['hse']);
  autSs = await usuario('aut.control@ejemplo.test', ['autorizante'], { autoriza: [1] });
});
afterAll(() => query('UPDATE usuarios SET activo = false WHERE id = ANY($1)', [creados]));

describe('validación del QR en recepción', () => {
  it('desde internet no existe', async () => {
    const r = await request(app).post('/api/control/validar').set('X-Requested-With', 'accesos').send({ codigo: 'x', planta_id: 1 });
    expect(r.status).toBe(404);
  });

  it('con la URL que trae el QR: habilitado, con personas y vehículos', async () => {
    const s = await aprobada();
    const rec = await enLaLan(recepcionSs.email);
    const r = await rec.post('/api/control/validar', { codigo: urlQr(s), planta_id: 1 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ resultado: 'habilitado', habilitado: true, solicitud: { numero: s.numero, empresa: 'Contratista Ejemplo SA', planta: 'Planta Norte 1' } });
    expect(r.body.personas.map((p) => [p.nombre_apellido, p.dentro])).toEqual([['Martín Ojeda', false], ['Lucas Barrientos', false]]);
    expect(r.body.vehiculos[0].patente).toBe('AE908TR');
  });

  it('código basura, QR reemplazado, otra planta y pase no aprobado: no habilitado con el motivo', async () => {
    const rec = await enLaLan(recepcionSs.email);
    expect((await rec.post('/api/control/validar', { codigo: 'https://otro.sitio/q/abc.def', planta_id: 1 })).body)
      .toMatchObject({ resultado: 'desconocido', habilitado: false, solicitud: null });

    const s = await aprobada();
    await query('UPDATE solicitudes SET qr_version = qr_version + 1 WHERE id = $1', [s.id]);
    expect((await rec.post('/api/control/validar', { codigo: urlQr(s), planta_id: 1 })).body.motivo).toMatch(/reemplazado/);

    const otra = await aprobada();
    const h = await enLaLan(hse.email);
    const enCds = await h.post('/api/control/validar', { codigo: urlQr(otra), planta_id: 2 });
    expect(enCds.body).toMatchObject({ resultado: 'no_habilitado', motivo: 'Es para Planta Norte 1, no para esta planta.' });

    const pendiente = await aprobada({ estado: 'pendiente_autorizacion' });
    expect((await rec.post('/api/control/validar', { codigo: urlQr(pendiente), planta_id: 1 })).body.motivo).toBe('La solicitud todavía no está aprobada.');
  });

  it('recepción solo trabaja en sus plantas', async () => {
    const s = await aprobada();
    const otra = await enLaLan(recepcionCds.email);
    expect((await otra.post('/api/control/validar', { codigo: urlQr(s), planta_id: 1 })).status).toBe(403);
    // Un autorizante no hace recepción.
    expect((await (await enLaLan(autSs.email)).post('/api/control/validar', { codigo: urlQr(s), planta_id: 1 })).status).toBe(403);
  });

  it('búsqueda manual por DNI, patente o los últimos dígitos del N°', async () => {
    const s = await aprobada();
    const rec = await enLaLan(recepcionSs.email);
    for (const q of ['35.118.276', 'ae 908 tr', s.numero.slice(-6)]) {
      const r = await rec.get(`/api/control/buscar?planta_id=1&q=${encodeURIComponent(q)}`);
      expect(r.body.map((x) => x.numero)).toContain(s.numero);
    }
  });
});

describe('ingreso y egreso', () => {
  it('ingresan dos con el vehículo, sale uno y después el otro; queda todo asentado', async () => {
    const s = await aprobada();
    const rec = await enLaLan(recepcionSs.email);
    const pase = (await rec.post('/api/control/validar', { codigo: urlQr(s), planta_id: 1 })).body;
    const [martin, lucas] = pase.personas;

    const ingreso = await rec.post('/api/control/movimientos', { numero: s.numero, planta_id: 1, tipo: 'ingreso', persona_ids: [martin.id, lucas.id], vehiculo_id: pase.vehiculos[0].id });
    expect(ingreso.status).toBe(201);
    expect(ingreso.body.personas.every((p) => p.dentro)).toBe(true);
    let { rows: [sol] } = await query('SELECT estado, cerrada_at FROM solicitudes WHERE id = $1', [s.id]);
    expect(sol).toEqual({ estado: 'ingreso', cerrada_at: null });

    // No entra dos veces.
    expect((await rec.post('/api/control/movimientos', { numero: s.numero, planta_id: 1, tipo: 'ingreso', persona_ids: [martin.id] })).status).toBe(409);

    // Personas en planta: la ve recepción de la planta, HSE y el autorizante; no la recepción de otra planta.
    const enPlanta = async (email) => (await (await enLaLan(email)).get('/api/control/en-planta')).body.personas.filter((p) => p.numero === s.numero);
    expect((await enPlanta(recepcionSs.email)).map((p) => [p.nombre_apellido, p.patente])).toEqual([['Lucas Barrientos', 'AE908TR'], ['Martín Ojeda', 'AE908TR']]);
    expect(await enPlanta(hse.email)).toHaveLength(2);
    expect(await enPlanta(autSs.email)).toHaveLength(2);
    expect(await enPlanta(recepcionCds.email)).toHaveLength(0);

    await rec.post('/api/control/movimientos', { numero: s.numero, planta_id: 1, tipo: 'egreso', persona_ids: [martin.id] });
    ({ rows: [sol] } = await query('SELECT estado FROM solicitudes WHERE id = $1', [s.id]));
    expect(sol.estado).toBe('ingreso'); // Lucas sigue adentro
    await rec.post('/api/control/movimientos', { numero: s.numero, planta_id: 1, tipo: 'egreso', persona_ids: [lucas.id] });
    ({ rows: [sol] } = await query('SELECT estado, cerrada_at FROM solicitudes WHERE id = $1', [s.id]));
    expect(sol.estado).toBe('egreso');
    expect(sol.cerrada_at).not.toBeNull();

    // Visita de varios días: con el pase en fecha, vuelve a entrar y la solicitud se reabre.
    expect((await rec.post('/api/control/movimientos', { numero: s.numero, planta_id: 1, tipo: 'ingreso', persona_ids: [martin.id] })).status).toBe(201);
    ({ rows: [sol] } = await query('SELECT estado, cerrada_at FROM solicitudes WHERE id = $1', [s.id]));
    expect(sol).toEqual({ estado: 'ingreso', cerrada_at: null });

    // Expediente: cada movimiento con persona, vehículo y quién lo registró; historial sin datos personales.
    const exp = (await (await enLaLan(hse.email)).get(`/api/operador/solicitudes/${s.numero}`)).body;
    expect(exp.movimientos.map((m) => [m.tipo, m.nombre_apellido, m.patente, m.usuario])).toEqual([
      ['ingreso', 'Martín Ojeda', 'AE908TR', 'recepcion.ss'],
      ['ingreso', 'Lucas Barrientos', 'AE908TR', 'recepcion.ss'],
      ['egreso', 'Martín Ojeda', null, 'recepcion.ss'],
      ['egreso', 'Lucas Barrientos', null, 'recepcion.ss'],
      ['ingreso', 'Martín Ojeda', null, 'recepcion.ss'],
    ]);
    const ev = exp.eventos.filter((e) => e.accion.startsWith('registrar'));
    expect(ev.map((e) => [e.accion, e.estado_nuevo])).toEqual([['registrar_ingreso', 'ingreso'], ['registrar_egreso', null], ['registrar_egreso', 'egreso'], ['registrar_ingreso', 'ingreso']]);
    expect(Object.keys(ev[0].detalle).sort()).toEqual(['movimientos', 'planta']);
    expect(exp.personas.find((p) => p.nombre_apellido === 'Martín Ojeda').dentro).toBe(true);
  });

  it('no se registra el ingreso de un pase no habilitado; el egreso sí, aunque haya vencido', async () => {
    const s = await aprobada();
    const rec = await enLaLan(recepcionSs.email);
    const { personas: [p] } = (await rec.get(`/api/control/pases/${s.numero}?planta_id=1`)).body;
    await rec.post('/api/control/movimientos', { numero: s.numero, planta_id: 1, tipo: 'ingreso', persona_ids: [p.id] });
    await query("UPDATE solicitudes SET estado = 'vencida' WHERE id = $1", [s.id]);
    const otra = await rec.post('/api/control/movimientos', { numero: s.numero, planta_id: 1, tipo: 'ingreso', persona_ids: [p.id] });
    expect(otra.status).toBe(409);
    expect((await rec.post('/api/control/movimientos', { numero: s.numero, planta_id: 1, tipo: 'egreso', persona_ids: [p.id] })).status).toBe(201);
  });

  it('el KPI de personas dentro cuenta los ingresos sin egreso', async () => {
    const h = await enLaLan(hse.email);
    const antes = (await h.get('/api/operador/kpis')).body.personas_dentro;
    const s = await aprobada();
    const rec = await enLaLan(recepcionSs.email);
    const { personas } = (await rec.get(`/api/control/pases/${s.numero}?planta_id=1`)).body;
    await rec.post('/api/control/movimientos', { numero: s.numero, planta_id: 1, tipo: 'ingreso', persona_ids: personas.map((p) => p.id) });
    expect((await h.get('/api/operador/kpis')).body.personas_dentro).toBe(antes + 2);
  });
});

describe('sin egreso al final del día', () => {
  it('quien entró ayer y no salió aparece en la lista; HSE lo cierra con motivo', async () => {
    const s = await aprobada();
    const { rows: [p] } = await query('SELECT id FROM solicitud_personas WHERE solicitud_id = $1 ORDER BY id LIMIT 1', [s.id]);
    const { rows: [m] } = await query(
      `INSERT INTO movimientos (solicitud_id, persona_id, tipo, pack_id, planta_id, usuario_id, created_at)
       VALUES ($1, $2, 'ingreso', 1, 1, $3, now() - interval '1 day') RETURNING id`, [s.id, p.id, recepcionSs.id]);
    await query("UPDATE solicitudes SET estado = 'ingreso' WHERE id = $1", [s.id]);

    const h = await enLaLan(hse.email);
    const lista = (await h.get('/api/control/sin-egreso')).body;
    expect(lista.personas.map((x) => x.movimiento_id)).toContain(Number(m.id));
    expect((await (await enLaLan(recepcionSs.email)).get('/api/control/sin-egreso')).status).toBe(403);

    // Aviso a HSE al cierre del día.
    expect(await avisarSinEgreso()).toBeGreaterThan(0);
    const { rows: avisos } = await query("SELECT payload FROM notificaciones_cola WHERE plantilla = 'sin_egreso' ORDER BY id DESC LIMIT 1");
    expect(avisos[0].payload.cantidad).toBeGreaterThan(0);

    expect((await h.post('/api/control/sin-egreso/cerrar', { movimiento_ids: [Number(m.id)], motivo: '' })).status).toBe(422);
    const r = await h.post('/api/control/sin-egreso/cerrar', { movimiento_ids: [Number(m.id)], motivo: 'Confirmado por radio con la planta: salió a las 19:10.' });
    expect(r.body).toEqual({ cerrados: 1 });
    const { rows: [cierre] } = await query("SELECT origen, observacion FROM movimientos WHERE persona_id = $1 AND tipo = 'egreso'", [p.id]);
    expect(cierre).toEqual({ origen: 'cierre_hse', observacion: 'Confirmado por radio con la planta: salió a las 19:10.' });
    const { rows: [sol] } = await query('SELECT estado FROM solicitudes WHERE id = $1', [s.id]);
    expect(sol.estado).toBe('egreso');
    // Ya cerrado: no se cierra dos veces.
    expect((await h.post('/api/control/sin-egreso/cerrar', { movimiento_ids: [Number(m.id)], motivo: 'Otra vez' })).status).toBe(409);
  });
});

describe('pase del visitante', () => {
  it('el mail de aprobación lleva el PDF adjunto además del enlace', async () => {
    const s = await aprobada();
    const m = await armarMensaje({ plantilla: 'aprobada', solicitud_id: s.id, destinatario: 'x@y.com', payload: {} });
    expect(m.adjuntos.find((a) => a.tipo === 'application/pdf')).toMatchObject({ nombre: `pase-${s.numero}.pdf` });
    expect(m.html).toContain('/api/comprobantes/');
  });
});
