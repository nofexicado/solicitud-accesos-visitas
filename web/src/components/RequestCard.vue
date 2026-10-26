<script setup>
import StatusBadge from './StatusBadge.vue';

defineProps({ s: { type: Object, required: true } });
const fecha = (iso) => iso.split('-').reverse().slice(0, 2).join('/');
</script>

<template>
  <RouterLink class="tarjeta" :class="{ vigente: s.vigente }" :to="`/mis-solicitudes/${s.numero}`">
    <div class="arriba">
      <span class="numero num">{{ s.numero }}</span>
      <StatusBadge :estado="s.estado" />
    </div>
    <p class="destino">{{ [s.planta, s.pack].filter(Boolean).join(' · ') }}</p>
    <p class="meta num">
      {{ s.fecha_desde === s.fecha_hasta ? fecha(s.fecha_desde) : `${fecha(s.fecha_desde)} al ${fecha(s.fecha_hasta)}` }}
      · {{ s.personas }} {{ s.personas === 1 ? 'persona' : 'personas' }}<template v-if="s.vehiculos"> · {{ s.vehiculos }} {{ s.vehiculos === 1 ? 'vehículo' : 'vehículos' }}</template>
    </p>
    <p class="empresa">{{ s.empresa }}</p>
    <p v-if="s.vigente" class="habilitado"><span class="tri-mark ok" aria-hidden="true" />Pase vigente hoy</p>
  </RouterLink>
</template>

<style scoped>
.tarjeta { display: grid; gap: 6px; padding: 20px 22px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); text-decoration: none; transition: border-color var(--t-hover) ease, transform var(--t-press) var(--ease-out); }
.tarjeta:hover { border-color: var(--muted); }
.tarjeta:active { transform: scale(0.995); }
.arriba { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.numero { font-weight: 650; font-stretch: 112%; }
.destino { font-weight: 600; }
.meta, .empresa { color: var(--muted); font-size: var(--t-nota); }
.habilitado { display: flex; align-items: center; gap: 8px; margin-top: 4px; color: var(--verde-ink); font-weight: 600; font-size: var(--t-nota); }
.habilitado .tri-mark { width: 14px; height: 12px; }
</style>
