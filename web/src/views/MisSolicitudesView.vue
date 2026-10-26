<script setup>
// Mis solicitudes: las de este equipo, con filtros, y la consulta de una enviada desde otro equipo.
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { gsap } from 'gsap';
import { ESTADOS_APROBADOS, ESTADOS_PENDIENTES } from '@accesos/shared';
import RequestCard from '../components/RequestCard.vue';
import Campo from '../components/solicitud/Campo.vue';
import { api } from '../composables/api.js';
import { useGsap } from '../composables/useGsap.js';

const router = useRouter();
const lista = ref([]);
const estado = ref('cargando');
const filtro = ref('todos');
const FILTROS = [
  ['todos', 'Todas', () => true],
  ['pendientes', 'Pendientes', (s) => ESTADOS_PENDIENTES.includes(s.estado)],
  ['aprobadas', 'Aprobadas', (s) => ESTADOS_APROBADOS.includes(s.estado)],
];
const cuenta = (f) => lista.value.filter(f).length;
const visibles = computed(() => lista.value.filter(FILTROS.find(([k]) => k === filtro.value)[2]));

const consulta = ref({ numero: '', documento: '' });
const consultando = ref(false);
const errorConsulta = ref('');

const raiz = ref(null);
const { add, reducido } = useGsap(raiz);
async function animarTarjetas() {
  await nextTick();
  if (reducido() || !visibles.value.length) return;
  add(() => gsap.from('.tarjetas > *', { y: 16, autoAlpha: 0, duration: 0.35, stagger: 0.06, ease: 'power2.out' }));
}

onMounted(async () => {
  try {
    lista.value = await api('/mis-solicitudes');
    estado.value = 'listo';
    animarTarjetas();
  } catch (e) {
    estado.value = 'error';
  }
});

function cambiarFiltro(f) {
  filtro.value = f;
  animarTarjetas();
}

async function consultar() {
  errorConsulta.value = '';
  if (!consulta.value.numero.trim() || !consulta.value.documento.trim()) {
    errorConsulta.value = 'Completá el número de solicitud y el documento.';
    return;
  }
  consultando.value = true;
  try {
    const r = await api('/consulta', { metodo: 'POST', cuerpo: consulta.value });
    router.push(`/mis-solicitudes/${r.numero}`);
  } catch (e) {
    errorConsulta.value = e.message;
  } finally {
    consultando.value = false;
  }
}
</script>

<template>
  <div ref="raiz" class="wrap pagina">
    <header class="cabeza">
      <h1>Mis solicitudes</h1>
      <RouterLink class="btn-corte" to="/solicitud/nueva">Nueva solicitud</RouterLink>
    </header>

    <div v-if="lista.length" class="filtros" role="tablist" aria-label="Filtrar solicitudes">
      <button v-for="[k, nombre, f] in FILTROS" :key="k" type="button" role="tab" :aria-selected="filtro === k" @click="cambiarFiltro(k)">
        {{ nombre }} <span class="num">{{ cuenta(f) }}</span>
      </button>
    </div>

    <p v-if="estado === 'error'" class="aviso error"><span class="tri-mark" aria-hidden="true" />No pudimos cargar tus solicitudes. Revisá tu conexión y recargá la página.</p>
    <div v-else-if="estado === 'listo' && !lista.length" class="vacio">
      <h2>No hay solicitudes en este equipo</h2>
      <p>Las que envíes desde acá aparecen solas. Si enviaste una desde otro equipo, consultala abajo con el número y tu DNI.</p>
    </div>
    <p v-else-if="estado === 'listo' && !visibles.length" class="vacio-filtro">No hay solicitudes {{ filtro === 'pendientes' ? 'pendientes' : 'aprobadas' }}.</p>
    <div v-else class="tarjetas" :aria-busy="estado === 'cargando'">
      <RequestCard v-for="s in visibles" :key="s.numero" :s="s" />
    </div>

    <section id="consultar" class="consultar" aria-labelledby="titulo-consultar">
      <div>
        <h2 id="titulo-consultar">Consultar otra solicitud</h2>
        <p>Con el número y el DNI o pasaporte de alguna persona de la solicitud, o el CUIT de la empresa. Queda guardada en este equipo.</p>
      </div>
      <form class="form" novalidate @submit.prevent="consultar">
        <Campo v-slot="c" rotulo="Número de solicitud" ayuda="Por ejemplo ACC-2026-000231">
          <input :id="c.id" v-model="consulta.numero" class="entrada num" autocomplete="off" :aria-describedby="c.describe">
        </Campo>
        <Campo v-slot="c" rotulo="DNI, pasaporte o CUIT">
          <input :id="c.id" v-model="consulta.documento" class="entrada num" autocomplete="off" :aria-describedby="c.describe">
        </Campo>
        <p v-if="errorConsulta" class="aviso error ancho" role="alert"><span class="tri-mark" aria-hidden="true" />{{ errorConsulta }}</p>
        <button class="btn-sec ancho-boton" type="submit" :disabled="consultando">{{ consultando ? 'Buscando…' : 'Consultar' }}</button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.pagina { padding-top: 40px; }
.cabeza { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
h1 { font-size: var(--t-seccion-chico); line-height: 1.1; }
.filtros { display: flex; gap: 24px; margin-top: 28px; border-bottom: 1px solid var(--border); }
.filtros button { position: relative; padding: 10px 0 12px; color: var(--muted); font-weight: 500; }
.filtros button .num { margin-left: 4px; color: var(--muted); font-weight: 400; }
.filtros button[aria-selected="true"] { color: var(--ink); }
.filtros button[aria-selected="true"]::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--ink); }
.tarjetas { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; margin-top: 24px; }
.vacio { margin-top: 32px; padding: 32px; border-radius: 6px; background: var(--surface); border: 1px dashed var(--control); max-width: 720px; }
.vacio h2 { font-size: var(--t-sub); line-height: 1.2; margin-bottom: 8px; }
.vacio p, .vacio-filtro { color: var(--muted); }
.vacio-filtro { margin-top: 24px; }
.consultar { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: 24px; row-gap: 20px; margin-top: 72px; padding: 32px; border-radius: 6px; background: var(--raised); }
.consultar > div { grid-column: 1 / 6; }
.consultar h2 { font-size: var(--t-sub); line-height: 1.2; margin-bottom: 8px; }
.consultar p { color: var(--muted); max-width: 48ch; }
.form { grid-column: 7 / 13; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
.form .ancho { grid-column: 1 / -1; }
.ancho-boton { justify-self: start; }
@media (max-width: 860px) {
  .consultar { padding: 22px; }
  .consultar > div, .form { grid-column: 1 / -1; }
  .form { grid-template-columns: 1fr; }
}
</style>
