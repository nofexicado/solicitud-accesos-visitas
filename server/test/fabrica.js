// Arma un equipo listo para enviar: inducción completa (con el reloj adelantado) y documentos subidos.
import crypto from 'node:crypto';
import { vi } from 'vitest';
import { fechaLocalISO } from '@accesos/shared';
import { equipo } from './ayuda.js';

export const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

const enDias = (n) => {
  const d = new Date(`${fechaLocalISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function equipoListo({ subirDocs = true } = {}) {
  const e = equipo();
  const v = await e.get('/api/induccion/video?planta=1');
  const { body: { recibo } } = await e.post('/api/induccion/iniciar', { video_id: v.body.id });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + 121_000);
  const { body: { comprobante } } = await e.post('/api/induccion/completar', { recibo });
  vi.useRealTimers();
  const subir = async (n) => (await e.agente.post('/api/uploads').set('X-Requested-With', 'accesos').attach('archivo', PDF, n)).body.id;
  const docs = subirDocs ? { doc_art: await subir('art.pdf'), doc_nomina: await subir('nomina.pdf') } : { doc_art: null, doc_nomina: null };
  return { e, comprobante, docs };
}

export function solicitud({ comprobante, docs }, cambios = {}) {
  return {
    solicitante: { razon_social: 'Contratista Ejemplo SA', cuit: '30-12345678-1', solicitante_nombre: 'Martín Ojeda', email: 'mojeda@ejemplo.com', telefono: '2964 41-5520' },
    destino: { pack_id: 1, planta_id: 1, otra_locacion: '', contacto_interno: 'Ing. Laura Benítez', autorizante_id: null, pendiente_asignacion: true },
    motivo: { categoria: 'contratista', contrato_ref: 'OT 4471', motivo: 'Cambio de válvulas en el manifold de entrada.', fecha_desde: enDias(1), fecha_hasta: enDias(3), hora_desde: '07:00', hora_hasta: '18:00' },
    personal: {
      personas: [{ nombre_apellido: 'Martín Ojeda', tipo_doc: 'dni', nro_doc: '28.441.902', cargo: 'Supervisor' }, { nombre_apellido: 'Lucas Barrientos', tipo_doc: 'dni', nro_doc: '35118276', cargo: 'Soldador' }],
      vehiculos: [{ patente: 'AE 908 TR', marca_modelo: 'Ford Ranger', vto_seguro: enDias(200), vto_vtv: enDias(2) }],
    },
    documentos: docs,
    seguridad: { induccion_comprobante: comprobante, acepta_hse: true },
    ...cambios,
  };
}

export const enviar = (e, cuerpo, clave = crypto.randomUUID()) =>
  e.agente.post('/api/solicitudes').set('X-Requested-With', 'accesos').set('Idempotency-Key', clave).send(cuerpo);
