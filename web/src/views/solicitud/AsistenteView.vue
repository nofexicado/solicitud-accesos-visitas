<script setup>
// Asistente de solicitud en 7 pasos. Cada "Siguiente" valida el paso con el mismo esquema zod que
// usa el servidor; el borrador se guarda solo en este navegador.
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { gsap } from 'gsap';
import { PASOS, erroresPorCampo, esquemaDocumentos } from '@accesos/shared';
import { useBorrador } from '../../composables/useBorrador.js';
import { useGsap } from '../../composables/useGsap.js';
import { api } from '../../composables/api.js';
import { cargarReglas, sinDocumentos } from '../../composables/useReglas.js';
import DialogoConfirmar from '../../components/DialogoConfirmar.vue';
import PassPreview from '../../components/solicitud/PassPreview.vue';
import PasoSolicitante from '../../components/solicitud/PasoSolicitante.vue';
import PasoDestino from '../../components/solicitud/PasoDestino.vue';
import PasoMotivo from '../../components/solicitud/PasoMotivo.vue';
import PasoPersonal from '../../components/solicitud/PasoPersonal.vue';
import PasoDocumentos from '../../components/solicitud/PasoDocumentos.vue';
import PasoSeguridad from '../../components/solicitud/PasoSeguridad.vue';
import PasoRevision from '../../components/solicitud/PasoRevision.vue';

const AYUDAS = {
  solicitante: 'Datos de la empresa y de quien hace el pedido.',
  destino: 'A qué pack y planta van, y a quién visitan.',
  motivo: 'Qué van a hacer y en qué fechas.',
  personal: 'Todas las personas que entran y los vehículos.',
  documentos: 'La ART con la nómina del personal que va.',
  seguridad: 'Video de inducción y requisitos de seguridad.',
  revision: 'Revisá todo antes de enviar.',
};

const route = useRoute();
const router = useRouter();
const { borrador, pendiente, retomar, empezarDeCero, descartar } = useBorrador();
const packs = ref([]);
const errores = ref({});
const errorGeneral = ref('');
const enviando = ref(false);
const confirmarDescarte = ref(false);

// Descartar borra el borrador de este equipo y los archivos subidos (que igual vencen solos a las 48 h).
function descartarTodo() {
  const archivos = { ...borrador.vista.archivos, ...(pendiente.value?.vista?.archivos ?? {}) };
  for (const id of Object.keys(archivos)) api(`/uploads/${id}`, { metodo: 'DELETE' }).catch(() => {});
  descartar();
  empezarDeCero();
  errores.value = {};
  errorGeneral.value = '';
  confirmarDescarte.value = false;
  irA(0, { reemplazar: true });
}

const indice = computed(() => Math.max(0, PASOS.findIndex((p) => p.clave === route.params.paso)));
const paso = computed(() => PASOS[indice.value]);
const volverARevision = computed(() => route.query.volver === 'revision' && borrador.pasoMax >= PASOS.length - 1);
const completo = (i) => i < borrador.pasoMax;

const guardadoTexto = computed(() => {
  if (!borrador.guardado) return '';
  const t = new Date(borrador.guardado);
  return `Guardado a las ${t.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} en este equipo`;
});
const pendienteTexto = computed(() => {
  if (!pendiente.value?.guardado) return '';
  const t = new Date(pendiente.value.guardado);
  return `${t.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' })} a las ${t.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
});

function esquemaDe(clave) {
  if (clave === 'documentos') return esquemaDocumentos(borrador.datos.motivo.categoria, sinDocumentos.value);
  return PASOS.find((p) => p.clave === clave)?.esquema;
}

function validar(clave) {
  const esquema = esquemaDe(clave);
  if (!esquema) return true;
  const r = esquema.safeParse(borrador.datos[clave]);
  errores.value = r.success ? {} : erroresPorCampo(r.error);
  return r.success;
}

async function irA(i, { reemplazar = false } = {}) {
  const destino = { path: `/solicitud/nueva/${PASOS[i].clave}` };
  await (reemplazar ? router.replace(destino) : router.push(destino));
}

async function siguiente() {
  errorGeneral.value = '';
  if (!validar(paso.value.clave)) {
    await nextTick();
    // Lleva al primer campo con error.
    raiz.value?.querySelector('[aria-invalid="true"], .error')?.scrollIntoView({ block: 'center', behavior: reducido() ? 'auto' : 'smooth' });
    raiz.value?.querySelector('[aria-invalid="true"]')?.focus({ preventScroll: true });
    return;
  }
  borrador.pasoMax = Math.max(borrador.pasoMax, indice.value + 1);
  if (volverARevision.value) return irA(PASOS.length - 1);
  irA(indice.value + 1);
}
function anterior() {
  errores.value = {};
  if (indice.value > 0) irA(indice.value - 1);
}
function saltar(i) {
  if (i <= borrador.pasoMax) { errores.value = {}; irA(i); }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Envío con la clave de idempotencia del borrador: si la red se corta y se reintenta, el servidor
// devuelve la misma solicitud en vez de crear otra.
async function enviar() {
  enviando.value = true;
  errorGeneral.value = '';
  for (let intento = 1; intento <= 3; intento += 1) {
    try {
      const r = await api('/solicitudes', { metodo: 'POST', cuerpo: borrador.datos, encabezados: { 'Idempotency-Key': borrador.idempotencia } });
      // La pantalla de éxito muestra el mismo pase; el borrador se borra.
      try { sessionStorage.setItem('accesos-ultimo-envio', JSON.stringify({ numero: r.numero, borrador })); } catch { /* sin almacenamiento */ }
      descartar();
      await router.replace(`/solicitud/lista/${r.numero}`);
      return;
    } catch (e) {
      if (e.status === 0 && intento < 3) {
        errorGeneral.value = `Se cortó la conexión. Reintentando (${intento} de 2)…`;
        await esperar(1500 * intento);
        continue;
      }
      const claves = Object.keys(e.campos ?? {});
      if (e.status === 422 && claves.length) {
        // Lleva al paso del primer dato que el servidor rechazó.
        const [seccion] = claves[0].split('.');
        const i = PASOS.findIndex((p) => p.clave === seccion);
        if (i >= 0) {
          await irA(i);
          errores.value = Object.fromEntries(claves.filter((k) => k.startsWith(`${seccion}.`)).map((k) => [k.slice(seccion.length + 1), e.campos[k]]));
        }
      }
      errorGeneral.value = e.message;
      break;
    }
  }
  enviando.value = false;
}

// Los errores marcados se van apenas el campo queda bien (no aparecen errores nuevos hasta "Siguiente").
watch(() => borrador.datos[paso.value.clave], () => {
  const marcados = Object.keys(errores.value);
  if (!marcados.length) return;
  const esquema = esquemaDe(paso.value.clave);
  const r = esquema?.safeParse(borrador.datos[paso.value.clave]);
  const actuales = r && !r.success ? erroresPorCampo(r.error) : {};
  errores.value = Object.fromEntries(marcados.filter((k) => actuales[k]).map((k) => [k, actuales[k]]));
}, { deep: true });

// No se puede entrar a un paso más adelante que el último validado.
watch(() => route.params.paso, () => {
  if (!route.params.paso || indice.value > borrador.pasoMax) irA(Math.min(borrador.pasoMax, PASOS.length - 1), { reemplazar: true });
}, { immediate: true });

onMounted(async () => {
  cargarReglas();
  try { packs.value = await api('/catalogo/packs'); } catch { errorGeneral.value = 'No pudimos cargar los packs. Revisá tu conexión y recargá la página.'; }
});

// Transiciones: el paso entra deslizando según la dirección; la barra y los tildes acompañan.
const raiz = ref(null);
const { add, reducido } = useGsap(raiz, () => {
  gsap.set('.progreso i', { scaleX: (indice.value + 1) / PASOS.length });
});
watch(indice, async (nuevo, viejo) => {
  await nextTick();
  const dir = nuevo > viejo ? 1 : -1;
  add(() => {
    gsap.to('.progreso i', { scaleX: (nuevo + 1) / PASOS.length, duration: 0.3, ease: 'power2.out' });
    if (reducido()) {
      gsap.from('.paso-actual', { autoAlpha: 0, duration: 0.15 });
    } else {
      gsap.fromTo('.paso-actual', { x: 24 * dir, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.28, ease: 'power3.out', clearProps: 'transform' });
      if (dir > 0) gsap.from(`.stepper li:nth-child(${nuevo}) .tilde path`, { drawSVG: '0%', duration: 0.3, ease: 'power2.out' });
    }
  });
  raiz.value?.querySelector('.paso-actual h2')?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: reducido() ? 'auto' : 'smooth' });
});
</script>

<template>
  <div ref="raiz" class="asistente wrap">
    <div v-if="pendiente" class="retomar">
      <h1>Tenés una solicitud sin terminar</h1>
      <p>La guardamos en este equipo el {{ pendienteTexto }}. Podés seguir donde la dejaste o empezar una nueva.</p>
      <div class="acciones">
        <button class="btn-corte" type="button" @click="retomar(); irA(borrador.pasoMax, { reemplazar: true })">Retomar el borrador</button>
        <button class="btn-sec" type="button" @click="confirmarDescarte = true">Empezar de cero</button>
      </div>
    </div>

    <template v-else>
      <header class="titulo">
        <h1>Nueva solicitud</h1>
        <p class="guardado" aria-live="polite">{{ guardadoTexto }}</p>
        <button class="descartar angosto" type="button" @click="confirmarDescarte = true">Descartar</button>
      </header>

      <div class="progreso" aria-hidden="true">
        <p><span class="num">Paso {{ indice + 1 }} de {{ PASOS.length }}</span> · {{ paso.nombre }}</p>
        <div class="barra"><i /></div>
      </div>

      <div class="cuerpo">
        <nav class="stepper" aria-label="Pasos de la solicitud">
          <ol>
            <li v-for="(p, i) in PASOS" :key="p.clave" :class="{ actual: i === indice, hecho: completo(i) }">
              <button type="button" :disabled="i > borrador.pasoMax" :aria-current="i === indice ? 'step' : undefined" @click="saltar(i)">
                <span class="marca" aria-hidden="true">
                  <svg v-if="completo(i) && i !== indice" class="tilde" viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  <span v-else class="num">{{ i + 1 }}</span>
                </span>
                <span class="nombre">{{ p.nombre }}<span v-if="completo(i)" class="sr-only"> (completo)</span></span>
              </button>
            </li>
          </ol>
        </nav>

        <section class="paso-actual" :aria-labelledby="`titulo-${paso.clave}`">
          <h2 :id="`titulo-${paso.clave}`" tabindex="-1">{{ paso.nombre }}</h2>
          <p class="ayuda-paso">{{ AYUDAS[paso.clave] }}</p>
          <p v-if="errorGeneral" class="aviso error" role="alert"><span class="tri-mark" aria-hidden="true" />{{ errorGeneral }}</p>

          <PasoSolicitante v-if="paso.clave === 'solicitante'" :modelo="borrador.datos.solicitante" :errores="errores" />
          <PasoDestino v-else-if="paso.clave === 'destino'" :modelo="borrador.datos.destino" :vista="borrador.vista" :errores="errores" :packs="packs" />
          <PasoMotivo v-else-if="paso.clave === 'motivo'" :modelo="borrador.datos.motivo" :errores="errores" />
          <PasoPersonal v-else-if="paso.clave === 'personal'" :modelo="borrador.datos.personal" :errores="errores" :fecha-hasta="borrador.datos.motivo.fecha_hasta" />
          <PasoDocumentos v-else-if="paso.clave === 'documentos'" :modelo="borrador.datos.documentos" :vista="borrador.vista" :errores="errores" :categoria="borrador.datos.motivo.categoria" />
          <PasoSeguridad v-else-if="paso.clave === 'seguridad'" :modelo="borrador.datos.seguridad" :vista="borrador.vista" :errores="errores" :planta-id="borrador.datos.destino.planta_id" />
          <template v-else>
            <PassPreview class="pase-movil" :borrador="borrador" />
            <PasoRevision :borrador="borrador" />
          </template>

          <div class="navegacion">
            <button v-if="indice > 0" class="btn-sec" type="button" @click="anterior">Anterior</button>
            <button v-if="paso.clave !== 'revision'" class="btn-corte" type="button" @click="siguiente">
              {{ volverARevision ? 'Volver a la revisión' : 'Siguiente' }}
            </button>
            <button v-else class="btn-corte" type="button" :disabled="enviando" @click="enviar">
              {{ enviando ? 'Enviando…' : 'Enviar solicitud' }}
            </button>
          </div>
        </section>

        <aside class="lateral" aria-label="Vista previa del pase">
          <PassPreview :borrador="borrador" />
          <button class="descartar" type="button" @click="confirmarDescarte = true">Descartar y empezar de cero</button>
        </aside>
      </div>
    </template>

    <DialogoConfirmar :abierto="confirmarDescarte" titulo="¿Descartar la solicitud?" texto="Se borran todos los datos cargados y los archivos subidos. No se puede deshacer."
                      accion="Descartar" destructivo @confirmar="descartarTodo" @cerrar="confirmarDescarte = false" />
  </div>
</template>

<style scoped>
/* Pantalla de trabajo: stepper vertical | formulario (hasta 720 px) | pase pegado al formulario. */
.asistente { padding-top: 32px; padding-bottom: 96px; max-width: calc(220px + 720px + 340px + 80px + var(--margin) * 2); }
.titulo { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.titulo h1 { font-size: var(--t-sub); line-height: 1.2; }
.guardado { color: var(--muted); font-size: var(--t-nota); }
.progreso { display: none; }
.cuerpo { display: grid; grid-template-columns: 220px minmax(0, 720px) 340px; gap: 40px; margin-top: 28px; align-items: start; }

.stepper { position: sticky; top: 24px; }
.stepper ol { display: grid; gap: 2px; }
.stepper button { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 44px; padding: 6px 10px; border-radius: 6px; text-align: left; color: var(--muted); transition: background-color var(--t-hover) ease, color var(--t-hover) ease; }
.stepper button:not(:disabled):hover { background: var(--raised); color: var(--ink); }
.stepper button:disabled { cursor: default; opacity: 0.6; }
.stepper .marca { display: grid; place-items: center; flex: none; width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--control); font-size: var(--t-nota); }
.stepper .hecho .marca { background: var(--ink); color: var(--surface); border-color: var(--ink); }
.stepper .tilde { width: 16px; height: 16px; }
.stepper .actual button { background: var(--active); color: var(--ink); font-weight: 600; }
.stepper .actual .marca { border-color: var(--ink); color: var(--ink); background: var(--surface); }

.paso-actual { min-width: 0; }
.paso-actual h2 { font-size: var(--t-sub); line-height: 1.2; outline: none; }
.ayuda-paso { margin: 6px 0 28px; color: var(--muted); }
.paso-actual > .aviso { margin-bottom: 20px; }
:deep(.paso-grilla) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px 20px; }
:deep(.paso-grilla .ancho) { grid-column: 1 / -1; }
:deep(.privacidad) { color: var(--muted); font-size: var(--t-nota); }
.navegacion { display: flex; justify-content: space-between; gap: 12px; margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--border); }
.navegacion .btn-corte { margin-left: auto; }

.lateral { position: sticky; top: 24px; display: grid; gap: 14px; }
.pase-movil { display: none; margin-bottom: 16px; }
.descartar { justify-self: start; color: var(--muted); font-size: var(--t-nota); text-decoration: underline; text-underline-offset: 3px; }
.descartar:hover { color: var(--ink); }
.descartar.angosto { display: none; }

.retomar { max-width: 62ch; padding: 48px 0; display: grid; gap: 16px; }
.retomar h1 { font-size: var(--t-seccion-chico); line-height: 1.1; }
.retomar .acciones { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }

@media (max-width: 1180px) {
  .cuerpo { grid-template-columns: 200px minmax(0, 720px); }
  .lateral { display: none; }
  .pase-movil { display: block; }
  .descartar.angosto { display: inline; }
}
@media (max-width: 860px) {
  .asistente { padding-top: 16px; padding-bottom: 120px; }
  .guardado { display: none; }
  .progreso { display: grid; gap: 8px; position: sticky; top: 0; z-index: 5; margin: 0 calc(var(--margin) * -1); padding: 12px var(--margin); background: var(--ground); }
  .progreso p { font-size: var(--t-nota); color: var(--muted); }
  .progreso .barra { height: 4px; border-radius: 2px; background: var(--raised); overflow: hidden; }
  .progreso i { display: block; height: 100%; background: var(--ink); transform-origin: left; }
  .cuerpo { grid-template-columns: minmax(0, 1fr); margin-top: 12px; }
  .stepper { display: none; }
  :deep(.paso-grilla) { grid-template-columns: 1fr; }
  .navegacion { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; margin: 0; padding: 12px var(--margin) calc(12px + env(safe-area-inset-bottom)); background: var(--ground); border-top: 1px solid var(--border); }
  .navegacion .btn-corte, .navegacion .btn-sec { flex: 1; justify-content: center; }
  .navegacion .btn-corte { padding-left: 22px; }
}
</style>
