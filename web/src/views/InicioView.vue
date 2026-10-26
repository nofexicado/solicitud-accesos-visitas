<script setup>
// Inicio: todo el contenido es visible desde el primer momento (sin entradas ni apariciones al
// scrollear). Lo único que se mueve son las fotos, que se suceden con un fundido lento.
import { computed, onMounted, reactive } from 'vue';
import { requiereDocumentos } from '@accesos/shared';
import Barrera from '../components/Barrera.vue';
import FotosRotativas from '../components/FotosRotativas.vue';
import { cargarReglas, sinDocumentos } from '../composables/useReglas.js';
// FOTOS TEMPORALES (Wikimedia Commons, créditos en el pie). Reemplazar por fotos propias con el mismo
// encuadre horizontal y horizonte bajo: el camino de acceso a un pack, la tranquera de portería y
// una planta vista desde la ruta. Mantener "pie" con el lugar real.
import estepa from '../assets/fotos/estepa.jpg';
import rioFuego from '../assets/fotos/rio-fuego.jpg';
import estancia from '../assets/fotos/estancia.jpg';
// FOTOS TEMPORALES: reemplazar por fotos propias del perímetro o la portería de un pack y del camino
// de ripio que llega a una planta.
import alambrado from '../assets/fotos/alambrado.jpg';
import caminoRipio from '../assets/fotos/camino-ripio.jpg';

const fotos = [
  { src: estepa, w: 1600, h: 628, alt: 'Estepa llana y sin árboles bajo nubes bajas, en el norte de Tierra del Fuego', pie: 'Estepa del norte de Tierra del Fuego' },
  { src: rioFuego, w: 1920, h: 1425, alt: 'El río Fuego atravesando la estepa, con un camión en la ruta al fondo', pie: 'Río Fuego, en la ruta a los yacimientos' },
  { src: estancia, w: 1920, h: 1440, alt: 'Ovejas pastando junto a un alambrado bajo un cielo cubierto', pie: 'Campo de estancia en la isla' },
];
const fotosBanda = [
  { src: alambrado, w: 1920, h: 1440, alt: 'Guanacos cruzando un alambrado en la estepa fueguina', pie: 'Alambrado en la estepa fueguina', encuadre: '50% 62%' },
  { src: caminoRipio, w: 1024, h: 768, alt: 'Un camión levanta polvo en un camino de ripio que cruza la estepa', pie: 'Camino de ripio en el norte de la isla', encuadre: '50% 55%' },
];

const etapas = [
  { titulo: 'Solicitud', texto: 'Completás quién viene, a qué planta, en qué fechas y con qué vehículos, y subís la ART con la nómina. El formulario se guarda solo.' },
  { titulo: 'Inducción', texto: 'Mirás completo el video de seguridad y aceptás los requisitos de equipo de protección. Queda registrado cuándo lo terminaste.' },
  { titulo: 'Validación HSE', texto: 'HSE revisa cada documento y la inducción. Si algo falta o está vencido, te escribe con el motivo.' },
  { titulo: 'Autorización', texto: 'El responsable de la planta aprueba la visita. Nadie puede aprobar una solicitud propia.' },
  { titulo: 'Pase y portería', texto: 'Recibís el pase con QR por mail y en Mis solicitudes. Portería lo valida al entrar y al salir.', habilitado: true },
];

// "Qué tenés que tener": la lista se ajusta a cómo vas.
const filtro = reactive({ como: 'contratista', vehiculo: 'si' });
const grupos = [
  { clave: 'doc', titulo: 'Documentación', items: [
    { t: 'DNI o pasaporte', c: 'En portería', d: 'De cada persona que entra. Portería lo pide junto con el pase.' },
    { t: 'ART con nómina', c: 'Al pedir el acceso', d: 'Certificado de cobertura con todas las personas que van. PDF, JPG o PNG de hasta 10 MB.', solo: 'documentos' },
    { t: 'Seguro del vehículo', c: 'Al pedir el acceso', d: 'Vigente durante todas las fechas de la visita. Si vence antes, te avisamos.', solo: 'vehiculo' },
    { t: 'VTV', c: 'Al pedir el acceso', d: 'Con la fecha de vencimiento de cada vehículo y su patente.', solo: 'vehiculo' },
    { t: 'Inducción de seguridad', c: 'Antes de enviar', d: 'Video completo una vez por solicitud. Queda registrada la hora en que lo terminaste.' },
  ] },
  { clave: 'epp', titulo: 'Equipo de protección', items: [
    { t: 'Casco de seguridad', c: 'Siempre', d: 'Con barbijo, en buen estado y dentro de su vida útil.' },
    { t: 'Calzado de seguridad', c: 'Siempre', d: 'Con puntera y suela antideslizante.' },
    { t: 'Anteojos de seguridad', c: 'Siempre', d: 'Lente claro; lente oscuro para trabajos a la intemperie con sol.' },
    { t: 'Ropa de trabajo ignífuga', c: 'Siempre', d: 'Mameluco o conjunto ignífugo, mangas largas.' },
    { t: 'Protección auditiva', c: 'Zonas señalizadas', d: 'Obligatoria en compresión y generación.' },
    { t: 'Guantes', c: 'Según la tarea', d: 'De vaqueta, nitrilo o dieléctricos, según el permiso de trabajo.', solo: 'contratista' },
  ] },
];
const aplica = (it) => !it.solo
  || (it.solo === 'documentos' && requiereDocumentos(filtro.como, sinDocumentos.value))
  || (it.solo === 'contratista' && filtro.como === 'contratista')
  || (it.solo === 'vehiculo' && filtro.vehiculo === 'si');
const visibles = computed(() => grupos.map((g) => ({ ...g, lista: g.items.filter(aplica) })));
const total = computed(() => visibles.value.reduce((n, g) => n + g.lista.length, 0));

const preguntas = [
  ['¿Tengo que crear una cuenta?', 'No. Tus solicitudes quedan guardadas en este equipo. Desde otro, consultalas con el número de solicitud y tu DNI o el CUIT de la empresa.'],
  ['¿Con cuánta anticipación la pido?', 'Lo antes posible: pasa por dos revisiones, HSE y la planta. Mientras tanto ves en qué etapa está desde Mis solicitudes.'],
  ['¿Puedo cargar varias personas y vehículos?', 'Sí. Cargás a cada persona con su documento y cada vehículo con su patente y los vencimientos de seguro y VTV.'],
  ['¿Tengo que ver la inducción cada vez?', 'Sí, una vez por solicitud. El video no se puede adelantar y el sistema registra cuándo lo terminaste.'],
  ['¿Qué pasa si me la rechazan?', 'Te llega un mail con el motivo. Podés enviar una solicitud nueva con lo que faltaba corregido.'],
  ['¿Hasta cuándo vale el pase?', 'Entre las fechas aprobadas. Pasada la fecha de fin, la solicitud vence y el QR deja de ser válido en portería.'],
  ['¿Sirve el pase impreso?', 'Sí. Lo descargás en PDF; portería lee el QR del papel o de la pantalla del teléfono.'],
  ['¿Qué hacen con mis datos?', 'Los usamos solo para gestionar el ingreso. Los adjuntos y los datos personales se borran 12 meses después de que la solicitud se cierra: cuando vence, la rechazan o egresás.'],
];

onMounted(cargarReglas);
</script>

<template>
  <div ref="raiz">
    <section class="portada" aria-labelledby="titulo">
      <div class="tarjeta">
        <Barrera />
        <div class="cuerpo">
          <h1 id="titulo">Ingreso a yacimientos</h1>
          <p class="bajada">Pedí el acceso para tu visita o tu cuadrilla, hacé la inducción de seguridad y llevá a portería el pase con QR.</p>
          <div class="acciones">
            <RouterLink class="btn-corte" to="/solicitud/nueva">Nueva solicitud</RouterLink>
            <RouterLink class="enlace" to="/mis-solicitudes#consultar">Consultar una solicitud</RouterLink>
          </div>
        </div>
        <div class="pie">
          <RouterLink to="/mis-solicitudes">Mis solicitudes</RouterLink>
          <a href="#requisitos">Qué tenés que tener</a>
          <a href="#preguntas">Preguntas frecuentes</a>
        </div>
      </div>
      <div class="estepa">
        <FotosRotativas class="marco" :fotos="fotos" primera-eager />
      </div>
    </section>

    <section class="seccion wrap" aria-labelledby="circuito">
      <div class="intro">
        <h2 id="circuito">El circuito de ingreso</h2>
        <p>Cada solicitud pasa por dos firmas antes de habilitarte: primero HSE revisa la documentación y la inducción, después el responsable de la planta autoriza la visita. Te avisamos por mail en cada paso.</p>
      </div>
      <ol class="etapas">
        <li v-for="e in etapas" :key="e.titulo" class="etapa">
          <h3>{{ e.titulo }}</h3>
          <p>{{ e.texto }}</p>
          <p v-if="e.habilitado" class="senal"><span class="tri-mark ok" aria-hidden="true" />Habilitado para ingresar</p>
        </li>
      </ol>
    </section>

    <div class="banda">
      <FotosRotativas class="marco" :fotos="fotosBanda" :intervalo="7000" />
    </div>

    <section id="requisitos" class="seccion wrap" aria-labelledby="titulo-requisitos">
      <div class="intro">
        <h2 id="titulo-requisitos">Qué tenés que tener</h2>
        <p>Contanos cómo vas y te mostramos lo que te van a pedir. La lista completa por planta está en <RouterLink class="enlace" to="/requisitos-hse">Requisitos HSE</RouterLink>.</p>
      </div>
      <div class="filtros">
        <div class="filtro">
          <span id="f-como">Vas como</span>
          <div class="segmento" role="group" aria-labelledby="f-como">
            <button v-for="o in [['visita', 'Visita'], ['contratista', 'Contratista']]" :key="o[0]" type="button" :aria-pressed="filtro.como === o[0]" @click="filtro.como = o[0]">{{ o[1] }}</button>
          </div>
        </div>
        <div class="filtro">
          <span id="f-vehiculo">Entrás con vehículo</span>
          <div class="segmento" role="group" aria-labelledby="f-vehiculo">
            <button v-for="o in [['no', 'No'], ['si', 'Sí']]" :key="o[0]" type="button" :aria-pressed="filtro.vehiculo === o[0]" @click="filtro.vehiculo = o[0]">{{ o[1] }}</button>
          </div>
        </div>
        <p class="resumen num" aria-live="polite">Te van a pedir {{ total }} cosas</p>
      </div>
      <div v-for="g in visibles" :key="g.clave" class="grupo">
        <header><h3>{{ g.titulo }}</h3><span class="cuenta num">{{ g.lista.length }} de {{ g.items.length }}</span></header>
        <ul class="items">
          <li v-for="it in g.lista" :key="it.t" class="item">
            <span class="forma" aria-hidden="true" />
            <div><div class="linea"><h4>{{ it.t }}</h4><span class="cuando">{{ it.c }}</span></div><p>{{ it.d }}</p></div>
          </li>
        </ul>
      </div>
    </section>

    <section id="preguntas" class="seccion wrap" aria-labelledby="titulo-preguntas">
      <div class="preguntas">
        <h2 id="titulo-preguntas">Preguntas frecuentes</h2>
        <div class="lista">
          <details v-for="([q, a], i) in preguntas" :key="q" name="faq" :open="i === 0">
            <summary>{{ q }}<span class="mas" aria-hidden="true" /></summary>
            <p>{{ a }}</p>
          </details>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Portada: tarjeta impresa con la franja de barrera al lado de la estepa (diseño aprobado). */
.portada { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 0 var(--margin); min-height: calc(100svh - 72px - var(--margin)); }
.tarjeta { display: flex; flex-direction: column; background: var(--surface); border-radius: 6px; overflow: hidden; }
.tarjeta .cuerpo { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 28px; padding: clamp(32px, 4.4vw, 72px); }
.tarjeta h1 { font-size: var(--t-portada); line-height: 1; }
.bajada { font-size: var(--t-sub); line-height: 1.35; max-width: 30ch; }
.acciones { display: flex; flex-wrap: wrap; align-items: center; gap: 16px 28px; }
.tarjeta .pie { display: flex; flex-wrap: wrap; gap: 8px 28px; padding: 0 clamp(32px, 4.4vw, 72px) 28px; font-size: var(--t-nota); }
.tarjeta .pie a { text-underline-offset: 4px; }
.estepa { position: relative; }
.estepa .marco { position: sticky; top: var(--margin); height: calc(100svh - 72px - var(--margin)); min-height: 520px; overflow: hidden; border-radius: 6px 6px 6px 0;
  clip-path: polygon(0 0, 100% 0, 100% 100%, calc(220px * var(--flanco)) 100%, 0 calc(100% - 220px)); }

.seccion { padding-top: clamp(96px, 11vw, 200px); }
.intro { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: 24px; row-gap: 20px; align-items: end; }
.intro h2 { grid-column: 1 / 6; font-size: var(--t-seccion); line-height: 1.04; }
.intro p { grid-column: 7 / 12; max-width: 62ch; }
.etapas { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); margin-top: 56px; border-radius: 6px; overflow: hidden; }
.etapa { display: flex; flex-direction: column; gap: 14px; min-height: 320px; padding: 28px 24px; background: var(--etapa-1); color: var(--etapa-ink); }
.etapa:nth-child(2) { background: var(--etapa-2); }
.etapa:nth-child(3) { background: var(--etapa-3); }
.etapa:nth-child(4) { background: var(--etapa-4); }
.etapa:nth-child(5) { background: var(--etapa-5); color: var(--etapa-5-ink); }
.etapa h3 { font-size: var(--t-sub); line-height: 1.15; }
.etapa p { max-width: 30ch; }
.senal { margin-top: auto; display: flex; align-items: center; gap: 10px; font-weight: 600; color: var(--verde-ink); }
.senal .tri-mark { width: 22px; height: 20px; }

.banda { margin: clamp(96px, 11vw, 200px) var(--margin) 0; }
.banda .marco { height: 62svh; min-height: 380px; border-radius: 6px 6px 6px 0;
  clip-path: polygon(0 0, 100% 0, 100% 100%, calc(220px * var(--flanco)) 100%, 0 calc(100% - 220px)); }

.filtros { display: flex; flex-wrap: wrap; gap: 16px 40px; margin-top: 48px; padding: 20px 24px; background: var(--raised); border-radius: 6px; }
.filtro { display: flex; align-items: center; gap: 14px; }
.filtro > span { font-weight: 600; }
.segmento { display: inline-flex; padding: 3px; border-radius: 6px; background: var(--ground); }
.segmento button { height: 42px; padding: 0 16px; border-radius: 4px; color: var(--muted); font-weight: 500; transition: background-color var(--t-hover) ease, color var(--t-hover) ease; }
.segmento button:hover { color: var(--ink); }
.segmento button[aria-pressed="true"] { background: var(--surface); color: var(--ink); }
.resumen { margin-left: auto; align-self: center; color: var(--muted); }
.grupo { margin-top: 64px; }
.grupo header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 32px; }
.grupo h3 { font-size: var(--t-sub); line-height: 1.15; }
.cuenta { color: var(--muted); white-space: nowrap; }
.items { display: grid; grid-template-columns: 1fr 1fr; column-gap: 64px; row-gap: 32px; }
.item { display: grid; grid-template-columns: 56px minmax(0, 1fr); column-gap: 20px; }
.forma { width: 56px; height: 50px; background: var(--ink); clip-path: polygon(0 0, 100% 0, 50% 100%); }
.linea { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.item h4 { font-size: var(--t-texto); font-weight: 650; }
.cuando { flex: none; color: var(--muted); font-size: var(--t-nota); }
.item p { margin-top: 4px; font-size: var(--t-nota); color: var(--muted); max-width: 44ch; }

.preguntas { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: 24px; }
.preguntas h2 { grid-column: 1 / 5; align-self: start; font-size: var(--t-seccion); line-height: 1.04; }
.lista { grid-column: 5 / 13; display: grid; gap: 8px; }
details { background: var(--surface); border-radius: 6px; transition: background-color var(--t-ui) ease, color var(--t-ui) ease; }
summary { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 76px; padding: 18px 24px; list-style: none; cursor: pointer; font-size: var(--t-sub); line-height: 1.25; font-weight: 500; }
summary::-webkit-details-marker { display: none; }
summary:hover { color: var(--muted); }
.mas { position: relative; flex: none; width: 16px; height: 16px; }
.mas::before, .mas::after { content: ""; position: absolute; left: 0; top: 6.5px; width: 16px; height: 3px; background: currentColor; transition: transform var(--t-ui) var(--ease-out); }
.mas::after { transform: rotate(90deg); }
details[open] { background: var(--enfasis-bg); color: var(--enfasis-ink); }
details[open] summary:hover { color: inherit; }
details[open] .mas::after { transform: rotate(0deg); }
details p { padding: 0 24px 24px; max-width: 52ch; }

@media (max-width: 1100px) {
  .tarjeta h1 { font-size: var(--t-seccion); }
  .intro h2, .preguntas h2 { font-size: var(--t-seccion-chico); }
  .etapas { grid-template-columns: 1fr; }
  .etapa { display: grid; grid-template-columns: minmax(160px, 1fr) minmax(0, 2fr); column-gap: 24px; min-height: 0; padding: 22px 24px; }
  .senal { grid-column: 2; margin-top: 4px; }
}
@media (max-width: 760px) {
  .portada { grid-template-columns: 1fr; min-height: 0; }
  .estepa { order: -1; }
  .estepa .marco { position: relative; top: 0; height: 30svh; min-height: 190px; clip-path: polygon(0 0, 100% 0, 100% 100%, calc(100px * var(--flanco)) 100%, 0 calc(100% - 100px)); }
  .tarjeta { position: relative; margin-top: -28px; z-index: 1; }
  .tarjeta :deep(.barrera) { height: 32px !important; }
  .tarjeta .cuerpo { padding: 24px 20px 20px; gap: 18px; }
  .bajada { font-size: var(--t-texto); line-height: 1.45; }
  .acciones { gap: 14px 22px; }
  .tarjeta .pie { padding: 0 20px 22px; }
  .intro h2, .intro p { grid-column: 1 / -1; }
  .etapas { margin-top: 36px; }
  .etapa { grid-template-columns: 1fr; row-gap: 6px; padding: 20px; }
  .senal { grid-column: 1; }
  .banda .marco { height: 42svh; min-height: 260px; clip-path: polygon(0 0, 100% 0, 100% 100%, calc(120px * var(--flanco)) 100%, 0 calc(100% - 120px)); }
  .filtros { padding: 18px; gap: 16px; }
  .filtro { flex-wrap: wrap; }
  .resumen { margin-left: 0; }
  .items { grid-template-columns: 1fr; row-gap: 26px; }
  .item { grid-template-columns: 44px minmax(0, 1fr); column-gap: 16px; }
  .forma { width: 44px; height: 39px; }
  .linea { flex-direction: column; gap: 0; }
  .preguntas h2 { grid-column: 1 / -1; margin-bottom: 28px; }
  .lista { grid-column: 1 / -1; gap: 6px; }
  summary { font-size: var(--t-texto); font-weight: 600; min-height: 64px; padding: 16px 20px; }
  details p { padding: 0 20px 20px; }
}
</style>
