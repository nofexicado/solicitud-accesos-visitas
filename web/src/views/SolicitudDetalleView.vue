<script setup>
// Detalle de una solicitud del equipo: el pase (con QR si está aprobada), el historial y los datos.
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CATEGORIAS, etiquetaEstado, formatearCuit, formatearPatente } from '@accesos/shared';
import StatusBadge from '../components/StatusBadge.vue';
import PassPreview from '../components/solicitud/PassPreview.vue';
import DropZone from '../components/solicitud/DropZone.vue';
import { api } from '../composables/api.js';
import { paseDesdeDetalle } from '../composables/paseDesdeDetalle.js';
import { cargarPase, olvidarPase } from '../composables/paseLocal.js';
import { guardarPase } from '../composables/pasePng.js';

const route = useRoute();
const router = useRouter();
const d = ref(null);
const error = ref('');
const sinConexion = ref(false);
const guardando = ref(false);
async function guardar() {
  guardando.value = true;
  try { await guardarPase(d.value, { estado: estadoPase.value }); } finally { guardando.value = false; }
}

const fecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const fechaHora = (ts) => new Date(ts).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DOCUMENTO = { art: 'Certificado de ART', nomina: 'Nómina del personal', otro: 'Otro documento' };
const CORREGIDO = { art: 'el certificado de ART corregido', nomina: 'la nómina corregida', otro: 'el documento corregido' };
const ESTADO_DOC = { pendiente: 'En revisión de HSE', aceptado: 'Aceptado', observado: 'Observado por HSE' };
const ACCIONES = { reemplazar_documento: 'Reemplazaste un documento', enviar: 'Enviada', tomar_hse: 'HSE la tomó para revisar', validar_hse: 'HSE validó la documentación', rechazar_hse: 'HSE la rechazó', aprobar: 'Autorizada por la planta', rechazar: 'Rechazada por la planta', registrar_ingreso: 'Ingresó', registrar_egreso: 'Egresó', vencer: 'Venció', depurada: 'Datos personales borrados' };

onMounted(async () => {
  try {
    ({ d: d.value, sinConexion: sinConexion.value } = await cargarPase(route.params.numero));
  } catch (e) {
    error.value = e.status === 404 ? 'No encontramos esa solicitud en este equipo. Consultala con el número y tu DNI.' : e.message;
  }
});

const pase = computed(() => (d.value ? paseDesdeDetalle(d.value) : null));
const observados = computed(() => (d.value?.documentos ?? []).filter((x) => x.estado_revision === 'observado'));
const textoEvento = (e) => (e.accion === 'reemplazar_documento' && e.detalle?.documento
  ? `Reemplazaste ${{ art: 'el certificado de ART', nomina: 'la nómina' }[e.detalle.documento] ?? 'un documento'}`
  : ACCIONES[e.accion] ?? e.accion);

// Reemplazo de un documento observado: se sube igual que en el asistente (tipo real y antivirus)
// y después se cambia en la solicitud, que vuelve a revisión de HSE.
const reemplazando = ref('');
const errorReemplazo = ref({});
const aviso = ref('');
async function reemplazar(tipo, subida) {
  reemplazando.value = tipo;
  errorReemplazo.value = {};
  try {
    d.value = await api(`/solicitudes/${encodeURIComponent(d.value.numero)}/documentos/${tipo}/reemplazo`, { metodo: 'POST', cuerpo: { upload_id: subida.id } });
    aviso.value = `Listo: subiste ${CORREGIDO[tipo]}. HSE lo va a revisar de nuevo y te avisamos por mail.`;
  } catch (e) {
    errorReemplazo.value = { [tipo]: e.message };
  } finally {
    reemplazando.value = '';
  }
}
const estadoPase = computed(() => {
  if (!d.value) return '';
  if (d.value.qr_svg) return d.value.vigente ? 'Habilitado para ingresar' : d.value.motivo_pase;
  if (d.value.estado === 'rechazada') return 'Rechazada';
  return etiquetaEstado(d.value.estado);
});

async function quitar() {
  await api(`/mis-solicitudes/${encodeURIComponent(d.value.numero)}`, { metodo: 'DELETE' }).catch(() => {});
  await olvidarPase(d.value.numero);
  router.push('/mis-solicitudes');
}
</script>

<template>
  <div class="wrap pagina">
    <RouterLink class="volver" to="/mis-solicitudes">Mis solicitudes</RouterLink>
    <template v-if="error">
      <h1 class="titulo-error">Solicitud no encontrada</h1>
      <p class="aviso error"><span class="tri-mark" aria-hidden="true" />{{ error }}</p>
      <RouterLink class="btn-sec consultar" to="/mis-solicitudes#consultar">Consultar con el número y el DNI</RouterLink>
    </template>
    <div v-else-if="d" class="grilla">
      <section class="principal">
        <header class="cabeza">
          <h1 class="num">{{ d.numero }}</h1>
          <StatusBadge :estado="d.estado" />
        </header>
        <p v-if="d.estado === 'rechazada' && d.motivo_rechazo" class="aviso error"><span class="tri-mark" aria-hidden="true" />Motivo: {{ d.motivo_rechazo }}</p>
        <p v-if="observados.length" class="aviso"><span class="tri-mark" aria-hidden="true" />HSE observó {{ observados.length === 1 ? 'un documento' : 'documentos' }}. Subí el archivo corregido en Documentos: hasta que lo acepten, la solicitud no avanza.</p>
        <p v-if="aviso" class="aviso ok" role="status"><span class="tri-mark" aria-hidden="true" />{{ aviso }}</p>

        <section class="bloque">
          <h2>Historial</h2>
          <ol class="historial">
            <li v-for="(e, i) in d.eventos" :key="i"><span class="punto" aria-hidden="true" /><b>{{ textoEvento(e) }}</b><span class="num">{{ fechaHora(e.created_at) }}</span></li>
          </ol>
        </section>

        <section class="bloque">
          <h2>Datos</h2>
          <dl>
            <div><dt>Empresa</dt><dd>{{ d.empresa }} ({{ formatearCuit(d.cuit) }})</dd></div>
            <div><dt>Destino</dt><dd>{{ [d.planta ?? (d.otra_locacion && `Otra locación: ${d.otra_locacion}`), d.pack].filter(Boolean).join(' · ') }}</dd></div>
            <div><dt>Fechas</dt><dd class="num">{{ fecha(d.fecha_desde) }} al {{ fecha(d.fecha_hasta) }}<template v-if="d.hora_desde || d.hora_hasta"> · {{ d.hora_desde || '—' }} a {{ d.hora_hasta || '—' }}</template></dd></div>
            <div><dt>Categoría</dt><dd>{{ CATEGORIAS[d.categoria] }}</dd></div>
            <div><dt>Visita a</dt><dd>{{ d.contacto_interno }}</dd></div>
            <div><dt>Autoriza</dt><dd>{{ d.autorizante ?? 'Pendiente de asignación' }}</dd></div>
            <div><dt>Motivo</dt><dd>{{ d.motivo }}</dd></div>
          </dl>
        </section>

        <section class="bloque">
          <h2>Personas y vehículos</h2>
          <ul class="filas">
            <li v-for="p in d.personas" :key="p.nombre_apellido + p.nro_doc"><b>{{ p.nombre_apellido }}</b><span class="num">{{ p.tipo_doc === 'dni' ? 'DNI' : 'Pasaporte' }} {{ p.nro_doc ?? '—' }} · {{ p.cargo }}</span></li>
            <li v-for="v in d.vehiculos" :key="v.patente"><b class="num">{{ v.patente ? formatearPatente(v.patente) : '—' }}</b><span>{{ v.marca_modelo }} · seguro {{ fecha(v.vto_seguro) }} · VTV {{ fecha(v.vto_vtv) }}</span></li>
          </ul>
        </section>

        <section v-if="d.documentos.length" id="documentos" class="bloque">
          <h2>Documentos</h2>
          <ul class="filas docs">
            <li v-for="doc in d.documentos" :key="doc.tipo" :class="{ observado: doc.estado_revision === 'observado' }">
              <div class="doc-linea"><b>{{ DOCUMENTO[doc.tipo] }}</b><span class="estado-doc">{{ ESTADO_DOC[doc.estado_revision] }}</span></div>
              <span>{{ doc.nombre }}</span>
              <template v-if="doc.estado_revision === 'observado'">
                <p class="observacion">{{ doc.observacion }}</p>
                <DropZone :rotulo="`Subí ${CORREGIDO[doc.tipo]}`" ayuda="PDF, JPG o PNG de hasta 10 MB. Se revisa con antivirus antes de aceptarlo."
                          :error="errorReemplazo[doc.tipo] ?? ''" @subido="reemplazar(doc.tipo, $event)" />
                <p v-if="reemplazando === doc.tipo" class="nota" role="status">Guardando el reemplazo…</p>
              </template>
            </li>
          </ul>
        </section>

        <button type="button" class="quitar" @click="quitar">Quitar de este equipo</button>
      </section>

      <aside class="lado" aria-label="Pase de acceso">
        <PassPreview :borrador="pase" :numero="d.numero" :qr="d.qr_svg ?? ''" :habilitado="Boolean(d.vigente)" :estado-texto="estadoPase" />
        <template v-if="d.qr_svg">
          <RouterLink class="btn-corte" :to="`/mis-solicitudes/${d.numero}/pase`">Mostrar el pase</RouterLink>
          <div class="mas-pase">
            <button class="btn-sec" type="button" :disabled="guardando" @click="guardar">{{ guardando ? 'Armando…' : 'Guardar pase' }}</button>
            <a v-if="!sinConexion" class="btn-sec" :href="d.pdf" download>Descargar PDF</a>
          </div>
          <p class="nota-pase">En la ruta puede no haber señal: guardá el pase o abrilo una vez antes de salir y queda en este equipo.</p>
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.pagina { padding-top: 32px; }
.titulo-error { margin-bottom: 16px; }
.consultar { margin-top: 16px; }
.volver { display: inline-block; margin-bottom: 16px; color: var(--muted); text-decoration: underline; text-underline-offset: 3px; font-size: var(--t-nota); }
.grilla { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 48px; align-items: start; }
.principal { display: grid; gap: 20px; }
.cabeza { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
h1 { font-size: var(--t-seccion-chico); line-height: 1.1; }
.bloque { padding: 22px 24px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); }
.bloque h2 { font-size: var(--t-texto); font-stretch: 100%; letter-spacing: 0; font-weight: 650; margin-bottom: 14px; }
.historial { display: grid; gap: 12px; }
.historial li { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; gap: 12px; align-items: baseline; }
.historial .punto { width: 10px; height: 9px; background: var(--ink); clip-path: polygon(0 0, 100% 0, 50% 100%); }
.historial b { font-weight: 500; }
.historial .num { color: var(--muted); font-size: var(--t-nota); }
dl { display: grid; gap: 10px; }
dl div { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 12px; }
dt { color: var(--muted); }
.filas { display: grid; gap: 10px; }
.filas li { display: grid; gap: 2px; }
.filas b { font-weight: 600; }
.filas span { color: var(--muted); font-size: var(--t-nota); }
.docs li { gap: 4px; }
.docs li + li { padding-top: 12px; border-top: 1px solid var(--border); }
.doc-linea { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; }
.estado-doc { font-size: var(--t-nota); color: var(--muted); }
.observado .estado-doc { color: var(--pill-hse-ink); font-weight: 600; }
.observacion { margin: 6px 0 10px; padding: 10px 12px; border-radius: 4px; background: var(--pill-hse-bg); color: var(--pill-hse-ink); }
.nota { color: var(--muted); font-size: var(--t-nota); }
.quitar { justify-self: start; color: var(--muted); font-size: var(--t-nota); text-decoration: underline; text-underline-offset: 3px; }
.quitar:hover { color: var(--ink); }
.lado { position: sticky; top: 24px; display: grid; gap: 12px; }
.lado .btn-corte { justify-self: start; }
.mas-pase { display: flex; flex-wrap: wrap; gap: 10px; }
.nota-pase { color: var(--muted); font-size: var(--t-nota); max-width: 44ch; }
@media (max-width: 960px) {
  .grilla { grid-template-columns: 1fr; gap: 24px; }
  .lado { position: static; order: -1; }
  dl div { grid-template-columns: 1fr; gap: 0; }
}
</style>
