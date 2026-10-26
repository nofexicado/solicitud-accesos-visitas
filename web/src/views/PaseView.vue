<script setup>
// El pase para mostrar en la recepción: N°, QR y patente bien grandes, sin el encabezado del portal.
// Una vez abierto se ve sin conexión; "Guardar pase" lo deja como imagen en el celular.
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { formatearPatente, etiquetaEstado } from '@accesos/shared';
import Barrera from '../components/Barrera.vue';
import LogoMark from '../components/LogoMark.vue';
import { cargarPase } from '../composables/paseLocal.js';
import { guardarPase } from '../composables/pasePng.js';

const route = useRoute();
const d = ref(null);
const sinConexion = ref(false);
const guardado = ref(null);
const error = ref('');
const guardando = ref(false);
const avisoGuardar = ref('');

const fecha = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '');
const fechaHora = (ts) => new Date(ts).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

onMounted(async () => {
  try {
    ({ d: d.value, sinConexion: sinConexion.value, guardado: guardado.value } = await cargarPase(route.params.numero));
  } catch (e) {
    error.value = e.status === 0
      ? 'No hay conexión y este pase todavía no se abrió en este equipo. Abrilo una vez con señal para tenerlo guardado.'
      : e.status === 404 ? 'No encontramos ese pase en este equipo. Consultalo con el número y tu DNI.' : e.message;
  }
});

const patentes = computed(() => (d.value?.vehiculos ?? []).map((v) => (v.patente ? formatearPatente(v.patente) : '')).filter(Boolean));
const destino = computed(() => (d.value ? [d.value.planta ?? (d.value.otra_locacion ? `Otra locación: ${d.value.otra_locacion}` : ''), d.value.pack].filter(Boolean).join(' · ') : ''));
const estado = computed(() => {
  if (!d.value) return '';
  if (!d.value.qr_svg) return etiquetaEstado(d.value.estado);
  return d.value.vigente ? `Habilitado del ${fecha(d.value.fecha_desde)} al ${fecha(d.value.fecha_hasta)}` : d.value.motivo_pase;
});

async function guardar() {
  guardando.value = true;
  avisoGuardar.value = '';
  try {
    const r = await guardarPase(d.value, { estado: estado.value });
    if (r === 'descargado') avisoGuardar.value = 'Listo: la imagen del pase quedó en tus descargas.';
    if (r === 'compartido') avisoGuardar.value = 'Listo: guardaste la imagen del pase.';
  } catch {
    avisoGuardar.value = 'No pudimos armar la imagen. Probá con el PDF.';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <main id="contenido" class="pase-pantalla">
    <p v-if="error" class="aviso error"><span class="tri-mark" aria-hidden="true" />{{ error }}</p>
    <template v-else-if="d">
      <p v-if="sinConexion" class="sin-conexion" role="status">
        <span class="tri-mark" aria-hidden="true" />Sin conexión: es el pase guardado{{ guardado ? ` el ${fechaHora(guardado)}` : '' }}. Recepción lo valida contra el sistema.
      </p>
      <article class="pase" :class="{ habilitado: d.vigente }" aria-labelledby="pase-numero">
        <Barrera alto="20px" />
        <div class="cuerpo">
          <LogoMark class="logo" />
          <p class="rotulo">Pase de acceso a yacimientos</p>
          <h1 id="pase-numero" class="numero num">{{ d.numero }}</h1>
          <p class="estado"><span v-if="d.vigente" class="tri-mark ok" aria-hidden="true" />{{ estado }}</p>
          <div class="qr">
            <!-- eslint-disable-next-line vue/no-v-html -- SVG generado por el servidor con qrcode, sin datos del usuario -->
            <div v-if="d.qr_svg" class="qr-svg" role="img" :aria-label="`QR del pase ${d.numero}`" v-html="d.qr_svg" />
            <p v-else class="sin-qr">El QR aparece cuando la solicitud se aprueba.</p>
          </div>
          <div class="patente">
            <span class="rotulo">{{ patentes.length > 1 ? 'Patentes' : 'Patente' }}</span>
            <p class="chapas num">
              <span v-for="p in patentes" :key="p" class="chapa">{{ p }}</span>
              <span v-if="!patentes.length" class="sin">Sin vehículo</span>
            </p>
          </div>
          <dl>
            <div><dt>Empresa</dt><dd>{{ d.empresa }}</dd></div>
            <div><dt>Destino</dt><dd>{{ destino }}</dd></div>
            <div><dt>Fechas</dt><dd class="num">{{ fecha(d.fecha_desde) }} al {{ fecha(d.fecha_hasta) }}<template v-if="d.hora_desde"> · {{ d.hora_desde }} a {{ d.hora_hasta ?? '—' }}</template></dd></div>
            <div><dt>Personas</dt><dd>{{ d.personas.map((p) => p.nombre_apellido).join(', ') }}</dd></div>
          </dl>
          <p class="nota">Mostralo en la recepción de la planta con el DNI de cada persona.</p>
        </div>
      </article>
      <div class="acciones">
        <button v-if="d.qr_svg" class="btn-corte" type="button" :disabled="guardando" @click="guardar">{{ guardando ? 'Armando la imagen…' : 'Guardar pase' }}</button>
        <a v-if="d.qr_svg && !sinConexion" class="btn-sec" :href="d.pdf" download>Descargar PDF</a>
        <RouterLink class="enlace" :to="`/mis-solicitudes/${d.numero}`">Ver la solicitud</RouterLink>
      </div>
      <p v-if="avisoGuardar" class="aviso ok" role="status"><span class="tri-mark" aria-hidden="true" />{{ avisoGuardar }}</p>
    </template>
    <p v-else class="cargando" aria-busy="true">Cargando el pase…</p>
  </main>
</template>

<style scoped>
.pase-pantalla { min-height: 100svh; display: grid; justify-items: center; align-content: start; gap: 16px; padding: 16px 16px 40px; background: var(--ground); }
.pase-pantalla > * { width: min(520px, 100%); }
.sin-conexion { display: flex; gap: 10px; align-items: baseline; padding: 10px 14px; border-radius: 4px; background: var(--pill-hse-bg); color: var(--pill-hse-ink); font-size: var(--t-nota); }
.sin-conexion .tri-mark { background: currentColor; }
/* El pase es siempre claro: el QR y la patente se leen mejor sobre blanco, también en modo oscuro. */
.pase { background: #ffffff; color: #15181b; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
.cuerpo { display: grid; gap: 10px; padding: 20px 22px 24px; }
.logo { width: 132px; color: #15181b; }
.rotulo { color: #5b6168; font-size: var(--t-nota); }
.numero { font-size: clamp(28px, 8.6vw, 40px); line-height: 1.05; font-weight: 700; font-stretch: var(--ancho-titulo); letter-spacing: -0.01em; }
.estado { display: flex; align-items: center; gap: 8px; font-weight: 600; color: #5b6168; }
.habilitado .estado { color: #1f7a2d; }
.estado .tri-mark { width: 16px; height: 14px; background: #299f2d; }
.qr { display: grid; place-items: center; padding: 8px 0; }
.qr-svg { width: min(100%, 340px); aspect-ratio: 1; }
.qr-svg :deep(svg) { width: 100%; height: 100%; display: block; }
.sin-qr { width: min(100%, 340px); aspect-ratio: 1; display: grid; place-items: center; padding: 24px; text-align: center; background: #e9ebe8; color: #5b6168; border-radius: 4px; }
.patente { display: grid; gap: 6px; }
.chapas { display: flex; flex-wrap: wrap; gap: 8px; }
.chapa { padding: 4px 14px; border: 3px solid #15181b; border-radius: 6px; font-size: 40px; line-height: 1.1; font-weight: 700; letter-spacing: 0.04em; }
.sin { font-size: var(--t-sub); font-weight: 600; }
dl { display: grid; gap: 8px; margin-top: 6px; padding-top: 12px; border-top: 1px solid #e3e5e2; }
dl div { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 10px; }
dt { color: #5b6168; font-size: var(--t-nota); padding-top: 2px; }
dd { font-weight: 500; overflow-wrap: anywhere; }
.nota { margin-top: 4px; color: #5b6168; font-size: var(--t-nota); }
.acciones { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; }
.cargando { color: var(--muted); padding-top: 40px; }
@media print { .acciones, .sin-conexion { display: none; } }
</style>
