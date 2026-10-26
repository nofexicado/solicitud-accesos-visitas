<script setup>
// Sin egreso (HSE): quienes entraron un día anterior, o hoy pasada la hora de cierre, y no tienen
// egreso. HSE confirma con la planta y lo cierra con un motivo; queda como movimiento aparte.
import { computed, onMounted, ref } from 'vue';
import DialogoConfirmar from '../../components/DialogoConfirmar.vue';
import PanelLateral from './PanelLateral.vue';
import { cargarKpis, tieneRol, usePanelApi } from './panel.js';
import { diaMes, plural } from './formato.js';
import './panel.css';

const { llamar } = usePanelApi();
const lista = ref([]);
const horaCierre = ref('20:00');
const estado = ref('cargando');
const error = ref('');
const marcados = ref([]);
const cerrando = ref(false);
const motivo = ref('');
const errorMotivo = ref('');
const ocupado = ref(false);
const aviso = ref('');

async function cargar() {
  if (!tieneRol('hse')) { estado.value = 'sin-permiso'; return; }
  try {
    const r = await llamar('/control/sin-egreso');
    lista.value = r.personas;
    horaCierre.value = r.hora_cierre;
    marcados.value = marcados.value.filter((id) => r.personas.some((p) => p.movimiento_id === id));
    estado.value = 'listo';
  } catch (e) {
    error.value = e.message;
    estado.value = 'error';
  }
}
onMounted(cargar);

const todos = computed({
  get: () => lista.value.length > 0 && marcados.value.length === lista.value.length,
  set: (v) => { marcados.value = v ? lista.value.map((p) => p.movimiento_id) : []; },
});
const fechaHora = (ts) => `${diaMes(new Date(ts).toLocaleDateString('en-CA'))} ${new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;

async function cerrar() {
  errorMotivo.value = '';
  if (motivo.value.trim().length < 5) { errorMotivo.value = 'Escribí cómo se confirmó la salida'; return; }
  ocupado.value = true;
  try {
    const r = await llamar('/control/sin-egreso/cerrar', { metodo: 'POST', cuerpo: { movimiento_ids: marcados.value, motivo: motivo.value } });
    aviso.value = `${plural(r.cerrados, 'egreso cerrado', 'egresos cerrados')}. Queda en el expediente con tu motivo.`;
    cerrando.value = false;
    motivo.value = '';
    marcados.value = [];
    await cargar();
    cargarKpis(llamar);
  } catch (e) {
    errorMotivo.value = e.campos?.motivo ?? e.message;
  } finally {
    ocupado.value = false;
  }
}
</script>

<template>
  <div class="op app">
    <PanelLateral activo="sin-egreso" />
    <main id="contenido" class="canvas" tabindex="-1">
      <div class="titulo">
        <div>
          <h1>Sin egreso</h1>
          <p class="hallazgo"><strong>{{ estado === 'listo' ? plural(lista.length, 'persona sigue', 'personas siguen') : '—' }} adentro</strong> desde un día anterior o pasadas las {{ horaCierre }} de hoy.</p>
        </div>
        <button v-if="estado === 'listo' && lista.length" class="btn primario" type="button" :disabled="!marcados.length" @click="cerrando = true">
          Cerrar egreso{{ marcados.length ? ` (${marcados.length})` : '' }}
        </button>
      </div>
      <p v-if="aviso" class="aviso-accion" role="status"><span class="tri-mark" aria-hidden="true" />{{ aviso }}<button type="button" class="cerrar" @click="aviso = ''">Listo</button></p>

      <section v-if="estado === 'sin-permiso'" class="panel bloque vacio"><h2>Esta lista es de HSE</h2><p>La cierra HSE después de confirmar con cada planta.</p></section>
      <section v-else-if="estado === 'error'" class="panel bloque"><p>{{ error }}</p><button class="btn" type="button" @click="cargar">Reintentar</button></section>
      <section v-else-if="estado === 'cargando'" class="panel bloque cargando" aria-busy="true"><i /><i class="corto" /></section>
      <section v-else-if="!lista.length" class="panel bloque vacio">
        <h2>Nadie sin egreso</h2>
        <p>La lista se arma con quienes entraron un día anterior y no salieron, y con los de hoy a partir de las {{ horaCierre }}. A esa hora HSE recibe un aviso si hay alguien.</p>
      </section>
      <section v-else class="panel lista-sin-egreso">
        <table>
          <thead>
            <tr>
              <th class="marca"><input v-model="todos" type="checkbox" aria-label="Marcar todas"></th>
              <th>Persona</th><th>Documento</th><th>Empresa</th><th>Planta</th><th>Ingresó</th><th>Pase vence</th><th>N°</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in lista" :key="p.movimiento_id">
              <td class="marca"><input v-model="marcados" type="checkbox" :value="p.movimiento_id" :aria-label="`Marcar a ${p.nombre_apellido}`"></td>
              <td><b>{{ p.nombre_apellido }}</b></td>
              <td class="num">{{ p.tipo_doc === 'dni' ? 'DNI' : 'Pas.' }} {{ p.nro_doc ?? '—' }}</td>
              <td>{{ p.empresa }}</td>
              <td>{{ p.planta }}</td>
              <td class="num">{{ fechaHora(p.desde) }}</td>
              <td class="num">{{ diaMes(p.fecha_hasta) }}</td>
              <td class="num"><RouterLink :to="`/operador/${p.numero}`">{{ p.numero.slice(-6) }}</RouterLink></td>
            </tr>
          </tbody>
        </table>
      </section>

      <DialogoConfirmar :abierto="cerrando" :titulo="`Cerrar ${plural(marcados.length, 'egreso', 'egresos')}`"
                        texto="Queda registrado el egreso con la hora de ahora, tu usuario y el motivo. Usalo solo cuando confirmaste que la persona ya no está en la planta."
                        accion="Cerrar egreso" :ocupado="ocupado" @confirmar="cerrar" @cerrar="cerrando = false; errorMotivo = ''">
        <div class="campo-dialogo">
          <label for="motivo-cierre">Cómo se confirmó la salida</label>
          <textarea id="motivo-cierre" v-model="motivo" class="control" maxlength="500" placeholder="Por ejemplo: confirmado por radio con la planta, salió a las 19:10."
                    :aria-invalid="Boolean(errorMotivo)" :aria-describedby="errorMotivo ? 'motivo-cierre-error' : undefined" />
          <span v-if="errorMotivo" id="motivo-cierre-error" class="error-campo">{{ errorMotivo }}</span>
        </div>
      </DialogoConfirmar>
    </main>
  </div>
</template>

<style scoped>
.lista-sin-egreso { padding: 8px 20px; overflow-x: auto; }
.marca { width: 32px; }
.marca input { width: 18px; height: 18px; accent-color: var(--ink); }
td b { font-weight: 600; }
.campo-dialogo { display: grid; gap: 6px; margin-top: 4px; }
.campo-dialogo label { font-weight: 600; }
</style>
