<script setup>
// Mapa esquemático (aprobado): una ruta con los packs como paradas en el orden del catálogo.
// Sin coordenadas ni contorno real, a propósito.
import { computed } from 'vue';

const props = defineProps({ packs: { type: Array, required: true }, elegido: { type: Number, default: null }, planta: { type: Number, default: null } });
const ANCHO = 560;
const paradas = computed(() => props.packs.map((p, i) => ({
  ...p,
  x: props.packs.length === 1 ? ANCHO / 2 : 70 + (i * (ANCHO - 140)) / (props.packs.length - 1),
})));
const elegida = computed(() => paradas.value.find((p) => p.id === props.elegido));
const ramal = computed(() => {
  const p = elegida.value;
  if (!p || p.plantas.length < 2) return [];
  const paso = 120 / (p.plantas.length - 1);
  // El ramal se corre hacia adentro para que los rótulos no se salgan del dibujo.
  const inicio = Math.min(Math.max(p.x - 60, 60), ANCHO - 180);
  return p.plantas.map((pl, i) => ({ ...pl, x: inicio + i * paso }));
});
</script>

<template>
  <svg class="mapa" :viewBox="`0 0 ${ANCHO} 150`" role="img" :aria-label="elegida ? `Esquema de los packs con ${elegida.nombre} elegido` : 'Esquema de los packs sobre la ruta'">
    <line class="ruta" x1="16" y1="62" :x2="ANCHO - 16" y2="62" stroke-width="3" />
    <g v-for="p in paradas" :key="p.id">
      <path :class="p.id === elegido ? 'elegida' : 'parada'" :d="p.id === elegido ? `M${p.x - 18} 42h36l-18 32Z` : `M${p.x - 12} 50h24l-12 21Z`" />
      <text :x="p.x" y="28" text-anchor="middle">{{ p.nombre.replace('Pack ', '') }}</text>
    </g>
    <g v-if="ramal.length">
      <line class="ruta" :x1="elegida.x" y1="76" :x2="elegida.x" y2="96" stroke-width="2" />
      <line class="ruta" :x1="Math.min(ramal[0].x, elegida.x)" y1="96" :x2="Math.max(ramal[ramal.length - 1].x, elegida.x)" y2="96" stroke-width="2" />
      <g v-for="pl in ramal" :key="pl.id">
        <path :class="pl.id === planta ? 'elegida' : 'parada'" :d="`M${pl.x - 7} 96h14l-7 12Z`" />
        <text :x="pl.x" y="132" text-anchor="middle" class="chico">{{ pl.nombre.replace('Planta ', '') }}</text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.mapa { width: 100%; height: auto; overflow: visible; }
.ruta { stroke: var(--control); }
.parada { fill: var(--muted); }
.elegida { fill: var(--ink); }
text { fill: var(--ink); font-size: 15px; font-family: var(--font); font-weight: 500; }
text.chico { fill: var(--muted); font-size: 14px; font-weight: 400; }
</style>
