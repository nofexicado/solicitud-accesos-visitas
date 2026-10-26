// Formatos del panel de operador, en hora de Tierra del Fuego.
import { ZONA_HORARIA, fechaLocalISO } from '@accesos/shared';

export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** '2026-10-23' → '23/10' */
export const diaMes = (iso) => (iso ? `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}` : '');
export const rango = (desde, hasta) => (desde === hasta ? diaMes(desde) : `${diaMes(desde)} al ${diaMes(hasta)}`);

const enZona = (instante, opciones) => new Date(instante).toLocaleString('es-AR', { timeZone: ZONA_HORARIA, hourCycle: 'h23', ...opciones });
export const fechaHora = (instante) => (instante ? `${enZona(instante, { day: 'numeric', month: 'numeric' })} ${enZona(instante, { hour: '2-digit', minute: '2-digit' })}` : '');

/** Cuándo llegó a la bandeja: "hace 12 min", "hace 2 h", "ayer", "20/10". */
export function hace(instante) {
  const min = Math.round((Date.now() - new Date(instante)) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const dia = fechaLocalISO(new Date(instante));
  if (dia === fechaLocalISO()) return `hace ${Math.round(min / 60)} h`;
  if (dia === fechaLocalISO(new Date(Date.now() - 864e5))) return 'ayer';
  return diaMes(dia);
}

/** Cuándo empieza la visita, dicho para decidir: "hoy", "mañana", "23/10". */
export function cuandoEmpieza(desde) {
  if (desde <= fechaLocalISO()) return 'hoy';
  if (desde === fechaLocalISO(new Date(Date.now() + 864e5))) return 'mañana';
  return diaMes(desde);
}

export const ACCIONES = {
  enviar: 'Enviada',
  tomar_hse: 'Tomada por HSE',
  revisar_documento: 'Documento revisado',
  validar_hse: 'Validada por HSE',
  rechazar_hse: 'Rechazada por HSE',
  asignar_autorizante: 'Autorizante asignado',
  tomar_autorizacion: 'Tomada para autorizar',
  reemplazar_documento: 'Documento reemplazado',
  aprobar: 'Aprobada',
  rechazar: 'Rechazada por la planta',
  registrar_ingreso: 'Ingreso registrado',
  registrar_egreso: 'Egreso registrado',
  cerrar_egreso: 'Egreso cerrado por HSE',
  vencer: 'Venció',
  depurada: 'Datos personales borrados',
};

export const DOCUMENTOS = { art: 'Certificado de ART', nomina: 'Nómina del personal', otro: 'Otro documento' };
// "Certificado de ART aceptado", "Nómina del personal aceptada".
const FEMENINOS = ['nomina'];
export const resultadoDoc = (tipo, resultado) => {
  const raiz = { aceptado: 'aceptad', observado: 'observad', reemplazado: 'reemplazad' }[resultado];
  return raiz ? raiz + (FEMENINOS.includes(tipo) ? 'a' : 'o') : 'revisado';
};

export const tamano = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
