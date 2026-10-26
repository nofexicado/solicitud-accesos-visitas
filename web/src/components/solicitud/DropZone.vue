<script setup>
// Carga de un documento: arrastrar o elegir. Muestra el avance de la subida y, mientras el servidor
// lo revisa con el antivirus, ese estado. Usa XHR porque fetch no informa el progreso de subida.
import { ref, useId } from 'vue';

const props = defineProps({
  rotulo: { type: String, required: true },
  ayuda: { type: String, default: '' },
  archivo: { type: Object, default: null }, // { id, nombre, tamano }
  error: { type: String, default: '' },
  maxMb: { type: Number, default: 10 },
});
const emit = defineEmits(['subido', 'quitado']);

const id = useId();
const input = ref(null);
const encima = ref(false);
const estado = ref('');
const avance = ref(0);
const fallo = ref('');
const TIPOS = ['application/pdf', 'image/jpeg', 'image/png'];

const tam = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function elegido(lista) {
  const f = lista?.[0];
  if (!f) return;
  fallo.value = '';
  // Chequeo rápido en el navegador; el servidor vuelve a validar por contenido y con el antivirus.
  if (f.type && !TIPOS.includes(f.type)) { fallo.value = 'Solo se aceptan archivos PDF, JPG o PNG.'; return; }
  if (f.size > props.maxMb * 1024 * 1024) { fallo.value = `El archivo supera los ${props.maxMb} MB.`; return; }
  subir(f);
}

function subir(f) {
  const datos = new FormData();
  datos.append('archivo', f);
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/uploads');
  xhr.setRequestHeader('X-Requested-With', 'accesos');
  xhr.setRequestHeader('Accept', 'application/json');
  estado.value = 'subiendo';
  avance.value = 0;
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) avance.value = e.loaded / e.total;
    if (avance.value >= 1) estado.value = 'revisando';
  };
  xhr.upload.onload = () => { estado.value = 'revisando'; };
  xhr.onload = () => {
    let cuerpo = null;
    try { cuerpo = JSON.parse(xhr.responseText); } catch { /* respuesta vacía */ }
    estado.value = '';
    if (xhr.status === 201) emit('subido', cuerpo);
    else fallo.value = cuerpo?.error ?? 'No pudimos subir el archivo. Intentá de nuevo.';
    if (input.value) input.value.value = '';
  };
  xhr.onerror = () => {
    estado.value = '';
    fallo.value = 'Se cortó la conexión mientras subía. Intentá de nuevo.';
  };
  xhr.send(datos);
}

function soltar(e) {
  encima.value = false;
  elegido(e.dataTransfer?.files);
}
</script>

<template>
  <div class="carga">
    <p :id="`${id}-rotulo`" class="rotulo">{{ rotulo }}</p>
    <div v-if="archivo && !estado" class="listo">
      <span class="tri-mark ok" aria-hidden="true" />
      <div class="nombre"><b>{{ archivo.nombre }}</b><small class="num">{{ tam(archivo.tamano) }} · revisado</small></div>
      <span class="botones">
        <button type="button" class="enlace" @click="input.click()">Cambiar</button>
        <button type="button" class="enlace" @click="emit('quitado', archivo)">Quitar</button>
      </span>
    </div>
    <div v-else class="zona" :class="{ encima, ocupada: estado }"
         @dragover.prevent="encima = true" @dragleave="encima = false" @drop.prevent="soltar">
      <template v-if="estado">
        <p class="num">{{ estado === 'subiendo' ? `Subiendo… ${Math.round(avance * 100)} %` : 'Revisando el archivo con el antivirus…' }}</p>
        <div class="barra" role="progressbar" :aria-valuenow="Math.round(avance * 100)" aria-valuemin="0" aria-valuemax="100" :aria-labelledby="`${id}-rotulo`">
          <i :class="{ revisando: estado === 'revisando' }" :style="{ transform: `scaleX(${estado === 'revisando' ? 1 : avance})` }" />
        </div>
      </template>
      <template v-else>
        <p>Arrastrá el archivo acá o</p>
        <button type="button" class="btn-sec" :aria-describedby="`${id}-ayuda`" @click="input.click()">Elegir archivo</button>
      </template>
    </div>
    <input ref="input" class="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" tabindex="-1" :aria-labelledby="`${id}-rotulo`" @change="elegido($event.target.files)">
    <p :id="`${id}-ayuda`" class="ayuda">{{ ayuda || `PDF, JPG o PNG de hasta ${maxMb} MB.` }}</p>
    <p v-if="fallo || error" class="error" role="alert">{{ fallo || error }}</p>
  </div>
</template>

<style scoped>
.carga { display: grid; gap: 8px; }
.rotulo { font-weight: 600; }
.zona { display: grid; place-items: center; gap: 10px; min-height: 148px; padding: 20px; border: 1px dashed var(--control); border-radius: 6px; background: var(--surface); text-align: center; color: var(--muted); transition: border-color var(--t-hover) ease, background-color var(--t-hover) ease; }
.zona.encima { border-color: var(--ink); background: var(--raised); }
.zona.ocupada { border-style: solid; color: var(--ink); }
.barra { width: min(100%, 320px); height: 6px; border-radius: 3px; background: var(--raised); overflow: hidden; }
.barra i { display: block; height: 100%; background: var(--ink); transform-origin: left; transition: transform 200ms linear; }
@media (prefers-reduced-motion: no-preference) {
  .barra i.revisando { animation: late 1.4s ease-in-out infinite alternate; }
}
@keyframes late { to { opacity: 0.45; } }
.botones { display: flex; gap: 16px; }
.listo { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 14px; min-height: 72px; padding: 14px 18px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); }
.listo .tri-mark { width: 18px; height: 16px; }
.nombre b { display: block; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nombre small { color: var(--muted); font-size: var(--t-nota); }
.ayuda { color: var(--muted); font-size: var(--t-nota); }
.error { color: var(--pill-no-ink); font-size: var(--t-nota); font-weight: 500; }
@media (max-width: 520px) { .listo { grid-template-columns: auto minmax(0, 1fr); } .botones { grid-column: 2; } }
</style>
