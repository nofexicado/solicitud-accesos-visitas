<script setup>
// Rótulo, ayuda y error de un campo. El slot recibe los atributos de accesibilidad para el control.
import { computed, useId } from 'vue';

const props = defineProps({
  rotulo: { type: String, required: true },
  error: { type: String, default: '' },
  ayuda: { type: String, default: '' },
  opcional: { type: Boolean, default: false },
});
const id = useId();
const describe = computed(() => [props.ayuda && `${id}-ayuda`, props.error && `${id}-error`].filter(Boolean).join(' ') || undefined);
</script>

<template>
  <div class="campo">
    <label :for="id">{{ rotulo }}<span v-if="opcional" class="opcional"> (opcional)</span></label>
    <slot :id="id" :invalido="Boolean(error)" :describe="describe" />
    <p v-if="ayuda" :id="`${id}-ayuda`" class="ayuda">{{ ayuda }}</p>
    <p v-if="error" :id="`${id}-error`" class="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.opcional { font-weight: 400; color: var(--muted); }
</style>
