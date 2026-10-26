// Máquina de estados de una solicitud. Única fuente de verdad para backend y frontend.
// El "borrador" existe solo en el navegador; en el servidor una solicitud nace en "enviada".

export const ESTADOS = {
  enviada: { etiqueta: 'Enviada', tono: 'pendiente' },
  validacion_hse: { etiqueta: 'Validación HSE', tono: 'pendiente' },
  pendiente_autorizacion: { etiqueta: 'Pendiente de autorización', tono: 'pendiente' },
  aprobada: { etiqueta: 'Aprobada', tono: 'habilitado' },
  rechazada: { etiqueta: 'Rechazada', tono: 'negativo' },
  ingreso: { etiqueta: 'Ingresó', tono: 'habilitado' },
  egreso: { etiqueta: 'Egresó', tono: 'neutral' },
  vencida: { etiqueta: 'Vencida', tono: 'negativo' },
};

export const ESTADOS_PENDIENTES = ['enviada', 'validacion_hse', 'pendiente_autorizacion'];
export const ESTADOS_APROBADOS = ['aprobada', 'ingreso', 'egreso'];
export const ESTADOS_ABIERTOS = [...ESTADOS_PENDIENTES, 'aprobada', 'ingreso'];

// accion → { desde, hacia, roles }. "sistema" lo ejecutan los jobs, nunca un usuario.
export const TRANSICIONES = {
  tomar_hse: { desde: ['enviada'], hacia: 'validacion_hse', roles: ['hse'] },
  validar_hse: { desde: ['validacion_hse'], hacia: 'pendiente_autorizacion', roles: ['hse'] },
  rechazar_hse: { desde: ['enviada', 'validacion_hse'], hacia: 'rechazada', roles: ['hse'], requiereMotivo: true },
  aprobar: { desde: ['pendiente_autorizacion'], hacia: 'aprobada', roles: ['autorizante'] },
  rechazar: { desde: ['pendiente_autorizacion'], hacia: 'rechazada', roles: ['autorizante'], requiereMotivo: true },
  registrar_ingreso: { desde: ['aprobada', 'egreso'], hacia: 'ingreso', roles: ['porteria'] },
  registrar_egreso: { desde: ['ingreso'], hacia: 'egreso', roles: ['porteria'] },
  vencer: { desde: ['enviada', 'validacion_hse', 'pendiente_autorizacion', 'aprobada'], hacia: 'vencida', roles: ['sistema'] },
};

export function transicion(accion, estadoActual) {
  const t = TRANSICIONES[accion];
  if (!t || !t.desde.includes(estadoActual)) return null;
  return t;
}

export function puedeEjecutar(accion, estadoActual, roles) {
  const t = transicion(accion, estadoActual);
  return Boolean(t && t.roles.some((r) => roles.includes(r)));
}

export function etiquetaEstado(estado) {
  return ESTADOS[estado]?.etiqueta ?? estado;
}

export const CATEGORIAS = {
  visita: 'Visita',
  contratista: 'Contratista – trabajos operativos',
  servicio_tecnico: 'Servicio técnico',
  auditoria: 'Auditoría',
  proveedor: 'Entrega / Proveedor',
  otro: 'Otro',
};
