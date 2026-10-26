<script setup>
// Franja de barrera de acceso, diagonal con el flanco del triángulo (aprobada en el tablero).
defineProps({ barras: { type: Number, default: 24 }, alto: { type: String, default: '56px' } });
</script>

<template>
  <div class="barrera diagonal" :style="{ height: alto }" aria-hidden="true">
    <span v-for="i in barras" :key="i" />
  </div>
</template>
