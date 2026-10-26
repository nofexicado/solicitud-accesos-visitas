<script setup>
// Resultado de un pase en recepción: Habilitado / No habilitado bien grande, los datos para
// controlar (personas, vehículo, destino y fechas) y el ingreso o egreso de cada persona de un toque.
import { computed, ref, watch } from 'vue';
import { CATEGORIAS, formatearPatente } from '@accesos/shared';
import { diaMes, rango, plural } from '../operador/formato.js';

const props = defineProps({
  r: { type: Object, required: true },
  ocupado: { type: Boolean, default: false },
});
const emit = defineEmits(['movimiento', 'otro']);

const s = computed(() => props.r.solicitud);
const hora = (ts) => new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const hoyLocal = new Date().toLocaleDateString('en-CA');
const desde = (ts) => (new Date(ts).toLocaleDateString('en-CA') === hoyLocal ? hora(ts) : `${diaMes(new Date(ts).toLocaleDateString('en-CA'))} ${hora(ts)}`);

// Vehículo con el que entran (si viene uno solo, ese).
const vehiculo = ref(null);
watch(() => props.r.solicitud?.numero, () => { vehiculo.value = props.r.vehiculos.length === 1 ? props.r.vehiculos[0].id : null; }, { immediate: true });

const afuera = computed(() => props.r.personas.filter((p) => !p.dentro));
const adentro = computed(() => props.r.personas.filter((p) => p.dentro));
const titulo = computed(() => ({ habilitado: 'Habilitado', no_habilitado: 'No habilitado', desconocido: 'No es un pase válido' })[props.r.resultado]);

const ingreso = (ids) => emit('movimiento', { tipo: 'ingreso', persona_ids: ids, vehiculo_id: vehiculo.value });
const egreso = (ids) => emit('movimiento', { tipo: 'egreso', persona_ids: ids, vehiculo_id: null });
</script>

<template>
  <section class="panel resultado" :class="r.resultado" aria-labelledby="resultado-titulo" aria-live="polite">
    <div class="veredicto">
      <span class="marca" aria-hidden="true" />
      <div>
        <h2 id="resultado-titulo">{{ titulo }}</h2>
        <p v-if="r.motivo" class="motivo">{{ r.motivo }}</p>
        <p v-else-if="s" class="motivo">Del {{ rango(s.fecha_desde, s.fecha_hasta) }}{{ s.hora_desde ? ` · ${s.hora_desde} a ${s.hora_hasta ?? '—'}` : '' }}</p>
      </div>
    </div>
    <ul v-if="r.avisos.length" class="avisos">
      <li v-for="a in r.avisos" :key="a" class="aviso"><span class="tri-mark" aria-hidden="true" />{{ a }}</li>
    </ul>

    <template v-if="s">
      <div class="cabeza">
        <h3>{{ s.empresa }}</h3>
        <p class="sub"><span class="num">{{ s.numero }}</span> · {{ CATEGORIAS[s.categoria] }}</p>
      </div>
      <dl class="datos">
        <div><dt>Destino</dt><dd>{{ [s.planta, s.pack].filter(Boolean).join(' · ') }}</dd></div>
        <div><dt>Fechas</dt><dd class="num">{{ rango(s.fecha_desde, s.fecha_hasta) }}{{ s.hora_desde ? ` · ${s.hora_desde} a ${s.hora_hasta ?? '—'}` : '' }}</dd></div>
        <div><dt>Visita a</dt><dd>{{ s.contacto_interno || '—' }}</dd></div>
      </dl>

      <fieldset v-if="r.vehiculos.length" class="vehiculos">
        <legend>Vehículo con el que entran</legend>
        <label v-for="v in r.vehiculos" :key="v.id" class="opcion-vehiculo" :class="{ elegido: vehiculo === v.id }">
          <input v-model="vehiculo" type="radio" name="vehiculo" :value="v.id">
          <span class="chapa num">{{ v.patente ? formatearPatente(v.patente) : '—' }}</span>
          <span class="muted">{{ v.marca_modelo }}<template v-if="v.vencido"> · <b class="vencido">seguro o VTV vencidos</b></template></span>
        </label>
        <label class="opcion-vehiculo" :class="{ elegido: vehiculo === null }">
          <input v-model="vehiculo" type="radio" name="vehiculo" :value="null">
          <span>A pie o en otro vehículo</span>
        </label>
      </fieldset>

      <div class="personas">
        <div class="personas-cabeza">
          <h3>Personas <small>{{ adentro.length }} de {{ r.personas.length }} adentro</small></h3>
          <div class="todas">
            <button v-if="r.habilitado && afuera.length > 1" class="btn primario" type="button" :disabled="ocupado" @click="ingreso(afuera.map((p) => p.id))">Ingresan {{ afuera.length }}</button>
            <button v-if="adentro.length > 1" class="btn" type="button" :disabled="ocupado" @click="egreso(adentro.map((p) => p.id))">Egresan {{ adentro.length }}</button>
          </div>
        </div>
        <ul>
          <li v-for="p in r.personas" :key="p.id" class="persona">
            <div>
              <b>{{ p.nombre_apellido }}</b>
              <span class="muted num">{{ p.tipo_doc === 'dni' ? 'DNI' : 'Pasaporte' }} {{ p.nro_doc ?? '—' }} · {{ p.cargo }}</span>
            </div>
            <span v-if="p.dentro" class="pill ok"><span class="tri-mark ok" aria-hidden="true" />Adentro desde {{ desde(p.desde) }}</span>
            <span v-else class="pill">Afuera</span>
            <button v-if="p.dentro" class="btn" type="button" :disabled="ocupado" @click="egreso([p.id])">Egreso</button>
            <button v-else-if="r.habilitado" class="btn primario" type="button" :disabled="ocupado" @click="ingreso([p.id])">Ingreso</button>
            <span v-else />
          </li>
        </ul>
        <p v-if="!r.habilitado && afuera.length" class="nota">No se puede registrar el ingreso: {{ r.motivo.toLowerCase() }} Si alguien está adentro, su egreso sí se registra.</p>
      </div>
    </template>
    <button class="btn otro" type="button" @click="emit('otro')">Escanear otro pase</button>
    <p class="sr-only">{{ plural(adentro.length, 'persona adentro', 'personas adentro') }}</p>
  </section>
</template>

<style scoped>
.resultado { display: grid; gap: 16px; padding: 0 0 16px; overflow: hidden; }
.veredicto { display: flex; gap: 16px; align-items: center; padding: 18px 20px; }
.habilitado .veredicto { background: var(--pill-ok-bg); color: var(--pill-ok-ink); }
.no_habilitado .veredicto, .desconocido .veredicto { background: var(--pill-no-bg); color: var(--pill-no-ink); }
.marca { flex: none; width: 44px; height: 39px; clip-path: polygon(0 0, 100% 0, 50% 100%); background: currentColor; }
.habilitado .marca { background: var(--verde); }
.no_habilitado .marca, .desconocido .marca { clip-path: polygon(20% 0, 50% 30%, 80% 0, 100% 20%, 70% 50%, 100% 80%, 80% 100%, 50% 70%, 20% 100%, 0 80%, 30% 50%, 0 20%); width: 36px; height: 36px; }
.veredicto h2 { font-size: var(--fs-title); line-height: 34px; font-weight: 700; font-stretch: var(--ancho-titulo); }
.motivo { font-weight: 500; }
.avisos { display: grid; gap: 6px; padding: 0 20px; }
.avisos .aviso { background: var(--pill-hse-bg); color: var(--pill-hse-ink); }
.avisos .tri-mark { background: currentColor; }
.cabeza, .datos, .vehiculos, .personas, .otro { margin: 0 20px; }
.cabeza h3 { font-size: var(--fs-exp); line-height: 26px; font-weight: 650; font-stretch: var(--ancho-titulo); }
.sub { color: var(--muted); }
.sub .num { color: var(--ink); }
.datos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.datos dt { color: var(--muted); }
.vehiculos { display: grid; gap: 6px; border: 0; padding: 0; }
.vehiculos legend { font-weight: 600; margin-bottom: 6px; }
.opcion-vehiculo { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 6px 12px; border: 1px solid var(--control); border-radius: 6px; cursor: pointer; }
.opcion-vehiculo.elegido { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); }
.opcion-vehiculo input { width: 18px; height: 18px; accent-color: var(--ink); }
.chapa { padding: 2px 10px; border: 2px solid var(--ink); border-radius: 4px; font-size: 20px; font-weight: 700; letter-spacing: 0.04em; }
.vencido { color: var(--pill-no-ink); font-weight: 600; }
.personas-cabeza { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.personas h3 { font-size: var(--fs-section); font-weight: 600; }
.personas h3 small { font-weight: 400; color: var(--muted); font-size: var(--fs-body); margin-left: 6px; }
.todas { display: flex; gap: 8px; }
.persona { display: grid; grid-template-columns: minmax(0, 1fr) auto 96px; align-items: center; gap: 12px; min-height: 60px; padding: 8px 0; }
.persona + .persona { border-top: 1px solid var(--rule); }
.persona b { display: block; font-weight: 600; }
.persona .btn { height: 44px; }
.pill .tri-mark { width: 9px; height: 8px; }
.nota { margin-top: 8px; color: var(--muted); }
.otro { justify-self: start; }
@media (max-width: 600px) {
  .datos { grid-template-columns: 1fr; }
  .persona { grid-template-columns: minmax(0, 1fr) 96px; }
  .persona .pill { grid-column: 1; grid-row: 2; justify-self: start; }
  .persona .btn, .persona > span:last-child { grid-column: 2; grid-row: 1 / 3; }
}
</style>
