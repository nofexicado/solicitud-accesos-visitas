<script setup>
// Logo genérico del portal: una barrera de acceso (poste y brazo a rayas) y la palabra ACCESOS.
// El poste y la palabra toman el color del texto (currentColor); el brazo es verde fijo.
// Con intro: la primera vez por sesión la barrera baja hasta cerrarse y aparece la palabra.
import { ref } from 'vue';
import { gsap } from 'gsap';
import { useGsap } from '../composables/useGsap.js';

const props = defineProps({ intro: { type: Boolean, default: false } });
const raiz = ref(null);
const CLAVE = 'accesos-intro-vista';

const yaVista = () => {
  try { return sessionStorage.getItem(CLAVE) === '1'; } catch { return true; }
};

const { add } = useGsap(raiz, ({ completo }) => {
  if (!props.intro || !completo || yaVista()) return;
  try { sessionStorage.setItem(CLAVE, '1'); } catch { /* sin almacenamiento */ }
  const tl = gsap.timeline();
  tl.from('.brazo', { rotation: -70, svgOrigin: '6 13', duration: 0.7, ease: 'bounce.out' })
    .from('.palabra', { x: -10, autoAlpha: 0, duration: 0.35, ease: 'power2.out' }, '-=0.35');
  // Un clic la saltea.
  raiz.value.addEventListener('click', () => tl.progress(1), { once: true });
});

// Hover: el brazo se levanta un poco y vuelve.
function rebote() {
  add(() => gsap.fromTo('.brazo', { rotation: 0 }, { rotation: -16, svgOrigin: '6 13', duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1, overwrite: true }));
}
</script>

<template>
  <svg ref="raiz" class="logo" viewBox="0 0 216 40" role="img" aria-label="Accesos" @mouseenter="rebote">
    <rect class="poste" x="1" y="6" width="9" height="33" rx="1.5" fill="currentColor" />
    <g class="brazo">
      <rect x="8" y="8" width="48" height="10" rx="2" fill="#299f2d" />
      <path d="M17 18h5l6-10h-5zM30 18h5l6-10h-5zM43 18h5l6-10h-5z" fill="#ffffff" />
    </g>
    <text class="palabra" x="66" y="31" fill="currentColor">ACCESOS</text>
  </svg>
</template>

<style scoped>
.palabra { font-family: var(--font); font-size: 27px; font-weight: 700; font-stretch: 112%; letter-spacing: 0.04em; }
</style>
