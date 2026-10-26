<script setup>
import { nextTick, ref } from 'vue';
import { alertasVehiculo } from '@accesos/shared';
import Campo from './Campo.vue';

const props = defineProps({
  modelo: { type: Object, required: true },
  errores: { type: Object, default: () => ({}) },
  fechaHasta: { type: String, default: '' },
});
const raiz = ref(null);
const err = (ruta) => props.errores[ruta] ?? '';

async function agregar(lista, vacio, selector) {
  props.modelo[lista].push(vacio);
  await nextTick();
  // El foco va al primer campo de la fila nueva.
  const filas = raiz.value.querySelectorAll(selector);
  filas[filas.length - 1]?.querySelector('input')?.focus();
}
const agregarPersona = () => agregar('personas', { nombre_apellido: '', tipo_doc: 'dni', nro_doc: '', cargo: '' }, '.persona');
const agregarVehiculo = () => agregar('vehiculos', { patente: '', marca_modelo: '', vto_seguro: '', vto_vtv: '' }, '.vehiculo');
</script>

<template>
  <div ref="raiz" class="personal">
    <section>
      <h3>Personas <span class="num">{{ modelo.personas.length }}</span></h3>
      <p v-if="errores.personas" class="error" role="alert">{{ errores.personas }}</p>
      <ol class="filas">
        <li v-for="(p, i) in modelo.personas" :key="i" class="fila persona">
          <Campo v-slot="c" rotulo="Nombre y apellido" :error="err(`personas.${i}.nombre_apellido`)">
            <input :id="c.id" v-model="p.nombre_apellido" class="entrada" autocomplete="off" :aria-invalid="c.invalido" :aria-describedby="c.describe">
          </Campo>
          <Campo v-slot="c" rotulo="Documento" :error="err(`personas.${i}.nro_doc`)">
            <div class="doc">
              <select v-model="p.tipo_doc" class="entrada" aria-label="Tipo de documento">
                <option value="dni">DNI</option>
                <option value="pasaporte">Pasaporte</option>
              </select>
              <input :id="c.id" v-model="p.nro_doc" class="entrada num" :inputmode="p.tipo_doc === 'dni' ? 'numeric' : 'text'" autocomplete="off" :aria-invalid="c.invalido" :aria-describedby="c.describe">
            </div>
          </Campo>
          <Campo v-slot="c" rotulo="Cargo o función" :error="err(`personas.${i}.cargo`)">
            <input :id="c.id" v-model="p.cargo" class="entrada" :aria-invalid="c.invalido" :aria-describedby="c.describe">
          </Campo>
          <button v-if="modelo.personas.length > 1" type="button" class="quitar" @click="modelo.personas.splice(i, 1)">Quitar</button>
        </li>
      </ol>
      <button type="button" class="btn-sec" @click="agregarPersona">Agregar persona</button>
    </section>

    <section>
      <h3>Vehículos <span class="num">{{ modelo.vehiculos.length }}</span></h3>
      <p class="ayuda">Si entran caminando o en un transporte de la operadora, dejá esta parte vacía.</p>
      <ol class="filas">
        <li v-for="(v, i) in modelo.vehiculos" :key="i" class="fila vehiculo">
          <Campo v-slot="c" rotulo="Patente" :error="err(`vehiculos.${i}.patente`)">
            <input :id="c.id" v-model="v.patente" class="entrada num" autocomplete="off" maxlength="9" style="text-transform: uppercase" :aria-invalid="c.invalido" :aria-describedby="c.describe">
          </Campo>
          <Campo v-slot="c" rotulo="Marca y modelo" :error="err(`vehiculos.${i}.marca_modelo`)">
            <input :id="c.id" v-model="v.marca_modelo" class="entrada" :aria-invalid="c.invalido" :aria-describedby="c.describe">
          </Campo>
          <Campo v-slot="c" rotulo="Seguro vigente hasta" :error="err(`vehiculos.${i}.vto_seguro`)">
            <input :id="c.id" v-model="v.vto_seguro" class="entrada num" type="date" :aria-invalid="c.invalido" :aria-describedby="c.describe">
          </Campo>
          <Campo v-slot="c" rotulo="VTV vigente hasta" :error="err(`vehiculos.${i}.vto_vtv`)">
            <input :id="c.id" v-model="v.vto_vtv" class="entrada num" type="date" :aria-invalid="c.invalido" :aria-describedby="c.describe">
          </Campo>
          <p v-for="a in alertasVehiculo(v, fechaHasta)" :key="a" class="aviso alerta"><span class="tri-mark" aria-hidden="true" />{{ a }}. Podés enviarla igual; HSE lo va a revisar.</p>
          <button type="button" class="quitar" @click="modelo.vehiculos.splice(i, 1)">Quitar</button>
        </li>
      </ol>
      <button type="button" class="btn-sec" @click="agregarVehiculo">Agregar vehículo</button>
    </section>
  </div>
</template>

<style scoped>
.personal { display: grid; gap: 40px; }
section { display: grid; gap: 14px; justify-items: start; }
h3 { font-size: var(--t-sub); line-height: 1.15; display: flex; gap: 10px; align-items: baseline; }
h3 .num { color: var(--muted); font-size: var(--t-texto); font-weight: 500; font-stretch: 100%; }
.ayuda { color: var(--muted); font-size: var(--t-nota); }
.filas { display: grid; gap: 10px; width: 100%; }
.fila { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 20px; padding: 20px; background: var(--surface); border-radius: 6px; border: 1px solid var(--border); }
.vehiculo { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.doc { display: grid; grid-template-columns: 132px minmax(0, 1fr); gap: 8px; }
.alerta { grid-column: 1 / -1; }
.quitar { grid-column: 1 / -1; justify-self: start; color: var(--muted); font-size: var(--t-nota); text-decoration: underline; text-underline-offset: 3px; padding: 4px 0; }
.quitar:hover { color: var(--ink); }
.error { color: var(--pill-no-ink); font-size: var(--t-nota); font-weight: 500; }
@media (max-width: 640px) {
  .fila, .vehiculo { grid-template-columns: 1fr; padding: 16px; }
  .doc { grid-template-columns: 112px minmax(0, 1fr); }
}
</style>
