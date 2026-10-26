// CUIT/CUIL argentino: 11 dígitos, prefijo de tipo de persona y dígito verificador módulo 11.
const PREFIJOS = new Set(['20', '23', '24', '25', '26', '27', '30', '33', '34']);
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function normalizarCuit(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

export function digitoVerificadorCuit(diezDigitos) {
  const suma = PESOS.reduce((acc, peso, i) => acc + peso * Number(diezDigitos[i]), 0);
  const resto = 11 - (suma % 11);
  if (resto === 11) return 0;
  if (resto === 10) return null; // combinación inválida: AFIP reasigna el prefijo
  return resto;
}

export function esCuitValido(valor) {
  const cuit = normalizarCuit(valor);
  if (!/^\d{11}$/.test(cuit)) return false;
  if (!PREFIJOS.has(cuit.slice(0, 2))) return false;
  const dv = digitoVerificadorCuit(cuit.slice(0, 10));
  return dv !== null && dv === Number(cuit[10]);
}

export function formatearCuit(valor) {
  const cuit = normalizarCuit(valor);
  if (cuit.length !== 11) return String(valor ?? '');
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit[10]}`;
}
