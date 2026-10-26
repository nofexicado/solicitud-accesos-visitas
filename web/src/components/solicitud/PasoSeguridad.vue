<script setup>
// Paso 6: video de inducción (comprobante firmado) y aceptación de los requisitos HSE de la planta.
import { computed, ref, watch } from 'vue';
import InductionPlayer from './InductionPlayer.vue';
import { api } from '../../composables/api.js';

const props = defineProps({
  modelo: { type: Object, required: true },
  vista: { type: Object, required: true },
  errores: { type: Object, default: () => ({}) },
  plantaId: { type: Number, default: null },
});

const requisitos = ref([]);
watch(() => props.plantaId, async (planta) => {
  try { requisitos.value = await api(`/hse/requisitos${planta ? `?planta=${planta}` : ''}`); } catch { requisitos.value = []; }
}, { immediate: true });
const epp = computed(() => requisitos.value.filter((r) => r.tipo === 'epp'));
const normas = computed(() => requisitos.value.filter((r) => r.tipo === 'normativa'));
const vista = computed(() => Boolean(props.modelo.induccion_comprobante));

function alCompletar({ comprobante, fin }) {
  props.modelo.induccion_comprobante = comprobante;
  props.vista.induccion_fin = new Date(fin).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}
</script>

<template>
  <div class="seguridad">
    <section>
      <h3>Video de inducción</h3>
      <InductionPlayer :planta-id="plantaId" :completo="vista" @completo="alCompletar" />
      <p v-if="errores.induccion_comprobante" class="error" role="alert">{{ errores.induccion_comprobante }}</p>
    </section>

    <section v-if="epp.length || normas.length">
      <h3>Requisitos para entrar</h3>
      <ul class="lista">
        <li v-for="r in [...normas, ...epp]" :key="r.id"><span class="forma" aria-hidden="true" /><div><b>{{ r.titulo }}</b><span>{{ r.detalle }}</span></div></li>
      </ul>
    </section>

    <label class="acepto" :class="{ deshabilitado: !vista }">
      <input v-model="modelo.acepta_hse" type="checkbox" :disabled="!vista" :aria-invalid="Boolean(errores.acepta_hse)">
      <span>Leí y acepto los requisitos de Seguridad, Salud y Medio Ambiente, y llevo el equipo de protección indicado.</span>
    </label>
    <p v-if="!vista" class="nota">Se habilita cuando termines el video.</p>
    <p v-if="errores.acepta_hse" class="error" role="alert">{{ errores.acepta_hse }}</p>
  </div>
</template>

<style scoped>
.seguridad { display: grid; gap: 32px; }
section { display: grid; gap: 14px; }
h3 { font-size: var(--t-texto); font-stretch: 100%; letter-spacing: 0; font-weight: 650; }
.lista { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 24px; }
.lista li { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 12px; }
.lista .forma { width: 20px; height: 18px; margin-top: 3px; background: var(--ink); clip-path: polygon(0 0, 100% 0, 50% 100%); }
.lista b { display: block; font-weight: 600; }
.lista span { display: block; color: var(--muted); font-size: var(--t-nota); }
.acepto { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 12px; align-items: start; padding: 18px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); cursor: pointer; }
.acepto input { width: 22px; height: 22px; margin-top: 2px; accent-color: var(--ink); }
.acepto.deshabilitado { opacity: 0.55; cursor: not-allowed; }
.nota { color: var(--muted); font-size: var(--t-nota); margin-top: -20px; }
.error { color: var(--pill-no-ink); font-size: var(--t-nota); font-weight: 500; }
@media (max-width: 640px) { .lista { grid-template-columns: 1fr; } }
</style>
