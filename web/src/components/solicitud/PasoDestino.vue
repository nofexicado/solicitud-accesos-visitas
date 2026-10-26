<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import Campo from './Campo.vue';
import MapaPacks from './MapaPacks.vue';
import { api } from '../../composables/api.js';
import { useGsap } from '../../composables/useGsap.js';

const props = defineProps({
  modelo: { type: Object, required: true },
  vista: { type: Object, required: true },
  errores: { type: Object, default: () => ({}) },
  packs: { type: Array, required: true },
});

const raiz = ref(null);
const { add, reducido } = useGsap(raiz);
const pack = computed(() => props.packs.find((p) => p.id === props.modelo.pack_id) ?? null);
const otra = ref(Boolean(props.modelo.otra_locacion));
const autorizantes = ref([]);
const cargando = ref(false);

async function elegirPack(p) {
  if (props.modelo.pack_id === p.id) return;
  const estado = reducido() ? null : Flip.getState('.opcion-pack');
  Object.assign(props.modelo, { pack_id: p.id, planta_id: p.plantas.length === 1 ? p.plantas[0].id : null, autorizante_id: null, pendiente_asignacion: false });
  otra.value = false;
  props.modelo.otra_locacion = '';
  props.vista.pack = p.nombre;
  await nextTick();
  // El pack elegido se marca y las plantas aparecen debajo; el resto se reacomoda con Flip.
  add(() => {
    if (estado) Flip.from(estado, { duration: 0.3, ease: 'power2.out' });
    if (!reducido()) gsap.from('.opcion-planta', { y: 12, autoAlpha: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' });
  });
}

function elegirPlanta(id) {
  otra.value = false;
  props.modelo.otra_locacion = '';
  props.modelo.planta_id = id;
}
function elegirOtra() {
  otra.value = true;
  props.modelo.planta_id = null;
}

// Autorizantes de la planta: si no hay, la solicitud sale "pendiente de asignación".
watch(() => [props.modelo.planta_id, otra.value], async ([planta]) => {
  autorizantes.value = [];
  props.vista.planta = pack.value?.plantas.find((x) => x.id === planta)?.nombre ?? (otra.value ? 'Otra locación' : '');
  if (!planta) {
    props.modelo.autorizante_id = null;
    props.modelo.pendiente_asignacion = otra.value;
    return;
  }
  cargando.value = true;
  try {
    autorizantes.value = await api(`/catalogo/plantas/${planta}/autorizantes`);
  } catch {
    autorizantes.value = [];
  } finally {
    cargando.value = false;
  }
  if (!autorizantes.value.some((a) => a.id === props.modelo.autorizante_id)) props.modelo.autorizante_id = null;
  // Sin autorizantes cargados, sale pendiente de asignación; con autorizantes, se respeta el "No sé".
  props.modelo.pendiente_asignacion = autorizantes.value.length === 0 || (!props.modelo.autorizante_id && props.modelo.pendiente_asignacion);
}, { immediate: true });

// Elegir un autorizante, o "No sé": les llega a todos los de la planta y la toma el primero que actúa.
const eleccion = computed({
  get: () => (props.modelo.autorizante_id ? String(props.modelo.autorizante_id) : props.modelo.pendiente_asignacion ? 'planta' : ''),
  set: (v) => {
    if (v === 'planta') Object.assign(props.modelo, { autorizante_id: null, pendiente_asignacion: true });
    else Object.assign(props.modelo, { autorizante_id: Number(v), pendiente_asignacion: false });
  },
});

watch(() => props.modelo.autorizante_id, (id) => {
  props.vista.autorizante = autorizantes.value.find((a) => a.id === id)?.nombre ?? '';
});
</script>

<template>
  <div ref="raiz" class="destino">
    <fieldset>
      <legend>Pack</legend>
      <MapaPacks class="mapa" :packs="packs" :elegido="modelo.pack_id" :planta="modelo.planta_id" />
      <div class="opciones packs">
        <button v-for="p in packs" :key="p.id" type="button" class="opcion opcion-pack" :aria-pressed="modelo.pack_id === p.id" @click="elegirPack(p)">
          <span class="forma" aria-hidden="true" />
          <span><b>{{ p.nombre }}</b><small>{{ p.plantas.length === 1 ? '1 planta' : `${p.plantas.length} plantas` }}</small></span>
        </button>
      </div>
      <p v-if="errores.pack_id" class="error" role="alert">{{ errores.pack_id }}</p>
    </fieldset>

    <fieldset v-if="pack">
      <legend>Planta</legend>
      <div class="opciones">
        <button v-for="pl in pack.plantas" :key="pl.id" type="button" class="opcion opcion-planta" :aria-pressed="modelo.planta_id === pl.id" @click="elegirPlanta(pl.id)">
          <span class="forma" aria-hidden="true" /><b>{{ pl.nombre }}</b>
        </button>
        <button type="button" class="opcion opcion-planta" :aria-pressed="otra" @click="elegirOtra">
          <span class="forma" aria-hidden="true" /><b>Otra locación del pack</b>
        </button>
      </div>
      <p v-if="errores.planta_id" class="error" role="alert">{{ errores.planta_id }}</p>
      <Campo v-if="otra" v-slot="c" class="otra" rotulo="¿Dónde?" ayuda="Pozo, batería, locación o tramo de ducto." :error="errores.otra_locacion">
        <input :id="c.id" v-model="modelo.otra_locacion" class="entrada" maxlength="200" :aria-invalid="c.invalido" :aria-describedby="c.describe">
      </Campo>
    </fieldset>

    <div v-if="pack" class="paso-grilla">
      <Campo v-slot="c" rotulo="¿A quién visitás?" ayuda="Nombre de tu contacto o del área." :error="errores.contacto_interno">
        <input :id="c.id" v-model="modelo.contacto_interno" class="entrada" maxlength="120" :aria-invalid="c.invalido" :aria-describedby="c.describe">
      </Campo>
      <Campo v-if="modelo.planta_id && autorizantes.length" v-slot="c" rotulo="Quién autoriza" ayuda="Responsable de la planta que aprueba la visita. Si no sabés, les llega a todos los de la planta." :error="errores.autorizante_id">
        <select :id="c.id" v-model="eleccion" class="entrada" :aria-invalid="c.invalido" :aria-describedby="c.describe">
          <option value="" disabled>Elegí una persona</option>
          <option v-for="a in autorizantes" :key="a.id" :value="String(a.id)">{{ a.nombre }}</option>
          <option value="planta">No sé: que lo resuelva la planta</option>
        </select>
      </Campo>
      <p v-else-if="(modelo.planta_id || otra) && !cargando" class="aviso ancho">
        <span class="tri-mark" aria-hidden="true" />
        <span>{{ otra ? 'Para otra locación' : 'Esta planta todavía no tiene responsables cargados' }}: la solicitud sale como pendiente de asignación y HSE la deriva a quien corresponda.</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.destino { display: grid; gap: 32px; }
fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: 14px; min-width: 0; }
legend { font-weight: 600; margin-bottom: 10px; padding: 0; }
.mapa { max-width: 520px; margin-bottom: 4px; }
.opciones { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.opcion { display: flex; align-items: center; gap: 14px; min-height: 64px; padding: 14px 16px; text-align: left; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); transition: border-color var(--t-hover) ease, background-color var(--t-hover) ease, transform var(--t-press) var(--ease-out); }
.opcion:hover { border-color: var(--muted); }
.opcion:active { transform: scale(0.99); }
.opcion[aria-pressed="true"] { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); }
.opcion .forma { flex: none; width: 18px; height: 16px; background: var(--raised); clip-path: polygon(0 0, 100% 0, 50% 100%); transition: background-color var(--t-hover) ease; }
.opcion[aria-pressed="true"] .forma { background: var(--ink); }
.opcion b { display: block; font-weight: 600; }
.opcion small { display: block; color: var(--muted); font-size: var(--t-nota); }
.otra { margin-top: 6px; }
.error { color: var(--pill-no-ink); font-size: var(--t-nota); font-weight: 500; }
</style>
