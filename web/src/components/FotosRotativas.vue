<script setup>
// Fotos que se suceden con un fundido lento. Con prefers-reduced-motion queda fija la primera.
// Antes de cada cambio se asegura que la foto siguiente esté cargada (las demás arrancan diferidas).
import { ref } from 'vue';
import { gsap } from 'gsap';
import { useGsap } from '../composables/useGsap.js';

const props = defineProps({
  fotos: { type: Array, required: true },
  intervalo: { type: Number, default: 6500 },
  primeraEager: { type: Boolean, default: false },
});
const actual = ref(0);
const raiz = ref(null);

const { add } = useGsap(raiz, ({ completo }) => {
  if (!completo) return;
  const imgs = [...raiz.value.querySelectorAll('img')];
  gsap.fromTo(imgs[0], { scale: 1.06 }, { scale: 1, duration: 14, ease: 'power1.out' });
  if (imgs.length < 2) return;
  let cambiando = false;
  const reloj = setInterval(async () => {
    if (document.hidden || cambiando) return;
    cambiando = true;
    try { await cambiar(imgs); } finally { cambiando = false; }
  }, props.intervalo);
  return () => clearInterval(reloj);
});

async function cambiar(imgs) {
  const anterior = actual.value;
  const siguiente = (anterior + 1) % imgs.length;
  const img = imgs[siguiente];
  if (!img.complete || !img.naturalWidth) {
    img.loading = 'eager';
    try { await img.decode(); } catch { return; }
  }
  actual.value = siguiente;
  add(() => {
    gsap.to(imgs[anterior], { autoAlpha: 0, duration: 1.6, ease: 'power1.inOut' });
    gsap.fromTo(img, { autoAlpha: 0, scale: 1.06 }, { autoAlpha: 1, duration: 1.6, ease: 'power1.inOut' });
    gsap.to(img, { scale: 1, duration: 14, ease: 'power1.out' });
  });
}
</script>

<template>
  <figure ref="raiz" class="rotativas">
    <img v-for="(f, i) in fotos" :key="f.src" :src="f.src" :width="f.w" :height="f.h" :alt="f.alt"
         :class="{ visible: i === 0 }" :style="f.encuadre ? { objectPosition: f.encuadre } : null"
         :loading="i === 0 && primeraEager ? 'eager' : 'lazy'" decoding="async" data-foto="temporal">
    <figcaption class="pie-foto" aria-live="polite">{{ fotos[actual].pie }}</figcaption>
  </figure>
</template>

<style scoped>
.rotativas { position: relative; margin: 0; overflow: hidden; }
img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; visibility: hidden; }
img.visible { opacity: 1; visibility: visible; }
.pie-foto { position: absolute; right: 16px; bottom: 14px; padding: 4px 10px; border-radius: 4px; background: rgb(17 17 17 / 0.62); color: #fff; font-size: var(--t-nota); }
@media (max-width: 760px) { .pie-foto { display: none; } }
</style>
