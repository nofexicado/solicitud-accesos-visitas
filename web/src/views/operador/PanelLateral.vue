<script setup>
// Barra lateral del panel (y su versión de celular: barra arriba y menú en hoja). Las secciones
// salen de los roles: solicitudes para HSE y autorizantes; control de acceso para todos.
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import LogoMark from '../../components/LogoMark.vue';
import { salir, usuario } from '../../composables/useSesion.js';
import { cargarKpis, kpis, tieneRol, usePanelApi, vistasDe } from './panel.js';

const props = defineProps({ activo: { type: String, default: '' } }); // 'vista:hse', 'recepcion', 'en-planta', 'sin-egreso'
const router = useRouter();
const menu = ref(false);
const { llamar } = usePanelApi();
// Si se entra directo a una pantalla que no los pide, las cuentas de la barra se cargan acá.
onMounted(() => { if (!kpis.value) cargarKpis(llamar); });

const cuenta = (clave) => (clave && kpis.value && kpis.value[clave] !== undefined && kpis.value[clave] !== null ? kpis.value[clave] : null);
const solicitudes = computed(() => vistasDe().map((v) => ({ clave: `vista:${v.clave}`, texto: v.titulo, to: { path: '/operador', query: { vista: v.clave } }, n: cuenta(v.cuenta) })));
const control = computed(() => [
  ...(tieneRol('porteria', 'hse') ? [{ clave: 'recepcion', texto: 'Recepción', to: '/recepcion' }] : []),
  { clave: 'en-planta', texto: 'Personas en planta', to: '/en-planta', n: cuenta('personas_dentro') },
  ...(tieneRol('hse') ? [{ clave: 'sin-egreso', texto: 'Sin egreso', to: '/operador/sin-egreso', n: cuenta('sin_egreso') }] : []),
]);
const iniciales = computed(() => (usuario.value?.nombre ?? '').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase());
const rolTexto = computed(() => [tieneRol('hse') && 'HSE', tieneRol('autorizante') && 'Autorizante', tieneRol('porteria') && 'Recepción'].filter(Boolean).join(' y '));

function ir(to) {
  menu.value = false;
  router.push(to);
}
async function cerrarSesion() {
  await salir();
  router.replace('/operador/ingresar');
}
</script>

<template>
  <div class="barra-tel">
    <LogoMark class="logo" />
    <button class="btn" type="button" :aria-expanded="menu" aria-controls="menu-op" @click="menu = !menu">{{ menu ? 'Cerrar' : 'Menú' }}</button>
  </div>
  <aside id="menu-op" class="sidebar" :class="{ abierto: menu }" aria-label="Navegación del panel">
    <div class="producto">
      <LogoMark class="logo" />
      <span>Accesos a yacimientos</span>
    </div>
    <template v-if="solicitudes.length">
      <p class="grupo-nav primero">Solicitudes</p>
      <nav class="nav" aria-label="Solicitudes">
        <a v-for="i in solicitudes" :key="i.clave" :href="router.resolve(i.to).href" :class="{ activa: activo === i.clave }"
           :aria-current="activo === i.clave ? 'page' : undefined" @click.prevent="ir(i.to)">
          {{ i.texto }}<span v-if="i.n !== null && i.n !== undefined" class="n num">{{ i.n }}</span>
        </a>
      </nav>
    </template>
    <p class="grupo-nav" :class="{ primero: !solicitudes.length }">Control de acceso</p>
    <nav class="nav" aria-label="Control de acceso">
      <a v-for="i in control" :key="i.clave" :href="router.resolve(i.to).href" :class="{ activa: activo === i.clave }"
         :aria-current="activo === i.clave ? 'page' : undefined" @click.prevent="ir(i.to)">
        {{ i.texto }}<span v-if="i.n !== null && i.n !== undefined" class="n num">{{ i.n }}</span>
      </a>
    </nav>
    <p class="grupo-nav">Consulta</p>
    <nav class="nav" aria-label="Consulta">
      <RouterLink to="/requisitos-hse">Requisitos HSE</RouterLink>
      <RouterLink to="/">Portal de solicitudes</RouterLink>
    </nav>
    <div class="usuario">
      <span class="inicial" aria-hidden="true">{{ iniciales }}</span>
      <div>{{ usuario?.nombre }}<small>{{ rolTexto }}</small></div>
      <button class="salir" type="button" @click="cerrarSesion">Salir</button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar { position: sticky; top: 0; height: 100svh; display: flex; flex-direction: column; padding: 20px 12px; overflow-y: auto; }
.producto { display: flex; flex-direction: column; gap: 6px; padding: 4px 8px 12px; }
.producto .logo { width: 112px; color: var(--ink); }
.producto span { color: var(--muted); }
.grupo-nav { margin: 20px 8px 6px; color: var(--muted); }
.grupo-nav.primero { margin-top: 8px; }
.nav { display: grid; gap: 2px; }
.nav a { display: flex; align-items: center; gap: 10px; min-height: 32px; padding: 0 10px; border-radius: 6px; color: var(--muted); text-decoration: none; transition: background-color var(--t-hover) ease, color var(--t-hover) ease; }
.nav a:hover { background: var(--raised); color: var(--ink); }
.nav a.activa { background: var(--active); color: var(--ink); font-weight: 500; }
.nav .n { margin-left: auto; color: var(--ink); }
.usuario { margin-top: auto; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 4px 10px; padding: 10px 8px; }
.inicial { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--active); color: var(--ink); font-weight: 600; }
.usuario small { display: block; color: var(--muted); }
.salir { grid-column: 2; justify-self: start; color: var(--muted); text-decoration: underline; text-underline-offset: 3px; }
.salir:hover { color: var(--ink); }
.barra-tel { display: none; }

@media (max-width: 900px) {
  .barra-tel { display: flex; align-items: center; justify-content: space-between; height: 56px; padding: 0 16px; border-bottom: 1px solid var(--border); background: var(--surface); position: sticky; top: 0; z-index: 3; }
  .barra-tel .logo { width: 96px; color: var(--ink); }
  .sidebar { display: none; }
  .sidebar.abierto { display: flex; position: fixed; inset: 56px 0 0; z-index: 2; height: auto; background: var(--ground); padding: 16px; }
  .sidebar.abierto .producto { display: none; }
  .nav a { min-height: 44px; }
}
@media print { .barra-tel, .sidebar { display: none !important; } }
</style>
