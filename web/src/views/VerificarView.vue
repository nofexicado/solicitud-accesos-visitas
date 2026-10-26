<script setup>
// Verificación pública del QR (/q/:token): si el pase vale hoy, para qué fechas y destino.
// Sin datos personales. Portería (Fase 3) usa su propia validación con sesión.
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../composables/api.js';

const route = useRoute();
const r = ref(null);
const error = ref('');
const fecha = (iso) => iso.split('-').reverse().join('/');

onMounted(async () => {
  try { r.value = await api(`/verificar/${encodeURIComponent(route.params.token)}`); } catch (e) { error.value = e.message; }
});
</script>

<template>
  <div class="wrap verificar">
    <p v-if="error" class="aviso error"><span class="tri-mark" aria-hidden="true" />{{ error }}</p>
    <section v-else-if="r" class="resultado" :class="r.valido ? 'vale' : r.todavia_no ? 'pronto' : 'no-vale'" aria-live="polite">
      <span class="senal" aria-hidden="true" />
      <h1>{{ r.valido ? 'Pase vigente' : r.todavia_no ? 'Aprobado, todavía no vigente' : 'Pase no válido' }}</h1>
      <p v-if="r.motivo" class="motivo">{{ r.motivo }}</p>
      <dl v-if="r.numero">
        <div><dt>Solicitud</dt><dd class="num">{{ r.numero }}</dd></div>
        <div v-if="r.fecha_desde"><dt>Fechas</dt><dd class="num">{{ fecha(r.fecha_desde) }} al {{ fecha(r.fecha_hasta) }}</dd></div>
        <div v-if="r.planta || r.pack"><dt>Destino</dt><dd>{{ [r.planta, r.pack].filter(Boolean).join(' · ') }}</dd></div>
        <div v-if="r.personas"><dt>Personas</dt><dd class="num">{{ r.personas }}</dd></div>
      </dl>
      <p class="nota">Portería valida cada pase contra el sistema y pide el DNI o pasaporte de cada persona.</p>
    </section>
  </div>
</template>

<style scoped>
.verificar { padding-top: 48px; padding-bottom: 64px; }
.resultado { display: grid; gap: 16px; justify-items: start; max-width: 560px; padding: 32px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); }
.senal { width: 56px; height: 50px; clip-path: polygon(0 0, 100% 0, 50% 100%); }
.vale .senal { background: var(--verde); }
.pronto .senal { background: var(--pill-hse-ink); }
.no-vale .senal { background: var(--pill-no-ink); clip-path: none; width: 44px; height: 44px; border-radius: 50%; }
h1 { font-size: var(--t-seccion-chico); line-height: 1.1; }
.motivo { font-size: var(--t-sub); line-height: 1.3; }
dl { display: grid; gap: 8px; width: 100%; }
dl div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 12px; }
dt { color: var(--muted); }
.nota { color: var(--muted); font-size: var(--t-nota); }
</style>
