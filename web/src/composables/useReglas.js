// Reglas que define la base y el asistente necesita para validar igual que el servidor. Mientras no
// llegan (o si falla la red) rige el valor por defecto del esquema compartido; el servidor valida igual.
import { ref } from 'vue';
import { CATEGORIAS_SIN_DOCUMENTOS } from '@accesos/shared';
import { api } from './api.js';

export const sinDocumentos = ref(CATEGORIAS_SIN_DOCUMENTOS);
let pedido;

export function cargarReglas() {
  pedido ??= api('/catalogo/reglas')
    .then((r) => { sinDocumentos.value = r.categorias_sin_documentos; })
    .catch(() => { pedido = null; });
  return pedido;
}
