// Canal desde el que se ve el portal (interno = LAN). Solo comodidad de UI: la protección real
// está en nginx y en el backend.
import { ref } from 'vue';
import { api } from './api.js';

export const canal = ref('externo');
let pedido;

export function cargarCanal() {
  // Si falla (API caída), no se guarda: la próxima navegación vuelve a preguntar.
  pedido ??= api('/canal').then((r) => { canal.value = r.canal; }).catch(() => { pedido = null; });
  return pedido;
}
