// Lo que comparten las pantallas del panel: vistas por rol, KPIs (con las cuentas de la barra lateral)
// y las llamadas a la API que, si la sesión venció, llevan al login.
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../composables/api.js';
import { sesionVencida, usuario } from '../../composables/useSesion.js';

export const tieneRol = (...roles) => Boolean(usuario.value?.roles.some((r) => roles.includes(r)));

/** Vistas de solicitudes según el rol. La primera es la de entrada. */
export function vistasDe() {
  const hse = tieneRol('hse');
  const aut = tieneRol('autorizante');
  if (!hse && !aut) return [];
  return [
    ...(hse ? [{ clave: 'hse', titulo: 'Para revisar HSE', vacio: 'No hay solicitudes esperando a HSE.', cuenta: 'en_hse' }] : []),
    { clave: 'autorizar', titulo: aut ? 'Para autorizar' : 'Esperan autorizante', vacio: aut ? 'No hay solicitudes esperando tu autorización.' : 'Ninguna espera al autorizante.', cuenta: 'para_autorizar' },
    ...(!hse ? [{ clave: 'hse', titulo: 'Todavía en HSE', vacio: 'Ninguna de tus plantas está en revisión de HSE.' }] : []),
    { clave: 'aprobadas', titulo: 'Aprobadas', vacio: 'Todavía no hay solicitudes aprobadas.' },
    { clave: 'rechazadas', titulo: 'Rechazadas y vencidas', vacio: 'No hay rechazadas ni vencidas.' },
    { clave: 'todas', titulo: 'Todas', vacio: 'Todavía no hay solicitudes.' },
  ];
}

/** Adónde va cada usuario al entrar: recepción si solo recibe, la bandeja si no. */
export const inicioDe = (u) => (u?.roles.some((r) => ['hse', 'autorizante'].includes(r)) ? '/operador' : '/recepcion');

export function usePanelApi() {
  const router = useRouter();
  const route = useRoute();
  /** API del panel: si la sesión venció, de vuelta al login (y después a donde estaba). */
  async function llamar(ruta, opciones) {
    try {
      return await api(ruta, opciones);
    } catch (e) {
      if (e.status === 401) {
        sesionVencida();
        router.replace({ path: '/operador/ingresar', query: { volver: route.fullPath } });
      }
      throw e;
    }
  }
  return { llamar };
}

// KPIs compartidos: la barra lateral muestra sus cuentas en cualquier pantalla del panel.
export const kpis = ref(null);
export async function cargarKpis(llamar) {
  if (!usuario.value) return;
  try {
    if (tieneRol('hse', 'autorizante')) {
      kpis.value = await llamar('/operador/kpis');
    } else {
      const r = await llamar('/control/en-planta');
      kpis.value = { personas_dentro: r.personas.length };
    }
  } catch { /* las cuentas muestran guiones */ }
}
