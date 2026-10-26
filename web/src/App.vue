<script setup>
import { useRoute } from 'vue-router';
import AppHeader from './components/AppHeader.vue';
import AppFooter from './components/AppFooter.vue';

const route = useRoute();
</script>

<template>
  <a class="saltar" href="#contenido">Saltar al contenido</a>
  <!-- El panel de operador trae su propia barra lateral. -->
  <RouterView v-if="route.meta.panel || route.meta.pantalla" />
  <template v-else>
    <AppHeader />
    <main id="contenido" tabindex="-1">
      <RouterView />
    </main>
    <AppFooter v-if="!route.meta.sinPie" />
  </template>
</template>

<style>
.saltar { position: absolute; left: 12px; top: -60px; z-index: 50; padding: 10px 14px; background: var(--ink); color: var(--ground); border-radius: 4px; }
.saltar:focus { top: 12px; }
main:focus { outline: none; }
</style>
