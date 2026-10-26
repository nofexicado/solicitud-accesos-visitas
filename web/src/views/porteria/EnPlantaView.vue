<script setup>
// Personas en planta ahora: quién entró y no salió, por planta. Es la lista para una evacuación,
// así que se imprime limpia (sin el panel) con la hora en que se sacó.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PanelLateral from '../operador/PanelLateral.vue';
import { cargarKpis, tieneRol, usePanelApi } from '../operador/panel.js';
import { diaMes, plural } from '../operador/formato.js';
import { formatearPatente } from '@accesos/shared';
import '../operador/panel.css';

const route = useRoute();
const router = useRouter();
const { llamar } = usePanelApi();
const personas = ref([]);
const generado = ref(null);
const estado = ref('cargando');
const filtro = ref(route.query.planta ? Number(route.query.planta) : 0);

async function cargar() {
  try {
    const r = await llamar('/control/en-planta');
    personas.value = r.personas;
    generado.value = r.generado;
    estado.value = 'listo';
    cargarKpis(llamar);
  } catch {
    if (!personas.value.length) estado.value = 'error';
  }
}
let reloj;
onMounted(() => { cargar(); reloj = setInterval(cargar, 60_000); });
onUnmounted(() => clearInterval(reloj));
watch(filtro, (p) => router.replace({ query: p ? { planta: p } : {} }));

const plantas = computed(() => {
  const mapa = new Map();
  for (const p of personas.value) {
    const k = p.planta_id ?? 0;
    if (!mapa.has(k)) mapa.set(k, { id: k, nombre: p.planta ?? 'Sin planta', pack: p.pack, personas: [] });
    mapa.get(k).personas.push(p);
  }
  return [...mapa.values()];
});
const visibles = computed(() => (filtro.value ? plantas.value.filter((p) => p.id === filtro.value) : plantas.value));
const total = computed(() => visibles.value.reduce((n, p) => n + p.personas.length, 0));

const hoy = () => new Date().toLocaleDateString('en-CA');
const hora = (ts) => new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const ingreso = (ts) => (new Date(ts).toLocaleDateString('en-CA') === hoy() ? hora(ts) : `${diaMes(new Date(ts).toLocaleDateString('en-CA'))} ${hora(ts)}`);
const sacado = computed(() => (generado.value ? new Date(generado.value).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : ''));
const imprimir = () => window.print();
const conExpediente = computed(() => tieneRol('hse', 'autorizante'));
</script>

<template>
  <div class="op app">
    <PanelLateral activo="en-planta" />
    <main id="contenido" class="canvas" tabindex="-1">
      <div class="titulo">
        <div>
          <h1>Personas en planta ahora</h1>
          <p class="hallazgo"><strong>{{ estado === 'listo' ? plural(total, 'persona', 'personas') : '—' }}</strong> con ingreso y sin egreso<template v-if="sacado"> · actualizado el {{ sacado }}</template></p>
        </div>
        <div class="acciones no-imprimir">
          <select v-if="plantas.length > 1 || filtro" v-model="filtro" class="control" aria-label="Planta">
            <option :value="0">Todas las plantas</option>
            <option v-for="p in plantas" :key="p.id" :value="p.id">{{ p.nombre }}</option>
          </select>
          <button class="btn" type="button" @click="cargar">Actualizar</button>
          <button class="btn primario" type="button" :disabled="estado !== 'listo'" @click="imprimir">Imprimir</button>
        </div>
      </div>

      <!-- Encabezado que solo sale impreso. -->
      <div class="encabezado-impreso" aria-hidden="true">
        <p><b>Personas en planta</b></p>
        <p>Sacada el {{ sacado }} · {{ plural(total, 'persona', 'personas') }}</p>
      </div>

      <section v-if="estado === 'error'" class="panel bloque">
        <p>No pudimos cargar la lista.</p>
        <button class="btn" type="button" @click="cargar">Reintentar</button>
      </section>
      <section v-else-if="estado === 'cargando'" class="panel bloque cargando" aria-busy="true"><i /><i class="corto" /><i /></section>
      <section v-else-if="!visibles.length" class="panel bloque vacio">
        <h2>No hay nadie adentro</h2>
        <p>Cuando recepción registre un ingreso, la persona aparece acá hasta que se registre su egreso.</p>
      </section>

      <section v-for="p in visibles" :key="p.id" class="panel planta" :aria-labelledby="`planta-${p.id}`">
        <header>
          <h2 :id="`planta-${p.id}`">{{ p.nombre }}<span v-if="p.pack" class="muted"> · {{ p.pack }}</span></h2>
          <span class="cuenta num">{{ plural(p.personas.length, 'persona', 'personas') }}</span>
        </header>
        <div class="tabla">
          <table>
            <thead>
              <tr><th>Persona</th><th>Documento</th><th>Empresa</th><th>Tarea</th><th>Ingresó</th><th>Vehículo</th><th>Visita a</th><th>Tel. del solicitante</th><th>N°</th><th class="solo-impreso">Presente</th></tr>
            </thead>
            <tbody>
              <tr v-for="x in p.personas" :key="x.movimiento_id">
                <td><b>{{ x.nombre_apellido }}</b></td>
                <td class="num">{{ x.tipo_doc === 'dni' ? 'DNI' : 'Pas.' }} {{ x.nro_doc ?? '—' }}</td>
                <td>{{ x.empresa }}</td>
                <td>{{ x.cargo }}</td>
                <td class="num">{{ ingreso(x.desde) }}</td>
                <td class="num">{{ x.patente ? formatearPatente(x.patente) : '—' }}</td>
                <td>{{ x.contacto_interno }}</td>
                <td class="num">{{ x.telefono }}</td>
                <td class="num"><RouterLink v-if="conExpediente" :to="`/operador/${x.numero}`" class="no-imprimir-enlace">{{ x.numero.slice(-6) }}</RouterLink><template v-else>{{ x.numero.slice(-6) }}</template></td>
                <td class="solo-impreso"><span class="casilla" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.acciones { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.acciones select { width: auto; min-width: 200px; }
.planta { margin-bottom: var(--gap); padding: 16px 20px 8px; }
.planta header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.planta h2 { font-size: var(--fs-section); font-weight: 600; }
.cuenta { color: var(--muted); }
.tabla { overflow-x: auto; }
td b { font-weight: 600; }
.encabezado-impreso, .solo-impreso { display: none; }
.casilla { display: inline-block; width: 14px; height: 14px; border: 1px solid #15181b; }

@media print {
  .op.app { display: block; background: #fff; color: #000; }
  .canvas { padding: 0; }
  .titulo, .no-imprimir { display: none !important; }
  .encabezado-impreso { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 11pt; }
  .solo-impreso { display: table-cell; }
  .planta { border: 0; padding: 0; margin-bottom: 14px; break-inside: auto; break-after: page; }
  .planta:last-of-type { break-after: auto; }
  .planta h2 { font-size: 13pt; }
  table { font-size: 9.5pt; }
  th, td { padding: 4px 6px 4px 0; border-color: #999; color: #000; }
  .no-imprimir-enlace { color: #000; text-decoration: none; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
}
@page { size: A4 landscape; margin: 12mm; }
</style>
