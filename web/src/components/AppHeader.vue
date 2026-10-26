<script setup>
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import LogoMark from './LogoMark.vue';
import { useTheme } from '../composables/useTheme.js';
import { canal } from '../composables/useCanal.js';

const { rotulo, siguiente } = useTheme();
const abierto = ref(false);
const route = useRoute();
watch(() => route.fullPath, () => { abierto.value = false; });
watch(abierto, (v) => { document.documentElement.style.overflow = v ? 'hidden' : ''; });

const enlaces = [
  { a: '/solicitud/nueva', texto: 'Nueva solicitud' },
  { a: '/mis-solicitudes', texto: 'Mis solicitudes' },
  { a: '/requisitos-hse', texto: 'Requisitos HSE' },
];
</script>

<template>
  <header class="barra">
    <RouterLink class="marca" to="/" aria-label="Accesos, inicio"><LogoMark intro /></RouterLink>
    <nav class="principal" aria-label="Principal">
      <RouterLink v-for="e in enlaces" :key="e.a" :to="e.a">{{ e.texto }}</RouterLink>
    </nav>
    <button class="tema" type="button" @click="siguiente">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6.25" /><path d="M8 1.75v12.5A6.25 6.25 0 0 0 8 1.75Z" fill="currentColor" /></svg>
      {{ rotulo() }}
    </button>
    <RouterLink v-if="canal === 'interno'" class="operador" to="/operador">Acceso operador</RouterLink>
    <button class="menu" type="button" :aria-expanded="abierto" aria-controls="menu-movil" @click="abierto = !abierto">
      {{ abierto ? 'Cerrar' : 'Menú' }}
    </button>
  </header>
  <div v-if="abierto" id="menu-movil" class="hoja">
    <nav aria-label="Principal">
      <RouterLink v-for="e in enlaces" :key="e.a" :to="e.a">{{ e.texto }}</RouterLink>
      <RouterLink v-if="canal === 'interno'" to="/operador">Acceso operador</RouterLink>
    </nav>
    <button class="tema" type="button" @click="siguiente">{{ rotulo() }}</button>
  </div>
</template>

<style scoped>
.barra { position: relative; z-index: 30; display: flex; align-items: center; gap: 28px; height: 72px; padding-inline: var(--margin); }
.marca { display: block; width: 148px; padding: 8px 0; color: var(--ink); }
.principal { display: flex; gap: 24px; margin-left: auto; }
.principal a, .tema, .operador { font-size: var(--t-nota); font-weight: 500; text-decoration: none; color: var(--ink); padding: 8px 0; text-underline-offset: 6px; text-decoration-thickness: 2px; }
.principal a:hover, .principal a.router-link-active, .operador:hover { text-decoration: underline; }
.tema { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); }
.tema svg { width: 16px; height: 16px; }
.operador { padding-left: 24px; border-left: 1px solid var(--border); color: var(--muted); }
.menu { display: none; margin-left: auto; height: 44px; padding: 0 4px; font-weight: 600; }
.hoja { position: fixed; inset: 64px 0 0; z-index: 29; display: flex; flex-direction: column; justify-content: space-between; padding: 24px var(--margin) 32px; background: var(--ground); }
.hoja nav { display: grid; }
.hoja nav a { padding: 14px 0; font-size: var(--t-sub); font-weight: 650; font-stretch: var(--ancho-titulo); text-decoration: none; border-bottom: 1px solid var(--border); }
.hoja .tema { justify-content: flex-start; font-size: var(--t-texto); }
@media (max-width: 760px) {
  .barra { height: 64px; }
  .marca { width: 124px; }
  .principal, .barra > .tema, .operador { display: none; }
  .menu { display: inline-flex; align-items: center; }
}
</style>
