<script setup>
// Video de inducción sin controles nativos: no se puede adelantar ni acelerar. Al empezar se pide un
// recibo al servidor y al terminar el comprobante firmado (el servidor mide que haya durado lo que dura).
import { computed, onUnmounted, ref, watch } from 'vue';
import { api } from '../../composables/api.js';

const props = defineProps({ plantaId: { type: Number, default: null }, completo: { type: Boolean, default: false } });
const emit = defineEmits(['completo']);

const info = ref(null);
const video = ref(null);
const estado = ref('cargando'); // cargando | listo | reproduciendo | pausado | validando | completo | error
const error = ref('');
const visto = ref(0);
const actual = ref(0);
let recibo = null;

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const avance = computed(() => (info.value ? Math.min(1, visto.value / info.value.duracion_seg) : 0));
const restante = computed(() => (info.value ? Math.max(0, info.value.duracion_seg - actual.value) : 0));

watch(() => props.plantaId, async () => {
  estado.value = 'cargando';
  try {
    info.value = await api(`/induccion/video${props.plantaId ? `?planta=${props.plantaId}` : ''}`);
    estado.value = props.completo ? 'completo' : 'listo';
  } catch (e) {
    estado.value = 'error';
    error.value = e.message;
  }
}, { immediate: true });

async function reproducir() {
  error.value = '';
  try {
    if (!recibo) {
      ({ recibo } = await api('/induccion/iniciar', { metodo: 'POST', cuerpo: { video_id: info.value.id } }));
    }
    await video.value.play();
  } catch (e) {
    error.value = e.message || 'No pudimos reproducir el video.';
  }
}
function pausar() { video.value.pause(); }

// Nada de adelantar: si se intenta saltar más allá de lo visto, vuelve. Los eventos del video pueden
// llegar después de desmontar (al cambiar de paso con el video andando): sin video no se hace nada.
function alBuscar() {
  const v = video.value;
  if (v && v.currentTime > visto.value + 0.5) v.currentTime = visto.value;
}
function alAvanzar() {
  const v = video.value;
  if (!v) return;
  actual.value = v.currentTime;
  if (!v.seeking && v.currentTime > visto.value && v.currentTime - visto.value < 2) visto.value = v.currentTime;
}
function alCambiarVelocidad() {
  const v = video.value;
  if (v && v.playbackRate !== 1) v.playbackRate = 1;
}

async function alTerminar() {
  estado.value = 'validando';
  try {
    const r = await api('/induccion/completar', { metodo: 'POST', cuerpo: { recibo } });
    estado.value = 'completo';
    emit('completo', r);
  } catch (e) {
    estado.value = 'listo';
    recibo = null;
    visto.value = 0;
    error.value = e.message;
  }
}
function verDeNuevo() {
  recibo = null;
  visto.value = 0;
  estado.value = 'listo';
  if (video.value) video.value.currentTime = 0;
}
onUnmounted(() => video.value?.pause());
</script>

<template>
  <div class="induccion">
    <div v-if="info" class="pantalla">
      <video ref="video" :src="info.url" preload="metadata" playsinline disablepictureinpicture controlslist="nodownload noplaybackrate"
             @play="estado = 'reproduciendo'" @pause="estado === 'reproduciendo' && (estado = 'pausado')"
             @seeking="alBuscar" @timeupdate="alAvanzar" @ratechange="alCambiarVelocidad" @ended="alTerminar"
             @contextmenu.prevent />
      <div v-if="estado === 'completo'" class="cubierta">
        <p class="hecho"><span class="tri-mark ok" aria-hidden="true" />Inducción vista completa</p>
        <button type="button" class="enlace" @click="verDeNuevo">Verla de nuevo</button>
      </div>
    </div>
    <p v-else-if="estado === 'error'" class="aviso error"><span class="tri-mark" aria-hidden="true" />{{ error }}</p>

    <div v-if="info && estado !== 'completo'" class="controles">
      <button v-if="estado !== 'reproduciendo'" type="button" class="btn-sec" :disabled="estado === 'validando' || estado === 'cargando'" @click="reproducir">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 2.5v11l9-5.5Z" fill="currentColor" /></svg>
        {{ visto > 0 ? 'Seguir' : 'Reproducir' }}
      </button>
      <button v-else type="button" class="btn-sec" @click="pausar">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" /></svg>
        Pausar
      </button>
      <div class="avance" role="progressbar" :aria-valuenow="Math.round(avance * 100)" aria-valuemin="0" aria-valuemax="100" aria-label="Avance del video">
        <i :style="{ transform: `scaleX(${avance})` }" />
      </div>
      <span class="tiempo num" aria-live="off">{{ estado === 'validando' ? 'Validando…' : `Faltan ${fmt(restante)}` }}</span>
    </div>
    <p v-if="error && estado !== 'error'" class="aviso error" role="alert"><span class="tri-mark" aria-hidden="true" />{{ error }}</p>
    <p v-if="info && estado !== 'completo'" class="nota">{{ info.titulo }} · {{ fmt(info.duracion_seg) }}. No se puede adelantar; si pausás, seguís desde donde quedaste.</p>
  </div>
</template>

<style scoped>
.induccion { display: grid; gap: 12px; }
.pantalla { position: relative; border-radius: 6px; overflow: hidden; background: #000; aspect-ratio: 16 / 9; }
video { width: 100%; height: 100%; display: block; }
.cubierta { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 10px; background: rgb(17 17 17 / 0.72); color: #fff; }
.hecho { display: flex; align-items: center; gap: 10px; font-size: var(--t-sub); font-weight: 650; font-stretch: var(--ancho-titulo); }
.hecho .tri-mark { width: 26px; height: 23px; background: #4cc25a; }
.cubierta .enlace { color: #fff; }
.controles { display: flex; align-items: center; gap: 16px; }
.avance { flex: 1; height: 6px; border-radius: 3px; background: var(--raised); overflow: hidden; }
.avance i { display: block; height: 100%; background: var(--ink); transform-origin: left; transition: transform 250ms linear; }
.tiempo { color: var(--muted); font-size: var(--t-nota); min-width: 96px; text-align: right; }
.nota { color: var(--muted); font-size: var(--t-nota); }
</style>
