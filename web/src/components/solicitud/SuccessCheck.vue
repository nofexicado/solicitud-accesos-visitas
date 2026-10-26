<script setup>
// Tilde de éxito: DrawSVG dibuja el círculo y después el tilde. Con movimiento reducido aparece entero.
import { ref } from 'vue';
import { gsap } from 'gsap';
import { useGsap } from '../../composables/useGsap.js';

const emit = defineEmits(['listo']);
const raiz = ref(null);
useGsap(raiz, ({ completo }) => {
  if (!completo) { emit('listo'); return; }
  gsap.timeline({ onComplete: () => emit('listo') })
    .from('.circulo', { drawSVG: '0%', duration: 0.35, ease: 'power2.inOut' })
    .from('.tilde', { drawSVG: '0%', duration: 0.15, ease: 'power2.out' });
});
</script>

<template>
  <svg ref="raiz" class="check" viewBox="0 0 64 64" aria-hidden="true">
    <circle class="circulo" cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="3" />
    <path class="tilde" d="m19 33 9 9 18-20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>

<style scoped>
.check { width: 64px; height: 64px; color: var(--ink); }
</style>
