<script setup>
// Requisitos HSE desde la base: los generales más los de la planta elegida.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../composables/api.js';

const route = useRoute();
const router = useRouter();
const packs = ref([]);
const requisitos = ref([]);
const estado = ref('cargando');

const plantas = computed(() => packs.value.flatMap((p) => p.plantas.map((pl) => ({ ...pl, pack: p.nombre }))));
const planta = computed(() => plantas.value.find((p) => p.codigo === route.params.planta) ?? null);

const TIPOS = [
  ['induccion', 'Inducción'],
  ['normativa', 'Normas y permisos'],
  ['epp', 'Equipo de protección personal'],
];
const porTipo = computed(() => TIPOS.map(([clave, titulo]) => ({ clave, titulo, lista: requisitos.value.filter((r) => r.tipo === clave) })).filter((g) => g.lista.length));

async function cargar() {
  estado.value = 'cargando';
  try {
    if (!packs.value.length) packs.value = await api('/catalogo/packs');
    const q = planta.value ? `?planta=${planta.value.id}` : '';
    requisitos.value = await api(`/hse/requisitos${q}`);
    estado.value = 'listo';
  } catch {
    estado.value = 'error';
  }
}
watch(() => route.params.planta, cargar, { immediate: true });

function elegir(e) {
  router.replace(e.target.value ? `/requisitos-hse/${e.target.value}` : '/requisitos-hse');
}
</script>

<template>
  <div class="wrap pagina">
    <header class="cabeza">
      <h1>Requisitos HSE</h1>
      <p>Lo que pide Seguridad, Salud y Medio Ambiente para entrar a un yacimiento. Elegí la planta para sumar lo particular de cada una.</p>
      <div class="campo selector">
        <label for="planta">Planta</label>
        <select id="planta" class="entrada" :value="route.params.planta ?? ''" @change="elegir">
          <option value="">Todas (requisitos generales)</option>
          <optgroup v-for="p in packs" :key="p.id" :label="p.nombre">
            <option v-for="pl in p.plantas" :key="pl.id" :value="pl.codigo">{{ pl.nombre }}</option>
          </optgroup>
        </select>
      </div>
    </header>

    <p v-if="estado === 'error'" class="aviso error">No pudimos cargar los requisitos. Revisá tu conexión y recargá la página.</p>
    <p v-else-if="estado === 'listo' && !porTipo.length" class="aviso">Todavía no hay requisitos cargados para esta planta.</p>
    <div v-else class="grupos" :aria-busy="estado === 'cargando'">
      <section v-for="g in porTipo" :key="g.clave" class="grupo">
        <h2>{{ g.titulo }}</h2>
        <ul class="items">
          <li v-for="r in g.lista" :key="r.id" class="item">
            <span class="forma" aria-hidden="true" />
            <div>
              <h3>{{ r.titulo }}</h3>
              <p>{{ r.detalle }}</p>
              <p v-if="r.planta" class="propio">Particular de {{ r.planta }}</p>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Mismos márgenes que el header; título a la izquierda, selector a la derecha. */
.pagina { padding-top: 48px; }
.cabeza { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: 24px; row-gap: 16px; align-items: end; }
.cabeza h1 { grid-column: 1 / 8; font-size: var(--t-seccion-chico); line-height: 1.05; }
.cabeza p { grid-column: 1 / 8; max-width: 62ch; }
.selector { grid-column: 9 / 13; grid-row: 1 / 3; align-self: end; }
.grupos { margin-top: 56px; display: grid; gap: 12px; }
.grupo { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: 24px; padding: 32px; background: var(--surface); border-radius: 6px; }
.grupo h2 { grid-column: 1 / 5; font-size: var(--t-sub); line-height: 1.15; }
.items { grid-column: 5 / 13; display: grid; grid-template-columns: 1fr 1fr; gap: 28px 40px; }
.item { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 16px; }
.forma { width: 36px; height: 32px; background: var(--ink); clip-path: polygon(0 0, 100% 0, 50% 100%); }
.item h3 { font-size: var(--t-texto); font-stretch: 100%; letter-spacing: 0; font-weight: 650; }
.item p { margin-top: 4px; color: var(--muted); max-width: 48ch; }
.item .propio { color: var(--ink); font-weight: 500; font-size: var(--t-nota); }
@media (max-width: 900px) {
  .cabeza h1, .cabeza p, .selector { grid-column: 1 / -1; grid-row: auto; }
  .grupo { padding: 22px; }
  .grupo h2 { grid-column: 1 / -1; margin-bottom: 20px; }
  .items { grid-column: 1 / -1; grid-template-columns: 1fr; }
}
</style>
