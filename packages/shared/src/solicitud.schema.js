// Esquemas del asistente de solicitud. El navegador valida cada paso con estos mismos
// esquemas y el servidor vuelve a validar la solicitud completa al recibirla.
import { z } from 'zod';
import { esCuitValido, normalizarCuit } from './cuit.js';
import { esPatenteValida, normalizarPatente } from './patente.js';
import { esDocumentoValido, normalizarDocumento } from './documento.js';
import { esFechaISO, esHora, fechaLocalISO } from './fechas.js';
import { CATEGORIAS } from './estados.js';

const texto = (min, max, msgMin) =>
  z.string({ error: 'Completá este campo' }).trim().min(min, msgMin ?? 'Completá este campo').max(max, `Máximo ${max} caracteres`);

const opcional = (max) => z.string().trim().max(max, `Máximo ${max} caracteres`).optional().default('');

const fecha = z.string({ error: 'Elegí una fecha' }).refine(esFechaISO, 'Fecha inválida');

const idUpload = z.uuid({ error: 'Falta subir el archivo' });

export const pasoSolicitante = z.object({
  razon_social: texto(2, 160, 'Ingresá la razón social'),
  cuit: z
    .string({ error: 'Ingresá el CUIT' })
    .transform(normalizarCuit)
    .refine((v) => v.length === 11, 'El CUIT tiene 11 dígitos')
    .refine(esCuitValido, 'El CUIT no es válido: revisá el dígito verificador'),
  solicitante_nombre: texto(3, 120, 'Ingresá tu nombre y apellido'),
  email: z.email({ error: 'Ingresá un email válido' }).trim().toLowerCase().max(160),
  telefono: z
    .string({ error: 'Ingresá un teléfono' })
    .trim()
    .regex(/^\+?[\d\s()-]{8,20}$/, 'Ingresá un teléfono con código de área'),
});

export const pasoDestino = z
  .object({
    pack_id: z.number({ error: 'Elegí un pack' }).int().positive(),
    planta_id: z.number().int().positive().nullable().default(null),
    otra_locacion: opcional(200),
    contacto_interno: texto(3, 120, 'Indicá a quién visitás'),
    autorizante_id: z.number().int().positive().nullable().default(null),
    pendiente_asignacion: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (!v.planta_id && !v.otra_locacion) {
      ctx.addIssue({ code: 'custom', path: ['planta_id'], message: 'Elegí una planta o describí otra locación' });
    }
    if (!v.autorizante_id && !v.pendiente_asignacion) {
      ctx.addIssue({ code: 'custom', path: ['autorizante_id'], message: 'Elegí un autorizante' });
    }
  });

export const pasoMotivo = z
  .object({
    categoria: z.enum(Object.keys(CATEGORIAS), { error: 'Elegí una categoría' }),
    contrato_ref: opcional(80),
    motivo: texto(10, 2000, 'Describí el motivo y las tareas (mínimo 10 caracteres)'),
    fecha_desde: fecha,
    fecha_hasta: fecha,
    hora_desde: z.string().refine((v) => v === '' || esHora(v), 'Hora inválida').default(''),
    hora_hasta: z.string().refine((v) => v === '' || esHora(v), 'Hora inválida').default(''),
  })
  .superRefine((v, ctx) => {
    const hoy = fechaLocalISO();
    if (esFechaISO(v.fecha_desde) && v.fecha_desde < hoy) {
      ctx.addIssue({ code: 'custom', path: ['fecha_desde'], message: 'La fecha no puede ser anterior a hoy' });
    }
    if (esFechaISO(v.fecha_desde) && esFechaISO(v.fecha_hasta) && v.fecha_hasta < v.fecha_desde) {
      ctx.addIssue({ code: 'custom', path: ['fecha_hasta'], message: 'Tiene que ser igual o posterior a la fecha desde' });
    }
    if (v.hora_desde && v.hora_hasta && v.fecha_desde === v.fecha_hasta && v.hora_hasta <= v.hora_desde) {
      ctx.addIssue({ code: 'custom', path: ['hora_hasta'], message: 'Tiene que ser posterior a la hora de inicio' });
    }
  });

export const persona = z
  .object({
    nombre_apellido: texto(3, 120, 'Ingresá nombre y apellido'),
    tipo_doc: z.enum(['dni', 'pasaporte']).default('dni'),
    nro_doc: z.string({ error: 'Ingresá el documento' }).trim(),
    cargo: texto(2, 80, 'Ingresá el cargo o función'),
  })
  .transform((p) => ({ ...p, nro_doc: normalizarDocumento(p.tipo_doc, p.nro_doc) }))
  .superRefine((p, ctx) => {
    if (!esDocumentoValido(p.tipo_doc, p.nro_doc)) {
      ctx.addIssue({
        code: 'custom',
        path: ['nro_doc'],
        message: p.tipo_doc === 'dni' ? 'El DNI tiene 7 u 8 dígitos' : 'Pasaporte inválido',
      });
    }
  });

export const vehiculo = z.object({
  patente: z
    .string({ error: 'Ingresá la patente' })
    .transform(normalizarPatente)
    .refine(esPatenteValida, 'Formato de patente inválido (ej. ABC123 o AB123CD)'),
  marca_modelo: texto(2, 80, 'Ingresá marca y modelo'),
  vto_seguro: fecha,
  vto_vtv: fecha,
});

export const pasoPersonal = z
  .object({
    personas: z.array(persona).min(1, 'Agregá al menos una persona').max(60, 'Máximo 60 personas por solicitud'),
    vehiculos: z.array(vehiculo).max(30, 'Máximo 30 vehículos por solicitud').default([]),
  })
  .superRefine((v, ctx) => {
    const docs = new Set();
    v.personas.forEach((p, i) => {
      const clave = `${p.tipo_doc}:${p.nro_doc}`;
      if (docs.has(clave)) ctx.addIssue({ code: 'custom', path: ['personas', i, 'nro_doc'], message: 'Documento repetido' });
      docs.add(clave);
    });
    const patentes = new Set();
    v.vehiculos.forEach((x, i) => {
      if (patentes.has(x.patente)) ctx.addIssue({ code: 'custom', path: ['vehiculos', i, 'patente'], message: 'Patente repetida' });
      patentes.add(x.patente);
    });
  });

/**
 * Categorías que no tienen que presentar ART con nómina. Es el valor por defecto: el que rige está en
 * configuracion.categorias_sin_documentos (lo confirma HSE) y el servidor lo publica en /api/catalogo/reglas.
 */
export const CATEGORIAS_SIN_DOCUMENTOS = ['visita'];

export function requiereDocumentos(categoria, sinDocumentos = CATEGORIAS_SIN_DOCUMENTOS) {
  return !sinDocumentos.includes(categoria);
}

const documentosOpcionales = z.object({ doc_art: idUpload.nullable().default(null), doc_nomina: idUpload.nullable().default(null) });

/** El paso de documentos depende de la categoría elegida en el paso de motivo. */
export function esquemaDocumentos(categoria, sinDocumentos = CATEGORIAS_SIN_DOCUMENTOS) {
  return requiereDocumentos(categoria, sinDocumentos)
    ? z.object({ doc_art: idUpload, doc_nomina: idUpload })
    : documentosOpcionales;
}

export const pasoDocumentos = esquemaDocumentos('contratista');

export const pasoSeguridad = z.object({
  induccion_comprobante: z.string({ error: 'Mirá el video de inducción completo' }).min(20, 'Mirá el video de inducción completo'),
  acepta_hse: z.literal(true, { error: 'Tenés que aceptar los requisitos de Seguridad, Salud y Medio Ambiente' }),
});

export const PASOS = [
  { clave: 'solicitante', nombre: 'Solicitante', esquema: pasoSolicitante },
  { clave: 'destino', nombre: 'Destino y anfitrión', esquema: pasoDestino },
  { clave: 'motivo', nombre: 'Motivo y fechas', esquema: pasoMotivo },
  { clave: 'personal', nombre: 'Personal y vehículos', esquema: pasoPersonal },
  { clave: 'documentos', nombre: 'Documentación', esquema: pasoDocumentos },
  { clave: 'seguridad', nombre: 'Seguridad', esquema: pasoSeguridad },
  { clave: 'revision', nombre: 'Revisión y envío', esquema: null },
];

/** Solicitud completa tal como la envía el asistente (un objeto por paso). */
export function esquemaSolicitud(sinDocumentos = CATEGORIAS_SIN_DOCUMENTOS) {
  return z
    .object({
      solicitante: pasoSolicitante,
      destino: pasoDestino,
      motivo: pasoMotivo,
      personal: pasoPersonal,
      documentos: documentosOpcionales,
      seguridad: pasoSeguridad,
    })
    .superRefine((v, ctx) => {
      if (!requiereDocumentos(v.motivo.categoria, sinDocumentos)) return;
      for (const campo of ['doc_art', 'doc_nomina']) {
        if (!v.documentos[campo]) ctx.addIssue({ code: 'custom', path: ['documentos', campo], message: 'Falta subir el archivo' });
      }
    });
}

export const solicitudCompleta = esquemaSolicitud();

/** Avisos que no bloquean: seguro o VTV que vencen antes del fin de la visita. */
export function alertasVehiculo(v, fechaHasta) {
  const alertas = [];
  if (!esFechaISO(fechaHasta)) return alertas;
  if (esFechaISO(v.vto_seguro) && v.vto_seguro < fechaHasta) alertas.push('El seguro vence antes del fin de la visita');
  if (esFechaISO(v.vto_vtv) && v.vto_vtv < fechaHasta) alertas.push('La VTV vence antes del fin de la visita');
  return alertas;
}

/** Errores de zod como { 'ruta.al.campo': 'mensaje' } para mostrarlos junto a cada campo. */
export function erroresPorCampo(error) {
  const out = {};
  for (const issue of error?.issues ?? []) {
    const clave = issue.path.join('.');
    if (!(clave in out)) out[clave] = issue.message;
  }
  return out;
}
