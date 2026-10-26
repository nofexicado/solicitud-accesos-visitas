<script setup>
// Expediente de una solicitud. Los botones salen de `permisos`, que calcula el servidor con las
// mismas reglas con las que después valida cada acción.
import { computed, ref, watch } from 'vue';
import { CATEGORIAS, ESTADOS_APROBADOS, formatearCuit, formatearPatente } from '@accesos/shared';
import StatusBadge from '../../components/StatusBadge.vue';
import DialogoConfirmar from '../../components/DialogoConfirmar.vue';
import { ACCIONES, DOCUMENTOS, diaMes, fechaHora, plural, rango, resultadoDoc, tamano } from './formato.js';

const props = defineProps({
  exp: { type: Object, required: true },
  llamar: { type: Function, required: true },
});
const emit = defineEmits(['cambio']);

const p = computed(() => props.exp.permisos);
const ocupado = ref('');
const error = ref('');

async function hacer(clave, ruta, cuerpo, mensaje) {
  ocupado.value = clave;
  error.value = '';
  try {
    await props.llamar(ruta, { metodo: 'POST', cuerpo });
    emit('cambio', mensaje);
    return true;
  } catch (e) {
    error.value = e.message;
    return e;
  } finally {
    ocupado.value = '';
  }
}
const base = computed(() => `/operador/solicitudes/${props.exp.numero}`);
const tomar = () => hacer('tomar', `${base.value}/tomar`, undefined,
  `Tomaste la ${props.exp.numero}. ${props.exp.documentos.length ? 'Revisá los documentos.' : 'No tiene documentos: revisá los datos y validala.'}`);
const validar = () => hacer('validar', `${base.value}/validar-hse`, undefined, `${props.exp.numero} validada: pasó al autorizante.`);
const tomarAutorizacion = () => hacer('tomar-aut', `${base.value}/tomar-autorizacion`, undefined, `Tomaste la ${props.exp.numero}: los demás autorizantes ven que la tenés vos.`);
const aprobar = () => hacer('aprobar', `${base.value}/aprobar`, undefined, `${props.exp.numero} aprobada: el solicitante recibe el pase con QR.`);

// Rechazo: motivo obligatorio, que le llega al solicitante por mail.
const rechazando = ref(false);
const motivo = ref('');
const errorMotivo = ref('');
async function rechazar() {
  errorMotivo.value = '';
  if (motivo.value.trim().length < 10) { errorMotivo.value = 'Contá el motivo con un poco más de detalle (10 caracteres o más)'; return; }
  const r = await hacer('rechazar', `${base.value}/rechazar`, { motivo: motivo.value }, `${props.exp.numero} rechazada. Le avisamos al solicitante con el motivo.`);
  if (r === true) { rechazando.value = false; motivo.value = ''; } else if (r?.campos?.motivo) { errorMotivo.value = r.campos.motivo; error.value = ''; }
}

// Revisión de documentos.
const observando = ref(null);
const observacion = ref('');
const errorObs = ref('');
async function revisar(doc, estado, texto) {
  ocupado.value = `doc-${doc.id}`;
  error.value = '';
  try {
    await props.llamar(`/operador/documentos/${doc.id}`, { metodo: 'PATCH', cuerpo: estado === 'observado' ? { estado, observacion: texto } : { estado } });
    emit('cambio', `${DOCUMENTOS[doc.tipo]} ${resultadoDoc(doc.tipo, estado)}.`);
    return true;
  } catch (e) {
    error.value = e.message;
    return e;
  } finally {
    ocupado.value = '';
  }
}
async function observar() {
  errorObs.value = '';
  if (observacion.value.trim().length < 5) { errorObs.value = 'Escribí qué hay que corregir'; return; }
  const r = await revisar(observando.value, 'observado', observacion.value);
  if (r === true) { observando.value = null; observacion.value = ''; } else if (r?.campos?.observacion) { errorObs.value = r.campos.observacion; error.value = ''; }
}

// Asignación de autorizante.
const elegido = ref('');
watch(() => props.exp.numero, () => { elegido.value = ''; error.value = ''; rechazando.value = false; observando.value = null; }, { immediate: true });
const asignar = () => hacer('asignar', `${base.value}/asignar-autorizante`, { usuario_id: Number(elegido.value) },
  `Asignada a ${props.exp.autorizantes.find((a) => a.id === Number(elegido.value))?.nombre}.`);

watch(motivo, () => { errorMotivo.value = ''; });
watch(observacion, () => { errorObs.value = ''; });

// Vencimientos de seguro o VTV antes del último día de la visita, con la patente y la fecha.
const alertas = computed(() => props.exp.vehiculos.flatMap((v) => {
  const patente = v.patente ? formatearPatente(v.patente) : 'un vehículo';
  return [[v.vto_seguro, 'El seguro'], [v.vto_vtv, 'La VTV']]
    .filter(([vto]) => vto < props.exp.fecha_hasta)
    .map(([vto, que]) => `${que} de ${patente} vence el ${diaMes(vto)}, antes del último día de la visita (${diaMes(props.exp.fecha_hasta)}).`);
}));

const docsAceptados = computed(() => props.exp.documentos.filter((d) => d.estado_revision === 'aceptado').length);
const destino = computed(() => [props.exp.planta ?? `Otra locación: ${props.exp.otra_locacion}`, props.exp.pack].join(' · '));
const horario = computed(() => (props.exp.hora_desde ? ` · ${props.exp.hora_desde} a ${props.exp.hora_hasta ?? '—'}` : ''));
const evento = (accion) => [...props.exp.eventos].reverse().find((e) => e.accion === accion);

// Circuito: Enviada → Validación HSE → Autorización → Pase.
const circuito = computed(() => {
  const e = props.exp;
  const orden = { enviada: 1, validacion_hse: 1, pendiente_autorizacion: 2, aprobada: 3, ingreso: 3, egreso: 3 };
  const actual = orden[e.estado] ?? null;
  const tomada = evento('tomar_hse');
  const validada = evento('validar_hse');
  const aprobada = evento('aprobar');
  const hse = e.estado === 'enviada' ? 'Sin tomar'
    : e.estado === 'validacion_hse' ? `La tiene ${tomada?.usuario ?? 'HSE'} · ${e.documentos.length ? `${docsAceptados.value} de ${e.documentos.length} documentos aceptados` : 'sin documentos que revisar'}`
      : validada ? `${validada.usuario} · ${fechaHora(validada.created_at)}` : '—';
  const aut = aprobada ? `${aprobada.usuario} · ${fechaHora(aprobada.created_at)}`
    : e.autorizante ? (e.estado === 'pendiente_autorizacion' ? `La tiene ${e.autorizante}` : e.autorizante)
      : e.planta_sin_autorizantes ? 'Sin autorizante en la planta'
        : e.planta_id ? 'Le llega a los autorizantes de la planta' : 'Sin autorizante asignado';
  return [
    { t: 'Enviada', d: fechaHora(e.created_at), c: 'hecho' },
    { t: 'Validación HSE', d: hse, c: actual === 1 ? 'actual' : actual > 1 ? 'hecho' : '' },
    { t: 'Autorización', d: aut, c: actual === 2 ? 'actual' : actual > 2 ? 'hecho' : '' },
    { t: 'Pase', d: ESTADOS_APROBADOS.includes(e.estado) ? `Habilitado del ${rango(e.fecha_desde, e.fecha_hasta)}` : 'Se habilita al aprobar', c: ESTADOS_APROBADOS.includes(e.estado) ? 'habilitado' : '' },
  ];
});

const textoEvento = (e) => {
  if (['registrar_ingreso', 'registrar_egreso', 'cerrar_egreso'].includes(e.accion)) return textoMovimiento(e);
  if (e.accion === 'reemplazar_documento') return `${DOCUMENTOS[e.detalle?.documento] ?? 'Documento'} ${resultadoDoc(e.detalle?.documento, 'reemplazado')} por el solicitante`;
  if (e.accion === 'revisar_documento') return `${DOCUMENTOS[e.detalle?.documento] ?? 'Documento'} ${resultadoDoc(e.detalle?.documento, e.detalle?.resultado)}`;
  return ACCIONES[e.accion] ?? e.accion;
};
// Ingresos y egresos: el historial guarda los ids de los movimientos; los nombres salen de acá.
const porMovimiento = computed(() => new Map((props.exp.movimientos ?? []).map((m) => [Number(m.id), m])));
const quienes = (e) => (e.detalle?.movimientos ?? []).map((id) => porMovimiento.value.get(Number(id))?.nombre_apellido).filter(Boolean);
const textoMovimiento = (e) => {
  const n = quienes(e);
  return n.length ? `${ACCIONES[e.accion]}: ${n.join(', ')}` : ACCIONES[e.accion];
};
const adentro = computed(() => props.exp.personas.filter((x) => x.dentro).length);
const actor = (e) => (e.actor === 'invitado' ? 'Solicitante' : e.actor === 'sistema' ? 'Sistema' : e.usuario ?? e.actor);
const horaMov = (m) => fechaHora(m.created_at);
</script>

<template>
  <section class="panel expediente" :aria-label="`Expediente ${exp.numero}`">
    <div class="exp-cuerpo">
      <div class="exp-cabeza">
        <div>
          <h2>{{ exp.empresa }}</h2>
          <p class="sub"><span class="num">{{ exp.numero }}</span> · {{ CATEGORIAS[exp.categoria] }} · {{ plural(exp.personas.length, 'persona', 'personas') }}, {{ plural(exp.vehiculos.length, 'vehículo', 'vehículos') }}</p>
        </div>
        <div class="acciones">
          <StatusBadge :estado="exp.estado" />
          <span v-if="p.validar && p.bloqueos.validar" id="falta-validar" class="falta">{{ p.bloqueos.validar }}</span>
          <span v-if="p.aprobar && p.bloqueos.aprobar" id="falta-aprobar" class="falta">{{ p.bloqueos.aprobar }}</span>
          <button v-if="p.rechazar" class="btn" type="button" :disabled="Boolean(ocupado)" @click="rechazando = true">Rechazar</button>
          <button v-if="p.tomar_autorizacion" class="btn" type="button" :disabled="Boolean(ocupado)" @click="tomarAutorizacion">{{ ocupado === 'tomar-aut' ? 'Tomando…' : 'Tomarla' }}</button>
          <button v-if="p.tomar" class="btn primario" type="button" :disabled="Boolean(ocupado)" @click="tomar">{{ ocupado === 'tomar' ? 'Tomando…' : 'Tomar la solicitud' }}</button>
          <button v-if="p.validar" class="btn primario" type="button" :disabled="Boolean(ocupado) || Boolean(p.bloqueos.validar)"
                  :aria-describedby="p.bloqueos.validar ? 'falta-validar' : undefined" @click="validar">{{ ocupado === 'validar' ? 'Validando…' : 'Validar HSE' }}</button>
          <button v-if="p.aprobar" class="btn primario" type="button" :disabled="Boolean(ocupado) || Boolean(p.bloqueos.aprobar)"
                  :aria-describedby="p.bloqueos.aprobar ? 'falta-aprobar' : undefined" @click="aprobar">{{ ocupado === 'aprobar' ? 'Aprobando…' : 'Aprobar' }}</button>
        </div>
      </div>
      <p v-if="error" class="aviso error" role="alert"><span class="tri-mark" aria-hidden="true" />{{ error }}</p>

      <ol class="circuito" aria-label="Circuito de la solicitud">
        <li v-for="paso in circuito" :key="paso.t" class="paso" :class="paso.c"><i class="tri" /><b>{{ paso.t }}</b><span>{{ paso.d }}</span></li>
      </ol>

      <p v-if="exp.estado === 'pendiente_autorizacion' && exp.planta_sin_autorizantes" class="aviso error"><span class="tri-mark" aria-hidden="true" />{{ exp.planta }} no tiene autorizantes cargados. Asignale uno abajo o pedile a un administrador que cargue un autorizante para la planta.</p>
      <p v-if="exp.estado === 'rechazada'" class="aviso error"><span class="tri-mark" aria-hidden="true" />Rechazada: {{ exp.motivo_rechazo }}</p>
      <p v-for="(a, i) in alertas" :key="i" class="aviso"><span class="tri-mark" aria-hidden="true" />{{ a }}</p>

      <div class="seccion-exp">
        <h3>Documentos <small v-if="exp.documentos.length">{{ docsAceptados }} de {{ exp.documentos.length }} aceptados</small></h3>
        <p v-if="!exp.documentos.length" class="vacio">No presentó documentos: la categoría {{ CATEGORIAS[exp.categoria] }} no los pide.</p>
        <div v-for="d in exp.documentos" :key="d.id" class="doc">
          <div class="doc-nombre">
            <a v-if="d.disponible" :href="`/api/operador/documentos/${d.id}/archivo`">{{ DOCUMENTOS[d.tipo] }}</a>
            <span v-else>{{ DOCUMENTOS[d.tipo] }}</span>
            <small>{{ d.disponible ? `${d.nombre_original} · ${tamano(d.tamano)}` : 'Archivo borrado por retención' }}</small>
            <small v-if="d.estado_revision === 'observado'" class="observacion">Observado: {{ d.observacion }}</small>
            <small v-else-if="d.estado_revision === 'pendiente' && d.observacion" class="reemplazo">Reemplazado por el solicitante el {{ fechaHora(d.subido_at) }}. Se había observado: {{ d.observacion }}</small>
          </div>
          <template v-if="p.revisar_documentos">
            <span v-if="d.estado_revision === 'aceptado'" class="pill ok">Aceptado</span>
            <button v-else-if="d.estado_revision === 'pendiente'" class="btn" type="button" :disabled="Boolean(ocupado)" @click="observando = d; observacion = ''">Observar</button>
            <span v-else class="pill no">Observado</span>
            <button v-if="d.estado_revision !== 'aceptado'" class="btn gris" type="button" :disabled="Boolean(ocupado)" @click="revisar(d, 'aceptado')">{{ ocupado === `doc-${d.id}` ? 'Aceptando…' : 'Aceptar' }}</button>
            <span v-else />
          </template>
          <template v-else>
            <span class="pill" :class="{ ok: d.estado_revision === 'aceptado', no: d.estado_revision === 'observado' }">{{ { pendiente: 'Sin revisar', aceptado: 'Aceptado', observado: 'Observado' }[d.estado_revision] }}</span>
            <span />
          </template>
        </div>
        <p v-if="p.tomar && exp.documentos.length" class="nota">Tomá la solicitud para revisar los documentos.</p>
      </div>

      <div v-if="p.asignar" class="seccion-exp">
        <h3>Autorizante <small>{{ exp.autorizante ?? 'Sin asignar' }}</small></h3>
        <p v-if="!exp.autorizantes.length" class="vacio">Nadie autoriza todavía visitas a esta planta. Pedile a un administrador que cargue un autorizante.</p>
        <form v-else class="asignar" @submit.prevent="elegido && asignar()">
          <label class="sr-only" for="autorizante">Autorizante</label>
          <select id="autorizante" v-model="elegido" class="control">
            <option value="" disabled>{{ exp.autorizante ? 'Cambiar por…' : 'Elegí quién autoriza…' }}</option>
            <option v-for="a in exp.autorizantes" :key="a.id" :value="a.id" :disabled="a.id === exp.autorizante_id">{{ a.nombre }}</option>
          </select>
          <button class="btn" type="submit" :disabled="!elegido || Boolean(ocupado)">{{ ocupado === 'asignar' ? 'Asignando…' : 'Asignar' }}</button>
        </form>
      </div>

      <div class="seccion-exp">
        <h3>Personas <small>{{ adentro ? `${adentro} de ${exp.personas.length} adentro` : exp.personas.length }}</small></h3>
        <div class="tabla">
          <table>
            <thead><tr><th>Nombre</th><th>Documento</th><th>Tarea</th><th>En planta</th></tr></thead>
            <tbody>
              <tr v-for="(x, i) in exp.personas" :key="i">
                <td>{{ x.nombre_apellido }}</td><td class="num">{{ x.tipo_doc === 'dni' ? 'DNI' : 'Pasaporte' }} {{ x.nro_doc ?? '—' }}</td><td>{{ x.cargo }}</td>
                <td><span v-if="x.dentro" class="pill ok">Adentro</span><span v-else class="muted">—</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="seccion-exp">
        <h3>Vehículos <small>{{ exp.vehiculos.length }}</small></h3>
        <p v-if="!exp.vehiculos.length" class="vacio">Entran sin vehículo.</p>
        <div v-else class="tabla">
          <table>
            <thead><tr><th>Patente</th><th>Vehículo</th><th>Seguro hasta</th><th>VTV hasta</th></tr></thead>
            <tbody>
              <tr v-for="(v, i) in exp.vehiculos" :key="i">
                <td class="num">{{ v.patente ? formatearPatente(v.patente) : '—' }}</td><td>{{ v.marca_modelo }}</td>
                <td class="num" :class="{ vence: v.vto_seguro < exp.fecha_hasta }">{{ diaMes(v.vto_seguro) }}/{{ v.vto_seguro.slice(0, 4) }}</td>
                <td class="num" :class="{ vence: v.vto_vtv < exp.fecha_hasta }">{{ diaMes(v.vto_vtv) }}/{{ v.vto_vtv.slice(0, 4) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="exp.movimientos?.length" class="seccion-exp">
        <h3>Ingresos y egresos <small>{{ exp.movimientos.length }} · {{ exp.movimientos[0].planta }}</small></h3>
        <div class="tabla movs">
          <table>
            <thead><tr><th>Fecha y hora</th><th>Persona</th><th>Movimiento</th><th>Vehículo</th><th>Registró</th></tr></thead>
            <tbody>
              <tr v-for="m in exp.movimientos" :key="m.id">
                <td class="num">{{ horaMov(m) }}</td>
                <td>{{ m.nombre_apellido }}</td>
                <td>
                  {{ m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso' }}
                  <small v-if="m.origen === 'cierre_hse'" class="cierre">cerrado por HSE: {{ m.observacion }}</small>
                </td>
                <td class="num">{{ m.patente ? formatearPatente(m.patente) : '—' }}</td>
                <td>{{ m.usuario }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="seccion-exp">
        <h3>Historial</h3>
        <ol class="historial">
          <li v-for="(e, i) in exp.eventos" :key="i"><b>{{ textoEvento(e) }}</b><span>{{ actor(e) }}</span><span class="num">{{ fechaHora(e.created_at) }}</span></li>
        </ol>
      </div>
    </div>

    <aside class="datos" aria-label="Datos de la solicitud">
      <h3>Datos</h3>
      <dl>
        <div><dt>Destino</dt><dd>{{ destino }}</dd></div>
        <div><dt>Fechas</dt><dd class="num">{{ rango(exp.fecha_desde, exp.fecha_hasta) }}{{ horario }}</dd></div>
        <div><dt>Motivo</dt><dd>{{ exp.motivo || '—' }}</dd></div>
        <div><dt>Contacto interno</dt><dd>{{ exp.contacto_interno || '—' }}</dd></div>
        <div><dt>Solicitante</dt><dd>{{ exp.solicitante_nombre || '—' }}</dd></div>
        <div><dt>Email</dt><dd>{{ exp.email || '—' }}</dd></div>
        <div><dt>Teléfono</dt><dd class="num">{{ exp.telefono || '—' }}</dd></div>
        <div><dt>CUIT</dt><dd class="num">{{ formatearCuit(exp.cuit) }}</dd></div>
        <div><dt>Contrato</dt><dd>{{ exp.contrato_ref || '—' }}</dd></div>
        <div><dt>Inducción</dt><dd class="num">{{ exp.induccion_fin ? `${fechaHora(exp.induccion_fin)} · video completo` : 'Sin ver' }}</dd></div>
      </dl>
    </aside>

    <DialogoConfirmar :abierto="rechazando" titulo="Rechazar la solicitud" texto="El motivo le llega por mail al solicitante. Después no se puede reabrir: tendría que enviar una nueva."
                      accion="Rechazar" destructivo :ocupado="ocupado === 'rechazar'" @confirmar="rechazar" @cerrar="rechazando = false; errorMotivo = ''">
      <div class="campo-dialogo">
        <label for="motivo-rechazo">Motivo</label>
        <textarea id="motivo-rechazo" v-model="motivo" class="control" maxlength="1000" :aria-invalid="Boolean(errorMotivo)"
                  :aria-describedby="errorMotivo ? 'motivo-error' : undefined" placeholder="Por ejemplo: la ART no cubre las fechas de la visita." />
        <span v-if="errorMotivo" id="motivo-error" class="error-campo">{{ errorMotivo }}</span>
      </div>
    </DialogoConfirmar>

    <DialogoConfirmar :abierto="Boolean(observando)" :titulo="`Observar: ${observando ? DOCUMENTOS[observando.tipo] : ''}`"
                      texto="Queda en el expediente y traba la validación hasta que lo aceptes." accion="Observar"
                      :ocupado="Boolean(observando) && ocupado === `doc-${observando.id}`" @confirmar="observar" @cerrar="observando = null; errorObs = ''">
      <div class="campo-dialogo">
        <label for="observacion">Qué hay que corregir</label>
        <textarea id="observacion" v-model="observacion" class="control" maxlength="500" :aria-invalid="Boolean(errorObs)"
                  :aria-describedby="errorObs ? 'obs-error' : undefined" placeholder="Por ejemplo: la ART venció el 20/10." />
        <span v-if="errorObs" id="obs-error" class="error-campo">{{ errorObs }}</span>
      </div>
    </DialogoConfirmar>
  </section>
</template>

<style scoped>
.expediente { display: grid; grid-template-columns: minmax(0, 1fr) 280px; }
.exp-cuerpo { padding: 20px 24px 24px; min-width: 0; }
.exp-cabeza { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px 16px; }
.exp-cabeza h2 { font-size: var(--fs-exp); line-height: 26px; font-weight: 650; font-stretch: var(--ancho-titulo); }
.sub { margin-top: 2px; color: var(--muted); }
.sub .num { color: var(--ink); }
.acciones { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.falta { color: var(--muted); max-width: 34ch; text-align: right; }
.exp-cuerpo > .aviso { margin-top: 16px; }

.circuito { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 20px 0 4px; }
.paso { position: relative; padding-top: 22px; padding-right: 12px; }
.paso::before { content: ""; position: absolute; left: 18px; right: 0; top: 7px; height: 2px; background: var(--border); }
.paso.hecho::before { background: var(--ink); }
.paso:last-child::before { display: none; }
.paso .tri { position: absolute; left: 0; top: 0; width: 18px; height: 16px; background: var(--border); clip-path: polygon(0 0, 100% 0, 50% 100%); }
.paso.hecho .tri { background: var(--ink); }
.paso.actual .tri { background: var(--pill-hse-ink); }
.paso.habilitado .tri { background: var(--verde); }
.paso b { display: block; font-weight: 600; }
.paso span { display: block; color: var(--muted); }

.seccion-exp { margin-top: 24px; }
.seccion-exp h3 { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: var(--fs-section); line-height: 22px; font-weight: 600; margin-bottom: 8px; }
.seccion-exp h3 small { font-size: var(--fs-body); font-weight: 400; color: var(--muted); }
.vacio { padding: 10px 12px; border: 1px dashed var(--control); border-radius: 8px; color: var(--muted); }
.nota { margin-top: 6px; color: var(--muted); }
.doc { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 12px; min-height: 52px; padding: 8px 0; }
.doc + .doc { border-top: 1px solid var(--rule); }
.doc a { font-weight: 500; text-underline-offset: 3px; }
.doc-nombre small { display: block; color: var(--muted); }
.doc-nombre .observacion { color: var(--pill-no-ink); }
.doc-nombre .reemplazo { color: var(--pill-hse-ink); }
.asignar { display: flex; gap: 8px; max-width: 460px; }
.tabla { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th { height: 32px; padding: 0 12px 0 0; text-align: left; font-weight: 400; color: var(--muted); border-bottom: 1px solid var(--border); white-space: nowrap; }
td { padding: 13px 12px 13px 0; border-bottom: 1px solid var(--rule); vertical-align: baseline; }
tbody tr:last-child td { border-bottom: 0; }
td.vence { color: var(--pill-hse-ink); font-weight: 500; }
.movs td { white-space: nowrap; }
.movs td:nth-child(2), .movs td:nth-child(3) { white-space: normal; }
.cierre { display: block; color: var(--pill-hse-ink); }
.historial { display: grid; }
.historial li { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr) auto; gap: 12px; padding: 8px 0; }
.historial li + li { border-top: 1px solid var(--rule); }
.historial b { font-weight: 500; }
.historial span { color: var(--muted); }

.datos { padding: 20px; border-left: 1px solid var(--border); }
.datos h3 { font-size: var(--fs-section); font-weight: 600; margin-bottom: 8px; }
.datos dl { display: grid; }
.datos div { display: grid; gap: 1px; padding: 7px 0; align-content: start; }
.datos div + div { border-top: 1px solid var(--rule); }
.datos dt { color: var(--muted); }
.datos dd { overflow-wrap: anywhere; }

.campo-dialogo { display: grid; gap: 6px; margin-top: 4px; }
.campo-dialogo label { font-weight: 600; }

@media (max-width: 1500px) {
  .expediente { grid-template-columns: minmax(0, 1fr); }
  .datos { border-left: 0; border-top: 1px solid var(--border); }
  .datos dl { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 24px; }
  .datos div + div { border-top: 0; }
  .datos div { border-bottom: 1px solid var(--rule); }
}
@media (max-width: 900px) {
  .exp-cuerpo { padding: 16px; }
  .acciones { justify-content: flex-start; width: 100%; }
  .acciones .btn { flex: 1 1 auto; }
  .falta { text-align: left; max-width: none; width: 100%; order: 10; }
  .circuito { grid-template-columns: 1fr; gap: 12px; }
  .paso { padding: 0 0 0 28px; }
  .paso::before { display: none; }
  .doc { grid-template-columns: minmax(0, 1fr) auto; }
  .doc > :nth-child(3) { grid-column: 2; }
  .historial li { grid-template-columns: minmax(0, 1fr) auto; }
  .historial li span:not(.num) { grid-column: 1; grid-row: 2; }
  .datos { padding: 16px; }
  .datos dl { grid-template-columns: 1fr; }
}
</style>
