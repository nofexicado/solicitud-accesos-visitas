<script setup>
import { computed } from 'vue';
import { CATEGORIAS, formatearCuit, formatearPatente, requiereDocumentos } from '@accesos/shared';
import { sinDocumentos } from '../../composables/useReglas.js';

const props = defineProps({ borrador: { type: Object, required: true } });
const d = computed(() => props.borrador.datos);
const v = computed(() => props.borrador.vista);
const fecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const archivo = (id) => (id ? v.value.archivos[id]?.nombre ?? 'Archivo subido' : 'No adjuntado');

const bloques = computed(() => [
  { paso: 'solicitante', titulo: 'Solicitante', filas: [
    ['Empresa', d.value.solicitante.razon_social],
    ['CUIT', formatearCuit(d.value.solicitante.cuit)],
    ['Solicitante', d.value.solicitante.solicitante_nombre],
    ['Email', d.value.solicitante.email],
    ['Teléfono', d.value.solicitante.telefono],
  ] },
  { paso: 'destino', titulo: 'Destino y anfitrión', filas: [
    ['Pack', v.value.pack],
    ['Planta', v.value.planta === 'Otra locación' ? `Otra locación: ${d.value.destino.otra_locacion}` : v.value.planta],
    ['Visitás a', d.value.destino.contacto_interno],
    ['Autoriza', d.value.destino.pendiente_asignacion ? 'Sin elegir: lo resuelve la planta o HSE' : v.value.autorizante],
  ] },
  { paso: 'motivo', titulo: 'Motivo y fechas', filas: [
    ['Categoría', CATEGORIAS[d.value.motivo.categoria]],
    ['Contrato', d.value.motivo.contrato_ref || '—'],
    ['Fechas', `${fecha(d.value.motivo.fecha_desde)} al ${fecha(d.value.motivo.fecha_hasta)}`],
    ['Horario', d.value.motivo.hora_desde || d.value.motivo.hora_hasta ? `${d.value.motivo.hora_desde || '—'} a ${d.value.motivo.hora_hasta || '—'}` : 'Sin horario fijo'],
    ['Motivo', d.value.motivo.motivo],
  ] },
  { paso: 'personal', titulo: 'Personal y vehículos', filas: [
    ...d.value.personal.personas.map((p, i) => [`Persona ${i + 1}`, `${p.nombre_apellido} · ${p.tipo_doc === 'dni' ? 'DNI' : 'Pasaporte'} ${p.nro_doc} · ${p.cargo}`]),
    ...(d.value.personal.vehiculos.length
      ? d.value.personal.vehiculos.map((x, i) => [`Vehículo ${i + 1}`, `${formatearPatente(x.patente)} · ${x.marca_modelo} · seguro ${fecha(x.vto_seguro)} · VTV ${fecha(x.vto_vtv)}`])
      : [['Vehículos', 'Ninguno']]),
  ] },
  { paso: 'documentos', titulo: 'Documentación', filas: requiereDocumentos(d.value.motivo.categoria, sinDocumentos.value) || d.value.documentos.doc_art
    ? [['ART', archivo(d.value.documentos.doc_art)], ['Nómina', archivo(d.value.documentos.doc_nomina)]]
    : [['Documentos', `No hacen falta para la categoría ${CATEGORIAS[d.value.motivo.categoria] ?? 'elegida'}`]] },
  { paso: 'seguridad', titulo: 'Seguridad', filas: [
    ['Inducción', d.value.seguridad.induccion_comprobante ? `Vista completa${v.value.induccion_fin ? ` el ${v.value.induccion_fin}` : ''}` : 'Pendiente'],
    ['Requisitos HSE', d.value.seguridad.acepta_hse ? 'Aceptados' : 'Pendiente'],
  ] },
]);
</script>

<template>
  <div class="revision">
    <section v-for="b in bloques" :key="b.paso" class="bloque">
      <header>
        <h3>{{ b.titulo }}</h3>
        <RouterLink class="editar" :to="{ path: `/solicitud/nueva/${b.paso}`, query: { volver: 'revision' } }">Editar<span class="sr-only"> {{ b.titulo }}</span></RouterLink>
      </header>
      <dl>
        <div v-for="[k, val] in b.filas" :key="k"><dt>{{ k }}</dt><dd>{{ val || '—' }}</dd></div>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.revision { display: grid; gap: 10px; }
.bloque { padding: 20px 22px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; }
header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
h3 { font-size: var(--t-texto); font-stretch: 100%; letter-spacing: 0; font-weight: 650; }
.editar { font-weight: 600; text-decoration: underline; text-underline-offset: 4px; padding: 6px 0; }
dl { display: grid; gap: 8px; }
dl div { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 12px; }
dt { color: var(--muted); }
dd { overflow-wrap: anywhere; white-space: pre-line; }
@media (max-width: 640px) { dl div { grid-template-columns: 1fr; gap: 0; } }
</style>
