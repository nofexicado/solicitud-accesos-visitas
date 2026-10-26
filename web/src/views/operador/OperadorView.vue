<script setup>
// Bandeja del panel: KPIs, lista de la vista elegida y expediente.
// En el celular, un panel por vez: la lista, y al elegir una solicitud, su expediente.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usuario } from '../../composables/useSesion.js';
import Bandeja from './Bandeja.vue';
import Expediente from './Expediente.vue';
import PanelLateral from './PanelLateral.vue';
import { plural } from './formato.js';
import { cargarKpis, kpis, tieneRol, usePanelApi, vistasDe } from './panel.js';
import './panel.css';

const route = useRoute();
const router = useRouter();
const { llamar } = usePanelApi();

const esHse = computed(() => tieneRol('hse'));
const VISTAS = computed(() => vistasDe());
const vista = computed(() => VISTAS.value.find((v) => v.clave === route.query.vista) ?? VISTAS.value[0]);
const numero = computed(() => route.params.numero || '');

const orden = ref('llegada');
const busqueda = ref('');
const filas = ref([]);
const estadoLista = ref('cargando');
const exp = ref(null);
const estadoExp = ref('vacio'); // vacio | cargando | listo | error
const errorExp = ref('');
const aviso = ref('');

let pedidoLista = 0;
async function cargarLista() {
  if (!usuario.value || !vista.value) return; // al salir, la vista se recalcula antes de desmontarse
  const yo = ++pedidoLista;
  estadoLista.value = 'cargando';
  try {
    const q = new URLSearchParams({ vista: vista.value.clave, orden: orden.value, q: busqueda.value.trim() });
    const r = await llamar(`/operador/solicitudes?${q}`);
    if (yo !== pedidoLista) return;
    filas.value = r;
    estadoLista.value = 'listo';
  } catch {
    if (yo === pedidoLista) estadoLista.value = 'error';
  }
}
async function cargarExpediente() {
  if (!usuario.value) return;
  if (!numero.value) { exp.value = null; estadoExp.value = 'vacio'; return; }
  if (exp.value?.numero !== numero.value) estadoExp.value = 'cargando';
  try {
    exp.value = await llamar(`/operador/solicitudes/${encodeURIComponent(numero.value)}`);
    estadoExp.value = 'listo';
  } catch (e) {
    errorExp.value = e.message;
    estadoExp.value = 'error';
  }
}

let espera;
watch(busqueda, () => { clearTimeout(espera); espera = setTimeout(cargarLista, 250); });
watch([() => vista.value?.clave, orden], cargarLista);
watch(numero, cargarExpediente);
onMounted(() => {
  // Recepción sola no tiene bandeja de solicitudes.
  if (!VISTAS.value.length) { router.replace('/recepcion'); return; }
  cargarLista(); cargarKpis(llamar); cargarExpediente();
});
onUnmounted(() => clearTimeout(espera));

// Después de cada acción se recarga todo lo que la muestra; el mensaje se anuncia.
async function alCambiar(mensaje) {
  aviso.value = mensaje;
  await Promise.all([cargarExpediente(), cargarLista(), cargarKpis(llamar)]);
}

// "Tomar" la próxima: la que empieza antes entre las enviadas sin tomar.
const proxima = computed(() => (esHse.value && vista.value?.clave === 'hse'
  ? [...filas.value].filter((s) => s.estado === 'enviada').sort((a, b) => a.fecha_desde.localeCompare(b.fecha_desde) || a.created_at.localeCompare(b.created_at))[0]
  : null));
const tomando = ref(false);
async function tomarProxima() {
  tomando.value = true;
  try {
    await llamar(`/operador/solicitudes/${proxima.value.numero}/tomar`, { metodo: 'POST' });
    const n = proxima.value.numero;
    await router.push({ path: `/operador/${n}`, query: route.query });
    await alCambiar(`Tomaste la ${n}. ${exp.value?.documentos.length ? 'Revisá los documentos.' : 'No tiene documentos: revisá los datos y validala.'}`);
  } catch (e) {
    aviso.value = e.message;
  } finally {
    tomando.value = false;
  }
}

// KPIs según el rol: una fila dividida, etiqueta sobre valor.
const tarjetas = computed(() => {
  const k = kpis.value;
  const v = (x) => (k ? x : null);
  const empiezan = (n) => (n ? `${plural(n, 'empieza', 'empiezan')} mañana o antes` : 'ninguna empieza mañana');
  const dentro = ['Personas dentro', v(k?.personas_dentro), 'ingresos sin egreso', '/en-planta'];
  return esHse.value
    ? [
        ['Para revisar HSE', v(k?.en_hse), k ? empiezan(k.en_hse_manana) : ''],
        ['Esperan autorizante', v(k?.para_autorizar), k?.sin_autorizante ? `${k.sin_autorizante} sin autorizante asignado` : 'ya validadas por HSE'],
        ['Aprobadas hoy', v(k?.aprobadas_hoy), 'desde las 00:00'],
        dentro,
      ]
    : [
        ['Para autorizar', v(k?.para_autorizar), k ? empiezan(k.para_autorizar_manana) : ''],
        ['En revisión de HSE', v(k?.en_hse), 'todavía no te llegan'],
        ['Aprobadas hoy', v(k?.aprobadas_hoy), 'desde las 00:00'],
        dentro,
      ];
});
// La frase de arriba responde la pregunta del día: ¿qué no puede esperar?
const hallazgo = computed(() => {
  const k = kpis.value;
  if (!k) return '';
  const n = esHse.value ? k.en_hse_manana : k.para_autorizar_manana;
  const falta = esHse.value ? 'la validación de HSE' : 'tu autorización';
  if (!n) return { fuerte: 'Nada urgente', resto: `: ninguna solicitud que empiece mañana espera ${falta}.` };
  return { fuerte: `${plural(n, 'solicitud empieza', 'solicitudes empiezan')} mañana o antes`, resto: ` y todavía no ${n === 1 ? 'tiene' : 'tienen'} ${falta}.` };
});
</script>

<template>
  <div v-if="vista" class="op app" :class="{ 'con-expediente': numero }">
    <PanelLateral :activo="`vista:${vista.clave}`" />

    <main id="contenido" class="canvas" tabindex="-1">
      <div class="titulo">
        <div>
          <h1>{{ vista.titulo }}</h1>
          <p v-if="hallazgo" class="hallazgo"><strong>{{ hallazgo.fuerte }}</strong>{{ hallazgo.resto }}</p>
        </div>
        <button v-if="proxima" class="btn primario" type="button" :disabled="tomando" @click="tomarProxima">{{ tomando ? 'Tomando…' : `Tomar ${proxima.numero.slice(-6)}` }}</button>
      </div>

      <p class="sr-only" role="status" aria-live="polite">{{ aviso }}</p>
      <p v-if="aviso" class="aviso-accion" aria-hidden="true"><span class="tri-mark" />{{ aviso }}<button type="button" class="cerrar" @click="aviso = ''">Listo</button></p>

      <dl class="kpis" :aria-busy="!kpis">
        <div v-for="[l, val, nota, enlace] in tarjetas" :key="l" class="kpi">
          <dt>{{ l }}</dt>
          <dd :class="{ cero: val === null }" class="num">{{ val === null ? '—' : val }}</dd>
          <p class="nota"><RouterLink v-if="enlace" :to="enlace">{{ nota }}: ver la lista</RouterLink><template v-else>{{ nota }}</template></p>
        </div>
      </dl>

      <div class="trabajo">
        <Bandeja v-model:orden="orden" v-model:busqueda="busqueda" class="col-lista" :filas="filas" :estado="estadoLista" :seleccionada="numero"
                 :con-orden="['hse', 'autorizar'].includes(vista.clave)" :vacio="vista.vacio" :usuario-id="usuario?.id" @reintentar="cargarLista" />

        <div class="col-expediente">
          <RouterLink v-if="numero" class="volver" :to="{ path: '/operador', query: route.query }">Volver a la lista</RouterLink>
          <Expediente v-if="exp && estadoExp !== 'error'" :exp="exp" :llamar="llamar" :aria-busy="estadoExp === 'cargando'" @cambio="alCambiar" />
          <section v-else-if="estadoExp === 'error'" class="panel bloque">
            <p>{{ errorExp }}</p>
            <button class="btn" type="button" @click="cargarExpediente">Reintentar</button>
          </section>
          <section v-else-if="estadoExp === 'cargando'" class="panel bloque cargando" aria-busy="true"><i /><i class="corto" /><i /></section>
          <section v-else class="panel bloque vacio">
            <h2>Elegí una solicitud</h2>
            <p>Su expediente aparece acá: documentos, personas, vehículos, ingresos y egresos e historial, con las acciones que te corresponden.</p>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.trabajo { display: grid; grid-template-columns: var(--lista) minmax(0, 1fr); gap: var(--gap); align-items: start; }
.volver { display: none; }

@media (max-width: 1100px) { .op { --lista: 320px; } }
/* Teléfono y tablet angosta: un panel por vez. */
@media (max-width: 900px) {
  .trabajo { grid-template-columns: minmax(0, 1fr); }
  .col-expediente { display: none; }
  .con-expediente .col-lista, .con-expediente .kpis, .con-expediente .titulo { display: none; }
  .con-expediente .col-expediente { display: grid; gap: 12px; }
  .volver { display: inline-block; justify-self: start; min-height: 44px; line-height: 44px; text-decoration: underline; text-underline-offset: 4px; }
}
</style>
