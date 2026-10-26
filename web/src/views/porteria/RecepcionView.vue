<script setup>
// Recepción en planta: se escanea el QR (o se busca el pase si no se puede leer), se ve si está
// habilitado y se registra el ingreso o el egreso de cada persona. Pensada para una tablet o un
// celular conectado por el AP de la planta.
import { computed, onMounted, ref, watch } from 'vue';
import PanelLateral from '../operador/PanelLateral.vue';
import { cargarKpis, usePanelApi } from '../operador/panel.js';
import { plural } from '../operador/formato.js';
import Escaner from './Escaner.vue';
import ResultadoPase from './ResultadoPase.vue';
import '../operador/panel.css';

const { llamar } = usePanelApi();
const CLAVE_PLANTA = 'accesos-recepcion-planta';

const plantas = ref([]);
const plantaId = ref(null);
const estado = ref('cargando'); // cargando | listo | sin-plantas | error
const resultado = ref(null);
const consultando = ref(false);
const ocupado = ref(false);
const aviso = ref({ texto: '', error: false });
const dentro = ref(null);
const escaner = ref(null);

const busqueda = ref('');
const encontrados = ref(null);
const errorBusqueda = ref('');

const planta = computed(() => plantas.value.find((p) => p.id === plantaId.value));

onMounted(async () => {
  try {
    plantas.value = await llamar('/control/plantas');
    if (!plantas.value.length) { estado.value = 'sin-plantas'; return; }
    let guardada = null;
    try { guardada = Number(localStorage.getItem(CLAVE_PLANTA)); } catch { /* sin almacenamiento */ }
    plantaId.value = plantas.value.some((p) => p.id === guardada) ? guardada : plantas.value[0].id;
    estado.value = 'listo';
  } catch {
    estado.value = 'error';
  }
});

async function contarDentro() {
  if (!plantaId.value) return;
  try { dentro.value = (await llamar(`/control/en-planta?planta_id=${plantaId.value}`)).personas.length; } catch { dentro.value = null; }
}
watch(plantaId, (id) => {
  try { localStorage.setItem(CLAVE_PLANTA, String(id)); } catch { /* nada */ }
  resultado.value = null;
  contarDentro();
});

async function mostrar(promesa) {
  consultando.value = true;
  aviso.value = { texto: '', error: false };
  try {
    resultado.value = await promesa;
    encontrados.value = null;
  } catch (e) {
    aviso.value = { texto: e.message, error: true };
  } finally {
    consultando.value = false;
  }
}
const alLeer = (codigo) => mostrar(llamar('/control/validar', { metodo: 'POST', cuerpo: { codigo, planta_id: plantaId.value } }));
const abrirPase = (numero) => mostrar(llamar(`/control/pases/${encodeURIComponent(numero)}?planta_id=${plantaId.value}`));

async function buscar() {
  errorBusqueda.value = '';
  encontrados.value = null;
  if (busqueda.value.trim().length < 3) { errorBusqueda.value = 'Escribí el N° (o sus últimos dígitos), el DNI o la patente.'; return; }
  try {
    const r = await llamar(`/control/buscar?planta_id=${plantaId.value}&q=${encodeURIComponent(busqueda.value.trim())}`);
    if (r.length === 1) return abrirPase(r[0].numero);
    encontrados.value = r;
  } catch (e) {
    errorBusqueda.value = e.campos?.q ?? e.message;
  }
}

async function registrar({ tipo, persona_ids: ids, vehiculo_id: vehiculo }) {
  ocupado.value = true;
  aviso.value = { texto: '', error: false };
  const nombres = resultado.value.personas.filter((p) => ids.includes(p.id)).map((p) => p.nombre_apellido.split(' ')[0]);
  try {
    resultado.value = await llamar('/control/movimientos', { metodo: 'POST', cuerpo: { numero: resultado.value.solicitud.numero, planta_id: plantaId.value, tipo, persona_ids: ids, vehiculo_id: vehiculo } });
    const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    aviso.value = { texto: `${tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} registrado a las ${hora}: ${nombres.join(', ')}.`, error: false };
    contarDentro();
    cargarKpis(llamar);
  } catch (e) {
    aviso.value = { texto: e.message, error: true };
  } finally {
    ocupado.value = false;
  }
}

function otro() {
  resultado.value = null;
  aviso.value = { texto: '', error: false };
  busqueda.value = '';
  encontrados.value = null;
  setTimeout(() => escaner.value?.abrir(), 50);
}
const TONO = { habilitado: 'ok', no_habilitado: 'no', desconocido: 'no' };
</script>

<template>
  <div class="op app">
    <PanelLateral activo="recepcion" />
    <main id="contenido" class="canvas" tabindex="-1">
      <div class="titulo">
        <div>
          <h1>Recepción</h1>
          <p v-if="planta" class="hallazgo">
            <strong>{{ dentro === null ? '—' : plural(dentro, 'persona adentro', 'personas adentro') }}</strong> en {{ planta.nombre }}.
            <RouterLink :to="{ path: '/en-planta', query: { planta: planta.id } }">Ver quiénes</RouterLink>
          </p>
        </div>
        <div v-if="plantas.length > 1" class="selector">
          <label for="planta-recepcion">Planta</label>
          <select id="planta-recepcion" v-model="plantaId" class="control">
            <option v-for="p in plantas" :key="p.id" :value="p.id">{{ p.nombre }} · {{ p.pack }}</option>
          </select>
        </div>
      </div>

      <section v-if="estado === 'sin-plantas'" class="panel bloque vacio">
        <h2>No tenés plantas asignadas</h2>
        <p>Pedile a un administrador que te asigne la planta donde recibís.</p>
      </section>
      <section v-else-if="estado === 'error'" class="panel bloque">
        <p>No pudimos cargar tus plantas.</p>
        <button class="btn" type="button" @click="$router.go(0)">Reintentar</button>
      </section>

      <template v-else-if="estado === 'listo'">
        <p v-if="aviso.texto" class="aviso-accion" :class="{ error: aviso.error }" role="status"><span class="tri-mark" aria-hidden="true" />{{ aviso.texto }}</p>
        <div class="trabajo" :class="{ 'con-resultado': resultado }">
          <div class="col-buscar">
            <Escaner ref="escaner" @leido="alLeer" />
            <section class="panel buscar" aria-labelledby="titulo-buscar">
              <h2 id="titulo-buscar">Si el QR no se puede leer</h2>
              <form class="fila-buscar" @submit.prevent="buscar">
                <label class="sr-only" for="buscar-pase">N°, DNI o patente</label>
                <input id="buscar-pase" v-model="busqueda" class="control" autocomplete="off" placeholder="N°, DNI o patente" :aria-invalid="Boolean(errorBusqueda)">
                <button class="btn" type="submit">Buscar</button>
              </form>
              <p v-if="errorBusqueda" class="error-campo">{{ errorBusqueda }}</p>
              <p v-else-if="encontrados && !encontrados.length" class="muted">No hay pases con «{{ busqueda }}» de esta semana.</p>
              <ul v-if="encontrados?.length" class="encontrados">
                <li v-for="e in encontrados" :key="e.numero">
                  <button type="button" @click="abrirPase(e.numero)">
                    <span><b>{{ e.empresa }}</b><span class="muted num">{{ e.numero }} · {{ e.planta }}</span></span>
                    <span class="pill" :class="TONO[e.resultado]">{{ e.resultado === 'habilitado' ? 'Habilitado' : 'No habilitado' }}</span>
                  </button>
                </li>
              </ul>
            </section>
          </div>
          <div class="col-resultado">
            <ResultadoPase v-if="resultado" :r="resultado" :ocupado="ocupado" @movimiento="registrar" @otro="otro" />
            <section v-else class="panel bloque vacio" :aria-busy="consultando">
              <h2>{{ consultando ? 'Validando el pase…' : 'Esperando un pase' }}</h2>
              <p>Al leer el QR aparece si está habilitado, quiénes vienen, el vehículo y las fechas. Desde ahí se registra el ingreso y el egreso de cada persona.</p>
            </section>
          </div>
        </div>
      </template>
      <section v-else class="panel bloque cargando" aria-busy="true"><i /><i class="corto" /></section>
    </main>
  </div>
</template>

<style scoped>
.selector { display: grid; gap: 4px; min-width: 260px; }
.selector label { color: var(--muted); }
.hallazgo a { margin-left: 6px; text-underline-offset: 3px; }
.trabajo { display: grid; grid-template-columns: minmax(320px, 420px) minmax(0, 1fr); gap: var(--gap); align-items: start; }
.col-buscar { display: grid; gap: var(--gap); }
.buscar { display: grid; gap: 10px; padding: 16px; }
.buscar h2 { font-size: var(--fs-section); font-weight: 600; }
.fila-buscar { display: flex; gap: 8px; }
.fila-buscar .btn { height: var(--alto-control); }
.encontrados { display: grid; border-top: 1px solid var(--border); }
.encontrados button { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 2px; text-align: left; border-bottom: 1px solid var(--rule); }
.encontrados button:hover { background: var(--raised); }
.encontrados b { display: block; font-weight: 600; }
.encontrados .num { display: block; }
@media (max-width: 1100px) {
  .trabajo { grid-template-columns: minmax(0, 1fr); }
  /* Con un resultado en pantalla, el resultado va primero. */
  .con-resultado .col-resultado { order: -1; }
}
</style>
