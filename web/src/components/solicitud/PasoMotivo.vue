<script setup>
import { computed } from 'vue';
import { CATEGORIAS, fechaLocalISO } from '@accesos/shared';
import Campo from './Campo.vue';

const props = defineProps({ modelo: { type: Object, required: true }, errores: { type: Object, default: () => ({}) } });
const hoy = fechaLocalISO();
const pideContrato = computed(() => ['contratista', 'servicio_tecnico', 'proveedor'].includes(props.modelo.categoria));
</script>

<template>
  <div class="motivo">
    <fieldset>
      <legend>Categoría</legend>
      <div class="opciones">
        <label v-for="(nombre, clave) in CATEGORIAS" :key="clave" class="opcion">
          <input v-model="modelo.categoria" type="radio" name="categoria" :value="clave">
          <span class="forma" aria-hidden="true" />{{ nombre }}
        </label>
      </div>
      <p v-if="errores.categoria" class="error" role="alert">{{ errores.categoria }}</p>
    </fieldset>

    <div class="paso-grilla">
      <Campo v-if="pideContrato" v-slot="c" rotulo="Contrato u orden de trabajo" opcional ayuda="Número de contrato, OC u OT de la operadora." :error="errores.contrato_ref">
        <input :id="c.id" v-model="modelo.contrato_ref" class="entrada" maxlength="80" :aria-invalid="c.invalido" :aria-describedby="c.describe">
      </Campo>
      <Campo v-slot="c" class="ancho" rotulo="Motivo y tareas" ayuda="Qué van a hacer y dónde. HSE lo usa para revisar riesgos y permisos." :error="errores.motivo">
        <textarea :id="c.id" v-model="modelo.motivo" class="entrada" maxlength="2000" :aria-invalid="c.invalido" :aria-describedby="c.describe" />
      </Campo>
      <Campo v-slot="c" rotulo="Desde" :error="errores.fecha_desde">
        <input :id="c.id" v-model="modelo.fecha_desde" class="entrada num" type="date" :min="hoy" :aria-invalid="c.invalido" :aria-describedby="c.describe">
      </Campo>
      <Campo v-slot="c" rotulo="Hasta" :error="errores.fecha_hasta">
        <input :id="c.id" v-model="modelo.fecha_hasta" class="entrada num" type="date" :min="modelo.fecha_desde || hoy" :aria-invalid="c.invalido" :aria-describedby="c.describe">
      </Campo>
      <Campo v-slot="c" rotulo="Hora de llegada" opcional :error="errores.hora_desde">
        <input :id="c.id" v-model="modelo.hora_desde" class="entrada num" type="time" :aria-invalid="c.invalido" :aria-describedby="c.describe">
      </Campo>
      <Campo v-slot="c" rotulo="Hora de salida" opcional :error="errores.hora_hasta">
        <input :id="c.id" v-model="modelo.hora_hasta" class="entrada num" type="time" :aria-invalid="c.invalido" :aria-describedby="c.describe">
      </Campo>
    </div>
  </div>
</template>

<style scoped>
.motivo { display: grid; gap: 32px; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
legend { font-weight: 600; margin-bottom: 12px; padding: 0; }
.opciones { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.opcion { position: relative; display: flex; align-items: center; gap: 14px; min-height: 56px; padding: 12px 16px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); cursor: pointer; transition: border-color var(--t-hover) ease; }
.opcion:hover { border-color: var(--muted); }
.opcion input { position: absolute; opacity: 0; inset: 0; cursor: pointer; }
.opcion .forma { flex: none; width: 18px; height: 16px; background: var(--raised); clip-path: polygon(0 0, 100% 0, 50% 100%); }
.opcion:has(input:checked) { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); }
.opcion:has(input:checked) .forma { background: var(--ink); }
.opcion:has(input:focus-visible) { outline: 2px solid var(--ink); outline-offset: 2px; }
.error { margin-top: 8px; color: var(--pill-no-ink); font-size: var(--t-nota); font-weight: 500; }
</style>
