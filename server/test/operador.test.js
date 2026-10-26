import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query } from '../src/db.js';
import { cargarDetalle } from '../src/modules/detalle.js';
import { app } from './ayuda.js';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { equipoListo, solicitud, enviar, PDF } from './fabrica.js';

// Operadores de prueba. Costo bajo de bcrypt para que los tests no tarden; el formato es el mismo.
const CLAVE = 'clave-de-prueba-123';
const creados = [];
async function operador(email, roles, plantas = []) {
  const { rows: [u] } = await query(
    `INSERT INTO usuarios (email, nombre, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET activo = true, intentos_fallidos = 0, bloqueado_hasta = NULL, password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [email, email.split('@')[0], bcrypt.hashSync(CLAVE, 4)],
  );
  await query('DELETE FROM usuario_roles WHERE usuario_id = $1', [u.id]);
  for (const r of roles) await query('INSERT INTO usuario_roles VALUES ($1, $2)', [u.id, r]);
  await query('DELETE FROM autorizante_plantas WHERE usuario_id = $1', [u.id]);
  for (const p of plantas) await query('INSERT INTO autorizante_plantas VALUES ($1, $2)', [u.id, p]);
  creados.push(u.id);
  return { id: u.id, email };
}

/** Navegador en la LAN (nginx interno pone X-Canal: interno) con sesión iniciada. */
async function enLaLan(email, clave = CLAVE) {
  const agente = request.agent(app);
  const conCanal = (r) => r.set('X-Canal', 'interno').set('X-Requested-With', 'accesos');
  const login = await conCanal(agente.post('/api/auth/login')).send({ email, password: clave });
  return {
    login,
    get: (ruta) => agente.get(ruta).set('X-Canal', 'interno'),
    post: (ruta, cuerpo) => conCanal(agente.post(ruta)).send(cuerpo),
    patch: (ruta, cuerpo) => conCanal(agente.patch(ruta)).send(cuerpo),
  };
}

// Equipo (navegador del solicitante) de cada solicitud creada, para probar lo que hace él.
const equipos = new Map();
async function nuevaSolicitud(cambios = {}) {
  const listo = await equipoListo();
  const base = solicitud(listo);
  const r = await enviar(listo.e, { ...base, ...cambios, solicitante: { ...base.solicitante, ...cambios.solicitante } });
  expect(r.status).toBe(201);
  equipos.set(r.body.numero, listo.e);
  return r.body.numero;
}
const mailsDe = async (numero) => (await query(
  'SELECT n.plantilla, n.destinatario, n.payload FROM notificaciones_cola n JOIN solicitudes s ON s.id = n.solicitud_id WHERE s.numero = $1 ORDER BY n.id',
  [numero])).rows;

let hse, hse2, autSs, autSs2, autCds, doble, admin;
beforeAll(async () => {
  hse = await operador('carla.hse@ejemplo.test', ['hse']);
  hse2 = await operador('diego.hse@ejemplo.test', ['hse']);
  autSs = await operador('laura.aut@ejemplo.test', ['autorizante'], [1]); // Norte 1
  autCds = await operador('pablo.aut@ejemplo.test', ['autorizante'], [2]); // Norte 2
  doble = await operador('ana.doble@ejemplo.test', ['hse', 'autorizante'], [1]);
  autSs2 = await operador('marcos.aut@ejemplo.test', ['autorizante'], [1]);
  admin = await operador('admin@ejemplo.test', ['admin']);
});
// Que no queden como destinatarios de los mails de HSE en otros tests.
afterAll(() => query('UPDATE usuarios SET activo = false WHERE id = ANY($1)', [creados]));

describe('login y canal', () => {
  it('desde internet no existen ni el login ni el panel', async () => {
    const r = await request(app).post('/api/auth/login').set('X-Requested-With', 'accesos').send({ email: hse.email, password: CLAVE });
    expect(r.status).toBe(404);
    expect((await request(app).get('/api/operador/kpis')).status).toBe(404);
    // X-Canal falsificado desde afuera: igual externo (en los tests la conexión es loopback, así que
    // esto lo cubre canal.test con una IP no loopback).
  });

  it('ingresa con la cookie httpOnly y devuelve roles y plantas', async () => {
    const s = await enLaLan(autSs.email);
    expect(s.login.status).toBe(200);
    expect(s.login.body).toMatchObject({ email: autSs.email, roles: ['autorizante'], plantas: [1] });
    const cookie = s.login.headers['set-cookie'].find((c) => c.startsWith('acc_sesion='));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect((await s.get('/api/auth/me')).body.email).toBe(autSs.email);
  });

  it('contraseña mal: mismo mensaje que email inexistente; a los 5 intentos bloquea', async () => {
    const u = await operador('bloqueo@ejemplo.test', ['hse']);
    const mal = await enLaLan(u.email, 'otra-clave-cualquiera');
    const nadie = await enLaLan('nadie@ejemplo.test', 'otra-clave-cualquiera');
    expect(mal.login.status).toBe(401);
    expect(nadie.login.body.error).toBe(mal.login.body.error);
    for (let i = 0; i < 4; i += 1) await enLaLan(u.email, 'otra-clave-cualquiera');
    const bloqueado = await enLaLan(u.email);
    expect(bloqueado.login.status).toBe(423);
    expect(bloqueado.login.body.error).toMatch(/Probá de nuevo a las/);
  });

  it('/auth/sesion responde 200 con o sin sesión (el front lo usa al arrancar)', async () => {
    expect((await request(app).get('/api/auth/sesion').set('X-Canal', 'interno')).body).toEqual({ usuario: null });
    const s = await enLaLan(hse.email);
    expect((await s.get('/api/auth/sesion')).body.usuario.email).toBe(hse.email);
  });

  it('sin sesión el panel responde 401; después del logout la cookie vieja no sirve', async () => {
    expect((await request(app).get('/api/operador/kpis').set('X-Canal', 'interno')).status).toBe(401);
    const s = await enLaLan(hse.email);
    const cookie = s.login.headers['set-cookie'].find((c) => c.startsWith('acc_sesion=')).split(';')[0];
    expect((await s.post('/api/auth/logout')).status).toBe(204);
    const r = await request(app).get('/api/operador/kpis').set('X-Canal', 'interno').set('Cookie', cookie);
    expect(r.status).toBe(401);
  });

  it('un usuario sin rol de operador no entra al panel', async () => {
    const u = await operador('porteria@ejemplo.test', ['porteria']);
    const s = await enLaLan(u.email);
    expect((await s.get('/api/operador/kpis')).status).toBe(403);
  });
});

describe('circuito de una solicitud', () => {
  it('Enviada → HSE toma, acepta documentos y valida → el autorizante aprueba', async () => {
    const numero = await nuevaSolicitud();
    const h = await enLaLan(hse.email);
    const a = await enLaLan(autSs.email);

    let exp = (await h.get(`/api/operador/solicitudes/${numero}`)).body;
    expect(exp.permisos).toMatchObject({ tomar: true, validar: false, aprobar: false });
    expect((await h.post(`/api/operador/solicitudes/${numero}/tomar`)).body.estado).toBe('validacion_hse');

    // Validar está trabado hasta aceptar los documentos.
    exp = (await h.get(`/api/operador/solicitudes/${numero}`)).body;
    expect(exp.permisos.bloqueos.validar).toBe('Falta aceptar 2 documentos');
    const trabada = await h.post(`/api/operador/solicitudes/${numero}/validar-hse`);
    expect(trabada.status).toBe(409);
    expect(trabada.body.error).toBe('Falta aceptar 2 documentos');

    for (const d of exp.documentos) expect((await h.patch(`/api/operador/documentos/${d.id}`, { estado: 'aceptado' })).status).toBe(200);
    expect((await h.post(`/api/operador/solicitudes/${numero}/validar-hse`)).body.estado).toBe('pendiente_autorizacion');

    // El autorizante de la planta la ve en su bandeja y la aprueba.
    const bandeja = (await a.get('/api/operador/solicitudes?vista=autorizar')).body;
    expect(bandeja.map((x) => x.numero)).toContain(numero);
    expect((await a.post(`/api/operador/solicitudes/${numero}/aprobar`)).body.estado).toBe('aprobada');

    const { rows: [s] } = await query('SELECT id, estado, autorizante_id FROM solicitudes WHERE numero = $1', [numero]);
    expect(s).toMatchObject({ estado: 'aprobada', autorizante_id: autSs.id });
    const { rows: ev } = await query('SELECT accion, usuario_id, actor, detalle FROM solicitud_eventos WHERE solicitud_id = $1 ORDER BY id', [s.id]);
    expect(ev.map((e) => e.accion)).toEqual(['enviar', 'tomar_hse', 'revisar_documento', 'revisar_documento', 'validar_hse', 'aprobar']);
    expect(ev.find((e) => e.accion === 'aprobar')).toMatchObject({ usuario_id: autSs.id, actor: 'autorizante' });
    expect(ev.find((e) => e.accion === 'revisar_documento').detalle).toEqual({ documento: 'art', resultado: 'aceptado' });

    // Mails de cada etapa: al solicitante (validada y aprobada) y al autorizante de la planta.
    const { rows: mails } = await query('SELECT plantilla, destinatario FROM notificaciones_cola WHERE solicitud_id = $1 ORDER BY id', [s.id]);
    expect(mails).toEqual(expect.arrayContaining([
      { plantilla: 'validada_hse', destinatario: 'mojeda@ejemplo.com' },
      { plantilla: 'aviso_autorizante', destinatario: autSs.email },
      { plantilla: 'aprobada', destinatario: 'mojeda@ejemplo.com' },
    ]));

    // El historial que ve el invitado muestra los cambios de estado, no la revisión interna.
    const publico = await cargarDetalle({ id: s.id });
    expect(publico.eventos.map((e) => e.accion)).toEqual(['enviar', 'tomar_hse', 'validar_hse', 'aprobar']);
  });

  it('el autorizante de otra planta no la ve ni puede aprobarla (404)', async () => {
    const numero = await nuevaSolicitud();
    const otro = await enLaLan(autCds.email);
    expect((await otro.get(`/api/operador/solicitudes/${numero}`)).status).toBe(404);
    expect((await otro.post(`/api/operador/solicitudes/${numero}/aprobar`)).status).toBe(404);
    expect((await otro.get('/api/operador/solicitudes?vista=todas')).body.map((x) => x.numero)).not.toContain(numero);
  });

  it('nadie aprueba lo propio: ni con el mismo email ni habiendo validado como HSE', async () => {
    // Pedida con el email del autorizante.
    const propia = await nuevaSolicitud({ solicitante: { email: autSs.email } });
    const h = await enLaLan(hse.email);
    await llevarAAutorizacion(h, propia);
    const a = await enLaLan(autSs.email);
    const r = await a.post(`/api/operador/solicitudes/${propia}/aprobar`);
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/solicitud tuya/);

    // Validada por alguien que también es autorizante de la planta: no puede firmar las dos veces.
    const numero = await nuevaSolicitud();
    const d = await enLaLan(doble.email);
    await llevarAAutorizacion(d, numero);
    const segunda = await d.post(`/api/operador/solicitudes/${numero}/aprobar`);
    expect(segunda.status).toBe(403);
    expect(segunda.body.error).toMatch(/validaste como HSE/);
    expect((await a.post(`/api/operador/solicitudes/${numero}/aprobar`)).status).toBe(200);
  });

  it('HSE no valida una solicitud pedida con su propio email', async () => {
    const numero = await nuevaSolicitud({ solicitante: { email: hse2.email } });
    const h = await enLaLan(hse2.email);
    await h.post(`/api/operador/solicitudes/${numero}/tomar`);
    const exp = (await h.get(`/api/operador/solicitudes/${numero}`)).body;
    for (const doc of exp.documentos) await h.patch(`/api/operador/documentos/${doc.id}`, { estado: 'aceptado' });
    const r = await h.post(`/api/operador/solicitudes/${numero}/validar-hse`);
    expect(r.status).toBe(403);
  });

  it('rechazar pide motivo; queda rechazada, cerrada y con mail al solicitante', async () => {
    const numero = await nuevaSolicitud();
    const h = await enLaLan(hse.email);
    const sinMotivo = await h.post(`/api/operador/solicitudes/${numero}/rechazar`, { motivo: 'corto' });
    expect(sinMotivo.status).toBe(422);
    expect(sinMotivo.body.campos.motivo).toBeTruthy();
    const r = await h.post(`/api/operador/solicitudes/${numero}/rechazar`, { motivo: 'La ART no cubre las fechas de la visita.' });
    expect(r.body.estado).toBe('rechazada');
    const { rows: [s] } = await query('SELECT id, motivo_rechazo, cerrada_at FROM solicitudes WHERE numero = $1', [numero]);
    expect(s.motivo_rechazo).toBe('La ART no cubre las fechas de la visita.');
    expect(s.cerrada_at).not.toBeNull();
    const { rows: ev } = await query("SELECT detalle FROM solicitud_eventos WHERE solicitud_id = $1 AND accion = 'rechazar_hse'", [s.id]);
    expect(ev[0].detalle).toEqual({}); // el motivo no va al historial
    // Ya no se puede tomar ni aprobar.
    expect((await h.post(`/api/operador/solicitudes/${numero}/tomar`)).status).toBe(409);
  });

  it('observar un documento pide la observación y traba la validación', async () => {
    const numero = await nuevaSolicitud();
    const h = await enLaLan(hse.email);
    const antes = (await h.get(`/api/operador/solicitudes/${numero}`)).body;
    // Sin tomarla no se revisan documentos.
    expect((await h.patch(`/api/operador/documentos/${antes.documentos[0].id}`, { estado: 'aceptado' })).status).toBe(409);
    await h.post(`/api/operador/solicitudes/${numero}/tomar`);
    expect((await h.patch(`/api/operador/documentos/${antes.documentos[0].id}`, { estado: 'observado' })).status).toBe(422);
    const docs = (await h.patch(`/api/operador/documentos/${antes.documentos[0].id}`, { estado: 'observado', observacion: 'La ART venció el 20/10.' })).body;
    expect(docs[0]).toMatchObject({ estado_revision: 'observado', observacion: 'La ART venció el 20/10.' });
    await h.patch(`/api/operador/documentos/${antes.documentos[1].id}`, { estado: 'aceptado' });
    expect((await h.get(`/api/operador/solicitudes/${numero}`)).body.permisos.bloqueos.validar).toBe('Falta aceptar 1 documento');
  });

  it('asignar autorizante: solo uno de la planta; si ya espera, le llega el aviso', async () => {
    const numero = await nuevaSolicitud();
    const h = await enLaLan(hse.email);
    await llevarAAutorizacion(h, numero);
    const mal = await h.post(`/api/operador/solicitudes/${numero}/asignar-autorizante`, { usuario_id: autCds.id });
    expect(mal.status).toBe(422);
    expect((await h.post(`/api/operador/solicitudes/${numero}/asignar-autorizante`, { usuario_id: doble.id })).status).toBe(200);
    const { rows: [s] } = await query('SELECT id, autorizante_id FROM solicitudes WHERE numero = $1', [numero]);
    expect(s.autorizante_id).toBe(doble.id);
    const { rows } = await query("SELECT destinatario FROM notificaciones_cola WHERE solicitud_id = $1 AND plantilla = 'aviso_autorizante'", [s.id]);
    expect(rows.map((r) => r.destinatario)).toContain(doble.email);
  });

  it('descarga de un documento: como adjunto para HSE, 404 para un autorizante de otra planta', async () => {
    const numero = await nuevaSolicitud();
    const h = await enLaLan(hse.email);
    const { documentos: [doc] } = (await h.get(`/api/operador/solicitudes/${numero}`)).body;
    const r = await h.get(`/api/operador/documentos/${doc.id}/archivo`);
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/^attachment/);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    const otro = await enLaLan(autCds.email);
    expect((await otro.get(`/api/operador/documentos/${doc.id}/archivo`)).status).toBe(404);
  });

  it('KPIs y bandeja de HSE: cuentan lo que está en su alcance', async () => {
    const numero = await nuevaSolicitud();
    const h = await enLaLan(hse.email);
    const k = (await h.get('/api/operador/kpis')).body;
    expect(k.en_hse).toBeGreaterThan(0);
    expect(typeof k.personas_dentro).toBe('number');
    const fila = (await h.get('/api/operador/solicitudes?vista=hse')).body.find((x) => x.numero === numero);
    expect(fila).toMatchObject({ empresa: 'Contratista Ejemplo SA', planta: 'Planta Norte 1', personas: 2, vehiculos: 1 });
    // Búsqueda por patente y por DNI.
    expect((await h.get('/api/operador/solicitudes?q=ae908tr')).body.map((x) => x.numero)).toContain(numero);
    expect((await h.get('/api/operador/solicitudes?q=35118276')).body.map((x) => x.numero)).toContain(numero);
  });
});

describe('revisiones antes de la Fase 3', () => {
  it('documento observado: mail al solicitante, lo reemplaza desde su equipo y vuelve a pendiente con aviso a HSE', async () => {
    const numero = await nuevaSolicitud();
    const h = await enLaLan(hse.email);
    await h.post(`/api/operador/solicitudes/${numero}/tomar`);
    const { documentos: [, nomina] } = (await h.get(`/api/operador/solicitudes/${numero}`)).body;
    await h.patch(`/api/operador/documentos/${nomina.id}`, { estado: 'observado', observacion: 'Falta Lucas Barrientos en la nómina.' });
    expect(await mailsDe(numero)).toContainEqual({ plantilla: 'documento_observado', destinatario: 'mojeda@ejemplo.com', payload: { documento: 'nomina', observacion: 'Falta Lucas Barrientos en la nómina.' } });

    // El solicitante ve la observación en su detalle.
    const e = equipos.get(numero);
    const antes = (await e.get(`/api/solicitudes/${numero}`)).body;
    expect(antes.documentos.find((d) => d.tipo === 'nomina')).toMatchObject({ estado_revision: 'observado', observacion: 'Falta Lucas Barrientos en la nómina.' });
    // El ART no está observado: no se reemplaza. Desde otro equipo, la solicitud no existe.
    const subir = async (eq) => (await eq.agente.post('/api/uploads').set('X-Requested-With', 'accesos').attach('archivo', PDF, 'nomina-corregida.pdf')).body.id;
    expect((await e.post(`/api/solicitudes/${numero}/documentos/art/reemplazo`, { upload_id: await subir(e) })).status).toBe(409);
    const otro = (await equipoListo({ subirDocs: false })).e;
    expect((await otro.post(`/api/solicitudes/${numero}/documentos/nomina/reemplazo`, { upload_id: await subir(otro) })).status).toBe(404);

    const { rows: [viejo] } = await query("SELECT d.archivo FROM documentos d JOIN solicitudes s ON s.id = d.solicitud_id WHERE s.numero = $1 AND d.tipo = 'nomina'", [numero]);
    const r = await e.post(`/api/solicitudes/${numero}/documentos/nomina/reemplazo`, { upload_id: await subir(e) });
    expect(r.status).toBe(200);
    expect(r.body.documentos.find((d) => d.tipo === 'nomina')).toMatchObject({ estado_revision: 'pendiente', nombre: 'nomina-corregida.pdf' });
    expect(r.body.eventos.map((x) => x.accion)).toContain('reemplazar_documento');
    expect(fs.existsSync(path.join(config.dirs.uploads, viejo.archivo))).toBe(false);
    expect(await mailsDe(numero)).toContainEqual({ plantilla: 'documento_reemplazado', destinatario: hse.email, payload: { documento: 'nomina' } });

    // En el expediente: pendiente otra vez, con la observación anterior a la vista, y en el historial.
    const exp = (await h.get(`/api/operador/solicitudes/${numero}`)).body;
    expect(exp.documentos[1]).toMatchObject({ estado_revision: 'pendiente', observacion: 'Falta Lucas Barrientos en la nómina.' });
    expect(exp.eventos.find((x) => x.accion === 'reemplazar_documento')).toMatchObject({ actor: 'invitado', detalle: { documento: 'nomina' } });
    expect(exp.permisos.bloqueos.validar).toBe('Falta aceptar 2 documentos');
  });

  it('planta sin autorizantes: avisa a HSE y admin, y la bandeja lo marca', async () => {
    const listo = await equipoListo();
    const base = solicitud(listo);
    const r = await enviar(listo.e, { ...base, destino: { ...base.destino, pack_id: 2, planta_id: 3 } });
    expect(r.status).toBe(201);
    const numero = r.body.numero;
    const h = await enLaLan(hse.email);
    await llevarAAutorizacion(h, numero);
    const destinos = (await mailsDe(numero)).filter((m) => m.plantilla === 'sin_autorizante').map((m) => m.destinatario);
    expect(destinos).toEqual(expect.arrayContaining([hse.email, hse2.email, admin.email]));
    expect(destinos).not.toContain(autSs.email);
    const fila = (await h.get('/api/operador/solicitudes?vista=autorizar')).body.find((x) => x.numero === numero);
    expect(fila.planta_sin_autorizantes).toBe(true);
    expect((await h.get(`/api/operador/solicitudes/${numero}`)).body.planta_sin_autorizantes).toBe(true);
  });

  it('aviso a todos los autorizantes de la planta: el primero que la toma queda asignado y los demás ven quién', async () => {
    const numero = await nuevaSolicitud();
    const h = await enLaLan(hse.email);
    await llevarAAutorizacion(h, numero);
    const avisos = (await mailsDe(numero)).filter((m) => m.plantilla === 'aviso_autorizante');
    expect(avisos.map((m) => m.destinatario)).toEqual(expect.arrayContaining([autSs.email, autSs2.email]));
    expect(avisos[0].payload).toEqual({ compartida: true });

    const marcos = await enLaLan(autSs2.email);
    const laura = await enLaLan(autSs.email);
    expect((await laura.get(`/api/operador/solicitudes/${numero}`)).body.permisos.tomar_autorizacion).toBe(true);
    expect((await marcos.post(`/api/operador/solicitudes/${numero}/tomar-autorizacion`)).status).toBe(200);

    const vista = (await laura.get(`/api/operador/solicitudes/${numero}`)).body;
    expect(vista.permisos).toMatchObject({ tomar_autorizacion: false, rechazar: false });
    expect(vista.permisos.bloqueos.aprobar).toMatch(/^La tomó marcos\./);
    expect((await laura.post(`/api/operador/solicitudes/${numero}/aprobar`)).status).toBe(403);
    expect((await laura.post(`/api/operador/solicitudes/${numero}/tomar-autorizacion`)).status).toBe(409);
    expect((await laura.post(`/api/operador/solicitudes/${numero}/rechazar`, { motivo: 'No corresponde esta semana.' })).status).toBe(409);
    expect((await laura.get('/api/operador/solicitudes?vista=autorizar')).body.find((x) => x.numero === numero).autorizante).toBe('marcos.aut');
    expect((await marcos.post(`/api/operador/solicitudes/${numero}/aprobar`)).status).toBe(200);
  });

  it('aprobar o rechazar sin haberla tomado también la asigna', async () => {
    const numero = await nuevaSolicitud();
    await llevarAAutorizacion(await enLaLan(hse.email), numero);
    const marcos = await enLaLan(autSs2.email);
    expect((await marcos.post(`/api/operador/solicitudes/${numero}/rechazar`, { motivo: 'La visita coincide con un paro de planta.' })).status).toBe(200);
    const { rows: [x] } = await query('SELECT autorizante_id FROM solicitudes WHERE numero = $1', [numero]);
    expect(x.autorizante_id).toBe(autSs2.id);
  });
});

async function llevarAAutorizacion(s, numero) {
  await s.post(`/api/operador/solicitudes/${numero}/tomar`);
  const exp = (await s.get(`/api/operador/solicitudes/${numero}`)).body;
  for (const d of exp.documentos) await s.patch(`/api/operador/documentos/${d.id}`, { estado: 'aceptado' });
  const r = await s.post(`/api/operador/solicitudes/${numero}/validar-hse`);
  expect(r.status).toBe(200);
}
