<script setup>
// Píldora de estado. Las pendientes llevan un punto que late (quieto con movimiento reducido).
import { computed } from 'vue';
import { ESTADOS, etiquetaEstado } from '@accesos/shared';

const props = defineProps({ estado: { type: String, required: true } });
const TONOS = { pendiente: 'hse', habilitado: 'ok', negativo: 'no', neutral: '' };
const tono = computed(() => TONOS[ESTADOS[props.estado]?.tono] ?? '');
</script>

<template>
  <span class="pill" :class="tono">
    <span v-if="tono === 'hse'" class="punto late" aria-hidden="true" />
    <span v-else-if="tono === 'ok'" class="tri-mark ok" aria-hidden="true" />
    {{ etiquetaEstado(estado) }}
  </span>
</template>
