export function normalizarDocumento(tipo, valor) {
  const v = String(valor ?? '').toUpperCase();
  return tipo === 'dni' ? v.replace(/\D/g, '') : v.replace(/[^A-Z0-9]/g, '');
}

export function esDocumentoValido(tipo, valor) {
  const v = normalizarDocumento(tipo, valor);
  if (tipo === 'dni') return /^\d{7,8}$/.test(v);
  if (tipo === 'pasaporte') return /^[A-Z0-9]{6,12}$/.test(v);
  return false;
}
