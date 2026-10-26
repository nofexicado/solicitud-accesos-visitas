export const NUMERO_RE = /^ACC-(\d{4})-(\d{6})$/;

export function formatearNumero(anio, secuencia) {
  return `ACC-${anio}-${String(secuencia).padStart(6, '0')}`;
}

export function normalizarNumero(valor) {
  const v = String(valor ?? '').toUpperCase().replace(/\s+/g, '');
  const m = v.match(/^(?:VEL)?-?(\d{4})-?(\d{1,6})$/);
  return m ? formatearNumero(m[1], Number(m[2])) : v;
}

export function esNumeroValido(valor) {
  return NUMERO_RE.test(valor ?? '');
}
