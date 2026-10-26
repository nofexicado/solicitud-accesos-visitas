<script setup>
// El pase de acceso que se arma mientras se completa el asistente (lo vivo del diseño aprobado).
// El lugar del QR queda gris; en la pantalla de éxito ese mismo pase revela el QR.
import { computed, nextTick, ref, watch } from 'vue';
import { gsap } from 'gsap';
import { formatearCuit } from '@accesos/shared';
import Barrera from '../Barrera.vue';
import LogoMark from '../LogoMark.vue';
import { useGsap } from '../../composables/useGsap.js';

const props = defineProps({
  borrador: { type: Object, required: true },
  numero: { type: String, default: '' },
  qr: { type: String, default: '' }, // SVG del QR, solo cuando está aprobada
  habilitado: { type: Boolean, default: false },
  estadoTexto: { type: String, default: '' },
});

const d = computed(() => props.borrador.datos);
const v = computed(() => props.borrador.vista);
const fecha = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '');
const filas = computed(() => [
  ['Empresa', d.value.solicitante.razon_social],
  ['CUIT', d.value.solicitante.cuit.replace(/\D/g, '').length === 11 ? formatearCuit(d.value.solicitante.cuit) : ''],
  ['Destino', [v.value.planta === 'Otra locación' ? d.value.destino.otra_locacion : v.value.planta, v.value.pack].filter(Boolean).join(' · ')],
  ['Fechas', d.value.motivo.fecha_desde ? (d.value.motivo.fecha_hasta && d.value.motivo.fecha_hasta !== d.value.motivo.fecha_desde ? `${fecha(d.value.motivo.fecha_desde)} al ${fecha(d.value.motivo.fecha_hasta)}` : fecha(d.value.motivo.fecha_desde)) : ''],
  ['Personas', personas.value],
]);
const personas = computed(() => {
  const n = d.value.personal.personas.filter((p) => p.nombre_apellido.trim()).length;
  const m = d.value.personal.vehiculos.filter((x) => x.patente.trim()).length;
  if (!n) return '';
  return `${n} ${n === 1 ? 'persona' : 'personas'}${m ? ` · ${m} ${m === 1 ? 'vehículo' : 'vehículos'}` : ''}`;
});
const induccion = computed(() => Boolean(d.value.seguridad.induccion_comprobante));

// Cada dato nuevo entra con un fundido corto.
const raiz = ref(null);
const { add, reducido } = useGsap(raiz);
// Cuando llega el QR se revela de arriba hacia abajo.
watch(() => props.qr, async (nuevo, viejo) => {
  if (!nuevo || viejo || reducido()) return;
  await nextTick();
  add(() => gsap.fromTo('.qr-svg', { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.4, delay: 0.5, ease: 'power2.inOut' }));
}, { immediate: true });

watch(() => filas.value.map((f) => f[1]).join('|'), (nuevo, viejo) => {
  if (reducido() || !viejo) return;
  const a = nuevo.split('|'), b = viejo.split('|');
  add(() => a.forEach((val, i) => { if (val !== b[i] && val) gsap.from(`[data-fila="${i}"] dd`, { autoAlpha: 0, duration: 0.2 }); }));
});
</script>

<template>
  <div ref="raiz" class="pase" :class="{ habilitado }">
    <Barrera alto="22px" />
    <div class="cuerpo">
      <div class="cabeza">
        <LogoMark class="logo" />
        <p class="numero num" :class="{ pendiente: !numero }">{{ numero || 'N° al enviar' }}</p>
      </div>
      <div class="qr" :class="{ listo: qr }">
        <!-- eslint-disable-next-line vue/no-v-html -- SVG generado por el servidor con qrcode, sin datos del usuario -->
        <div v-if="qr" class="qr-svg" v-html="qr" />
        <span v-else>QR al aprobarse</span>
      </div>
      <dl>
        <div v-for="([k, val], i) in filas" :key="k" :data-fila="i"><dt>{{ k }}</dt><dd :class="{ vacio: !val }">{{ val || '—' }}</dd></div>
      </dl>
    </div>
    <p class="estado" :class="{ ok: habilitado }">
      <span class="tri-mark" :class="{ ok: habilitado || induccion }" aria-hidden="true" />
      {{ estadoTexto || (induccion ? 'Inducción vista' : 'Falta la inducción') }}
    </p>
  </div>
</template>

<style scoped>
.pase { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.cuerpo { display: grid; grid-template-columns: minmax(0, 1fr) 96px; gap: 14px 16px; padding: 18px; }
dl { grid-column: 1 / -1; }
.logo { width: 92px; color: var(--ink); }
.numero { margin-top: 12px; font-size: var(--t-sub); font-weight: 650; font-stretch: 112%; line-height: 1.15; }
.numero.pendiente { color: var(--muted); }
dl { display: grid; gap: 6px; font-size: var(--t-nota); }
dl div { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 12px; }
dt { color: var(--muted); }
dd { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
dd.vacio { color: var(--muted); }
.qr { align-self: start; display: grid; place-items: center; aspect-ratio: 1; border-radius: 4px; background: var(--raised); color: var(--muted); font-size: var(--t-nota); text-align: center; padding: 10px; line-height: 1.3; }
.qr.listo { background: #fff; padding: 6px; }
.qr-svg, .qr-svg :deep(svg) { width: 100%; height: 100%; display: block; color: #15181b; }
.estado { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-top: 1px solid var(--border); font-weight: 600; font-size: var(--t-nota); color: var(--muted); }
.estado.ok { color: var(--verde-ink); }
.estado .tri-mark { width: 16px; height: 14px; }
</style>
