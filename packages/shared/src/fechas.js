// Todas las fechas de negocio se interpretan en la hora de Tierra del Fuego.
export const ZONA_HORARIA = 'America/Argentina/Ushuaia';

const fmtFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Fecha ISO (AAAA-MM-DD) del día en Tierra del Fuego para el instante dado. */
export function fechaLocalISO(instante = new Date()) {
  return fmtFecha.format(instante);
}

export function esFechaISO(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor ?? '')) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

export function esHora(valor) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(valor ?? '');
}
