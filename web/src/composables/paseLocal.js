// Copia del pase en este equipo, para verlo sin señal (en la ruta a los yacimientos no hay cobertura).
// El service worker guarda la página; esto guarda los datos aunque el service worker no esté activo.
import { api } from './api.js';

const clave = (numero) => `accesos-pase-${numero}`;
const CACHE_DATOS = 'accesos-datos-v1';

export async function cargarPase(numero) {
  try {
    const d = await api(`/solicitudes/${encodeURIComponent(numero)}`);
    try { localStorage.setItem(clave(numero), JSON.stringify({ d, guardado: new Date().toISOString() })); } catch { /* sin almacenamiento */ }
    return { d, sinConexion: !navigator.onLine, guardado: null };
  } catch (e) {
    if (e.status !== 0) throw e;
    try {
      const copia = JSON.parse(localStorage.getItem(clave(numero)));
      if (copia?.d) return { d: copia.d, sinConexion: true, guardado: copia.guardado };
    } catch { /* copia ilegible */ }
    throw e;
  }
}

/** Al quitar la solicitud de este equipo se borra también la copia sin conexión. */
export async function olvidarPase(numero) {
  try { localStorage.removeItem(clave(numero)); } catch { /* nada */ }
  try { await (await caches.open(CACHE_DATOS)).delete(`/api/solicitudes/${encodeURIComponent(numero)}`); } catch { /* sin Cache API */ }
}
