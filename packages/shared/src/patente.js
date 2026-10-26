// Patentes argentinas: formato viejo (1995-2016) y Mercosur (2016+), autos y motos.
const FORMATOS = [
  { tipo: 'auto-mercosur', re: /^[A-Z]{2}\d{3}[A-Z]{2}$/, partes: [2, 3, 2] },
  { tipo: 'auto-vieja', re: /^[A-Z]{3}\d{3}$/, partes: [3, 3] },
  { tipo: 'moto-mercosur', re: /^[A-Z]\d{3}[A-Z]{3}$/, partes: [1, 3, 3] },
  { tipo: 'moto-vieja', re: /^\d{3}[A-Z]{3}$/, partes: [3, 3] },
];

export function normalizarPatente(valor) {
  return String(valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function tipoPatente(valor) {
  const p = normalizarPatente(valor);
  return FORMATOS.find((f) => f.re.test(p))?.tipo ?? null;
}

export function esPatenteValida(valor) {
  return tipoPatente(valor) !== null;
}

export function formatearPatente(valor) {
  const p = normalizarPatente(valor);
  const formato = FORMATOS.find((f) => f.re.test(p));
  if (!formato) return p;
  const out = [];
  let i = 0;
  for (const largo of formato.partes) {
    out.push(p.slice(i, i + largo));
    i += largo;
  }
  return out.join(' ');
}
