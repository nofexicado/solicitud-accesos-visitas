<script setup>
// Confirmación modal con <dialog> nativo: atrapa el foco, Esc cancela y el foco arranca en
// "Cancelar" para que un Enter apurado no borre nada.
import { ref, watch, nextTick } from 'vue';

const props = defineProps({
  abierto: { type: Boolean, default: false },
  titulo: { type: String, required: true },
  texto: { type: String, default: '' },
  accion: { type: String, required: true },
  cancelar: { type: String, default: 'Cancelar' },
  destructivo: { type: Boolean, default: false },
  ocupado: { type: Boolean, default: false },
});
const emit = defineEmits(['confirmar', 'cerrar']);
const dialogo = ref(null);
const botonCancelar = ref(null);

watch(() => props.abierto, async (abierto) => {
  await nextTick();
  const d = dialogo.value;
  if (!d) return;
  if (abierto && !d.open) {
    d.showModal();
    botonCancelar.value?.focus();
  } else if (!abierto && d.open) {
    d.close();
  }
}, { immediate: true });

// Clic en el fondo (fuera del panel) también cancela.
function alClic(e) {
  if (e.target === dialogo.value && !props.ocupado) emit('cerrar');
}
</script>

<template>
  <dialog ref="dialogo" class="dialogo" aria-labelledby="dialogo-titulo" aria-describedby="dialogo-texto"
          @cancel.prevent="!ocupado && emit('cerrar')" @click="alClic">
    <div class="panel">
      <h2 id="dialogo-titulo">{{ titulo }}</h2>
      <p v-if="texto" id="dialogo-texto">{{ texto }}</p>
      <slot />
      <div class="acciones">
        <button ref="botonCancelar" type="button" class="btn-sec" :disabled="ocupado" @click="emit('cerrar')">{{ cancelar }}</button>
        <button type="button" :class="destructivo ? 'btn-peligro' : 'btn-sec'" :disabled="ocupado" @click="emit('confirmar')">{{ accion }}</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
/* margin: auto devuelve el centrado nativo del modal, que el reset de Tailwind anula. */
.dialogo { margin: auto; width: min(460px, calc(100vw - 32px)); padding: 0; border: 0; border-radius: 6px; background: var(--surface); color: var(--ink); box-shadow: 0 18px 48px rgb(0 0 0 / 0.28); }
.dialogo::backdrop { background: rgb(17 17 17 / 0.55); }
.panel { display: grid; gap: 12px; padding: 28px; }
h2 { font-size: var(--t-sub); line-height: 1.2; }
p { color: var(--muted); }
.acciones { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; margin-top: 12px; }
@media (max-width: 480px) {
  .panel { padding: 22px 20px; }
  .acciones { flex-direction: column-reverse; }
  .acciones button { width: 100%; }
}
</style>
