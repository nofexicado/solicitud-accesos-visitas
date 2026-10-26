<script setup>
// Lista de solicitudes de la vista elegida. Filas de dos líneas: empresa y cuándo llegó; N°, planta,
// cuándo empieza y el estado (o quién la tiene).
import { computed } from 'vue';
import { cuandoEmpieza, hace, plural } from './formato.js';

const props = defineProps({
  filas: { type: Array, default: () => [] },
  estado: { type: String, default: 'cargando' }, // cargando | listo | error
  seleccionada: { type: String, default: '' },
  orden: { type: String, default: 'llegada' },
  busqueda: { type: String, default: '' },
  conOrden: { type: Boolean, default: true },
  vacio: { type: String, default: 'No hay solicitudes en esta vista.' },
  usuarioId: { type: Number, default: null },
});
const emit = defineEmits(['update:orden', 'update:busqueda', 'elegir', 'reintentar']);

// Etiquetas cortas para que la fila no corte el nombre de la empresa.
const CORTA = { enviada: 'Enviada', validacion_hse: 'En HSE', pendiente_autorizacion: 'Por autorizar', aprobada: 'Aprobada', ingreso: 'Ingresó', egreso: 'Egresó', rechazada: 'Rechazada', vencida: 'Vencida' };
const TONO = { enviada: '', validacion_hse: 'hse', pendiente_autorizacion: 'hse', aprobada: 'ok', ingreso: 'ok', egreso: '', rechazada: 'no', vencida: 'no' };
const marca = (s) => {
  if (s.estado === 'validacion_hse' && s.tomada_por) return s.tomada_por_id === props.usuarioId ? 'Tuya' : s.tomada_por;
  if (s.estado === 'pendiente_autorizacion') {
    if (s.planta_sin_autorizantes) return 'Sin autorizante en la planta';
    if (s.autorizante_id) return s.autorizante_id === props.usuarioId ? 'Tuya' : s.autorizante;
    return s.planta ? 'Sin tomar' : 'Sin autorizante';
  }
  return CORTA[s.estado] ?? s.estado;
};
const destino = (s) => (s.planta ? s.planta.replace(/^Planta /, '') : `Otra: ${s.otra_locacion}`);
const cuenta = computed(() => plural(props.filas.length, 'solicitud', 'solicitudes'));
</script>

<template>
  <section class="panel lista" aria-label="Solicitudes">
    <header>
      <div v-if="conOrden" class="pestanas" role="tablist" aria-label="Orden">
        <button v-for="[k, t] in [['llegada', 'Por fecha de llegada'], ['antiguedad', 'Por antigüedad']]" :key="k" role="tab" type="button"
                :aria-selected="orden === k" @click="emit('update:orden', k)">{{ t }}</button>
      </div>
      <div class="buscar">
        <input :value="busqueda" type="search" class="control" placeholder="N°, empresa, DNI o patente" aria-label="Buscar solicitudes"
               @input="emit('update:busqueda', $event.target.value)">
        <span class="cuenta num" aria-live="polite">{{ estado === 'listo' ? cuenta : '' }}</span>
      </div>
    </header>

    <div v-if="estado === 'error'" class="estado-bloque">
      <p>No pudimos cargar la lista.</p>
      <button class="btn" type="button" @click="emit('reintentar')">Reintentar</button>
    </div>
    <div v-else-if="estado === 'cargando' && !filas.length" class="filas" aria-busy="true">
      <div v-for="i in 4" :key="i" class="fila esqueleto" aria-hidden="true"><i /><i class="corto" /><i class="largo" /></div>
    </div>
    <p v-else-if="!filas.length" class="estado-bloque vacio">{{ busqueda ? `Nada coincide con «${busqueda}» en esta vista.` : vacio }}</p>
    <div v-else class="filas" :aria-busy="estado === 'cargando'">
      <RouterLink v-for="s in filas" :key="s.numero" class="fila" :to="{ path: `/operador/${s.numero}`, query: $route.query }"
                  :aria-current="s.numero === seleccionada ? 'true' : undefined" @click="emit('elegir', s.numero)">
        <span class="quien">{{ s.empresa }}</span>
        <span class="cuando">{{ hace(s.created_at) }}</span>
        <span class="que"><span class="num">{{ s.numero.slice(-6) }}</span> · {{ destino(s) }} · {{ cuandoEmpieza(s.fecha_desde) }}</span>
        <span class="marca-fila" :class="{ propia: s.estado === 'pendiente_autorizacion' && s.planta_sin_autorizantes }">
          <span class="pill" :class="s.estado === 'pendiente_autorizacion' && s.planta_sin_autorizantes ? 'no' : TONO[s.estado]">
            <span v-if="TONO[s.estado] === 'hse' && !(s.estado === 'pendiente_autorizacion' && s.planta_sin_autorizantes)" class="punto late" aria-hidden="true" />{{ marca(s) }}
          </span>
        </span>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.lista { position: sticky; top: var(--pad); max-height: calc(100svh - var(--pad) * 2); display: flex; flex-direction: column; }
header { padding: 12px 16px 0; }
.pestanas { display: flex; gap: 20px; border-bottom: 1px solid var(--border); }
.pestanas button { position: relative; padding: 8px 0 10px; color: var(--muted); }
.pestanas button[aria-selected="true"] { color: var(--ink); font-weight: 500; }
.pestanas button[aria-selected="true"]::after { content: ""; position: absolute; left: -4px; right: -4px; bottom: -1px; height: 2px; background: var(--ink); }
.buscar { display: flex; align-items: center; gap: 8px; margin: 12px 0; }
.cuenta { color: var(--muted); white-space: nowrap; }
.filas { border-top: 1px solid var(--border); overflow-y: auto; }
.fila { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; padding: 12px 16px; text-decoration: none; position: relative; color: var(--ink); }
.fila + .fila { border-top: 1px solid var(--rule); }
a.fila:hover { background: var(--raised); }
.fila[aria-current="true"] { background: var(--active); }
.fila[aria-current="true"]::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 2px; background: var(--ink); }
.quien { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cuando { color: var(--muted); text-align: right; white-space: nowrap; }
.que { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.que .num { color: var(--muted); }
.marca-fila { justify-self: end; }
/* La marca larga va en su propia línea para no cortar empresa y planta. */
.marca-fila.propia { grid-column: 1 / -1; justify-self: start; }
.esqueleto i { display: block; height: 14px; width: 60%; border-radius: 3px; background: var(--raised); }
.esqueleto i.corto { width: 48px; justify-self: end; }
.esqueleto i.largo { width: 80%; grid-column: 1 / -1; }
.estado-bloque { display: grid; gap: 10px; justify-items: start; margin: 0 16px 16px; padding: 14px 16px; border: 1px dashed var(--control); border-radius: 8px; color: var(--muted); }
@media (max-width: 900px) {
  .lista { position: static; max-height: none; }
  .filas { overflow: visible; }
  .fila { padding: 14px 16px; }
}
</style>
