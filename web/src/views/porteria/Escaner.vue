<script setup>
// Lector de QR con la cámara de la tablet o el celular de recepción. Usa BarcodeDetector cuando el
// navegador lo trae y, si no, jsQR (local). Si no hay cámara, una foto del QR también sirve.
import { onUnmounted, ref } from 'vue';
import jsQR from 'jsqr';

const emit = defineEmits(['leido']);
const video = ref(null);
const estado = ref('quieto'); // quieto | abriendo | leyendo | error
const error = ref('');
let flujo = null;
let reloj = null;
let detector = null;
const lienzo = document.createElement('canvas');

async function crearDetector() {
  if (detector !== null) return detector;
  try {
    detector = 'BarcodeDetector' in window && (await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')
      ? new window.BarcodeDetector({ formats: ['qr_code'] }) : false;
  } catch { detector = false; }
  return detector;
}

/** Busca un QR en un video, imagen o bitmap. Devuelve el texto o null. */
async function decodificar(fuente, ancho, alto) {
  const d = await crearDetector();
  if (d) {
    try { const [c] = await d.detect(fuente); if (c?.rawValue) return c.rawValue; } catch { /* sigue con jsQR */ }
  }
  const escala = Math.min(1, 1000 / Math.max(ancho, alto));
  lienzo.width = Math.round(ancho * escala);
  lienzo.height = Math.round(alto * escala);
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(fuente, 0, 0, lienzo.width, lienzo.height);
  const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  return jsQR(datos.data, datos.width, datos.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

function detener() {
  clearTimeout(reloj);
  flujo?.getTracks().forEach((t) => t.stop());
  flujo = null;
  if (estado.value !== 'error') estado.value = 'quieto';
}

async function abrir() {
  error.value = '';
  if (!navigator.mediaDevices?.getUserMedia) {
    estado.value = 'error';
    error.value = 'Este navegador no permite usar la cámara acá (hace falta https). Subí una foto del QR o buscá el pase.';
    return;
  }
  estado.value = 'abriendo';
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    video.value.srcObject = flujo;
    await video.value.play();
    estado.value = 'leyendo';
    const mirar = async () => {
      if (!flujo) return;
      const v = video.value;
      if (v?.readyState >= 2) {
        const texto = await decodificar(v, v.videoWidth, v.videoHeight);
        if (texto) { detener(); emit('leido', texto); return; }
      }
      reloj = setTimeout(mirar, 180);
    };
    mirar();
  } catch (e) {
    detener();
    estado.value = 'error';
    error.value = e.name === 'NotAllowedError'
      ? 'No hay permiso para usar la cámara. Habilitalo en el navegador, subí una foto del QR o buscá el pase.'
      : 'No pudimos abrir la cámara. Subí una foto del QR o buscá el pase.';
  }
}

async function desdeFoto(e) {
  const archivo = e.target.files?.[0];
  e.target.value = '';
  if (!archivo) return;
  error.value = '';
  try {
    const bitmap = await createImageBitmap(archivo);
    const texto = await decodificar(bitmap, bitmap.width, bitmap.height);
    if (texto) emit('leido', texto);
    else { estado.value = 'error'; error.value = 'No encontramos un QR en la foto. Probá con otra más cerca y derecha, o buscá el pase.'; }
  } catch {
    estado.value = 'error';
    error.value = 'No pudimos leer esa imagen.';
  }
}

onUnmounted(detener);
defineExpose({ abrir, detener });
</script>

<template>
  <section class="panel escaner" aria-labelledby="titulo-escaner">
    <h2 id="titulo-escaner">Escanear el QR</h2>
    <div class="visor" :class="{ activo: estado === 'leyendo' || estado === 'abriendo' }">
      <video ref="video" muted playsinline aria-label="Imagen de la cámara" />
      <div v-if="estado === 'leyendo'" class="mira" aria-hidden="true" />
      <p v-if="estado === 'quieto' || estado === 'error'" class="apagado">Apuntá la cámara al QR del pase, en el celular o impreso.</p>
    </div>
    <p v-if="estado === 'leyendo'" class="ayuda" role="status">Buscando el QR…</p>
    <p v-if="error" class="aviso error" role="alert"><span class="tri-mark" aria-hidden="true" />{{ error }}</p>
    <div class="acciones">
      <button v-if="estado !== 'leyendo' && estado !== 'abriendo'" class="btn primario grande" type="button" @click="abrir">Abrir la cámara</button>
      <button v-else class="btn grande" type="button" @click="detener">Detener</button>
      <label class="btn grande foto">
        Usar una foto del QR
        <input type="file" accept="image/*" capture="environment" class="sr-only" @change="desdeFoto">
      </label>
    </div>
  </section>
</template>

<style scoped>
.escaner { display: grid; gap: 12px; padding: 16px; }
h2 { font-size: var(--fs-section); font-weight: 600; }
.visor { position: relative; aspect-ratio: 4 / 3; border-radius: 6px; background: var(--raised); overflow: hidden; display: grid; place-items: center; }
.visor video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; }
.visor.activo video { opacity: 1; }
.mira { position: absolute; inset: 18%; border: 3px solid #ffffff; border-radius: 10px; box-shadow: 0 0 0 999px rgb(0 0 0 / 0.35); }
.apagado { max-width: 30ch; padding: 16px; text-align: center; color: var(--muted); }
.ayuda { color: var(--muted); }
.acciones { display: flex; flex-wrap: wrap; gap: 8px; }
.btn.grande { height: 44px; padding: 0 16px; }
.foto { cursor: pointer; }
.foto:focus-within { outline: 2px solid var(--ink); outline-offset: 2px; }
.aviso.error { background: var(--pill-no-bg); color: var(--pill-no-ink); }
.aviso .tri-mark { background: currentColor; }
</style>
