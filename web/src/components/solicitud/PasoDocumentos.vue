<script setup>
// Paso 5: ART y nómina. Obligatorios salvo para las categorías que la configuración exime (por
// defecto, visitas).
import { computed } from 'vue';
import { CATEGORIAS, requiereDocumentos } from '@accesos/shared';
import { sinDocumentos } from '../../composables/useReglas.js';
import DropZone from './DropZone.vue';
import { api } from '../../composables/api.js';

const props = defineProps({
  modelo: { type: Object, required: true },
  vista: { type: Object, required: true },
  errores: { type: Object, default: () => ({}) },
  categoria: { type: String, default: '' },
});
const obligatorio = computed(() => requiereDocumentos(props.categoria, sinDocumentos.value));
const DOCS = [
  { campo: 'doc_art', rotulo: 'Certificado de ART', ayuda: 'Con cobertura vigente para las fechas de la visita. PDF, JPG o PNG de hasta 10 MB.' },
  { campo: 'doc_nomina', rotulo: 'Nómina del personal', ayuda: 'Las personas cubiertas, con nombre y documento. PDF, JPG o PNG de hasta 10 MB.' },
];
const archivo = (campo) => {
  const id = props.modelo[campo];
  return id ? { id, ...(props.vista.archivos[id] ?? { nombre: 'Archivo subido', tamano: 0 }) } : null;
};

function subido(campo, r) {
  const anterior = props.modelo[campo];
  props.modelo[campo] = r.id;
  props.vista.archivos[r.id] = { nombre: r.nombre, tamano: r.tamano };
  if (anterior) quitarDelServidor(anterior);
}
function quitado(campo) {
  const id = props.modelo[campo];
  props.modelo[campo] = null;
  if (id) quitarDelServidor(id);
}
function quitarDelServidor(id) {
  delete props.vista.archivos[id];
  api(`/uploads/${id}`, { metodo: 'DELETE' }).catch(() => {});
}
</script>

<template>
  <div class="documentos">
    <p v-if="!obligatorio" class="aviso ok"><span class="tri-mark" aria-hidden="true" />Para la categoría {{ CATEGORIAS[categoria] ?? 'elegida' }} no hacen falta. Si tenés la ART igual, podés adjuntarla.</p>
    <DropZone v-for="d in DOCS" :key="d.campo" :rotulo="obligatorio ? d.rotulo : `${d.rotulo} (opcional)`" :ayuda="d.ayuda"
              :archivo="archivo(d.campo)" :error="errores[d.campo]"
              @subido="subido(d.campo, $event)" @quitado="quitado(d.campo)" />
    <p class="nota">Cada archivo se revisa con antivirus antes de aceptarlo. Los guardamos en servidores propios y los borramos 12 meses después de que la solicitud se cierra.</p>
  </div>
</template>

<style scoped>
.documentos { display: grid; gap: 28px; }
.nota { color: var(--muted); font-size: var(--t-nota); }
</style>
