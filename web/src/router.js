import { createRouter, createWebHistory } from 'vue-router';
import { canal, cargarCanal } from './composables/useCanal.js';
import { cargarSesion, destinoTrasLogin } from './composables/useSesion.js';
import InicioView from './views/InicioView.vue';

const TITULO = 'Ingreso a yacimientos';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: InicioView },
    { path: '/solicitud/nueva/:paso?', component: () => import('./views/solicitud/AsistenteView.vue'), meta: { titulo: 'Nueva solicitud', sinPie: true } },
    { path: '/solicitud/lista/:numero', component: () => import('./views/solicitud/ExitoView.vue'), meta: { titulo: 'Solicitud enviada' } },
    { path: '/mis-solicitudes', component: () => import('./views/MisSolicitudesView.vue'), meta: { titulo: 'Mis solicitudes' } },
    // El pase para mostrar en recepción: pantalla completa, sin el encabezado del portal.
    { path: '/mis-solicitudes/:numero/pase', component: () => import('./views/PaseView.vue'), meta: { titulo: 'Pase de acceso', pantalla: true } },
    { path: '/mis-solicitudes/:numero', component: () => import('./views/SolicitudDetalleView.vue'), meta: { titulo: 'Solicitud' } },
    { path: '/requisitos-hse/:planta?', component: () => import('./views/RequisitosView.vue'), meta: { titulo: 'Requisitos HSE' } },
    // Panel de operador (solo LAN). panel: sin el encabezado ni el pie del portal público.
    { path: '/operador/ingresar', component: () => import('./views/operador/IngresarView.vue'), meta: { titulo: 'Ingresar al panel', panel: true } },
    { path: '/operador/sin-egreso', component: () => import('./views/operador/SinEgresoView.vue'), meta: { titulo: 'Sin egreso', panel: true, sesion: true } },
    { path: '/recepcion', component: () => import('./views/porteria/RecepcionView.vue'), meta: { titulo: 'Recepción', panel: true, sesion: true } },
    { path: '/en-planta', component: () => import('./views/porteria/EnPlantaView.vue'), meta: { titulo: 'Personas en planta', panel: true, sesion: true } },
    { path: '/operador/:numero?', component: () => import('./views/operador/OperadorView.vue'), meta: { titulo: 'Panel de accesos', panel: true, sesion: true } },
    { path: '/q/:token', component: () => import('./views/VerificarView.vue'), meta: { titulo: 'Verificación de pase', sinPie: true } },
    { path: '/:pathMatch(.*)*', component: () => import('./views/NoEncontradaView.vue'), meta: { titulo: 'Página no encontrada' } },
  ],
  scrollBehavior(to, _from, guardado) {
    if (guardado) return guardado;
    if (to.hash) return { el: to.hash, top: 24 };
    return { top: 0 };
  },
});

// Rutas internas (Fase 2+): desde el canal externo vuelven al Inicio. Solo comodidad: el backend
// y nginx son la protección real.
router.beforeEach(async (to) => {
  if (/^\/(operador|porteria|recepcion|en-planta|admin)/.test(to.path)) {
    await cargarCanal();
    if (canal.value !== 'interno') return '/';
  }
  // Sin sesión, al login (y de vuelta adonde iba); con sesión, el login no hace falta.
  if (to.meta.sesion && !(await cargarSesion())) return { path: '/operador/ingresar', query: { volver: to.fullPath } };
  if (to.path === '/operador/ingresar') {
    const u = await cargarSesion();
    if (u) return destinoTrasLogin(to.query.volver, u);
  }
});

router.afterEach((to) => {
  document.title = to.meta.titulo ? `${to.meta.titulo} · Accesos` : TITULO;
});
