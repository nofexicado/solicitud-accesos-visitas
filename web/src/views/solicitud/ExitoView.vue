<script setup>
// Pantalla de éxito: el mismo pase del asistente, ahora con su número. El QR aparece cuando se aprueba.
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import SuccessCheck from '../../components/solicitud/SuccessCheck.vue';
import PassPreview from '../../components/solicitud/PassPreview.vue';
import StatusBadge from '../../components/StatusBadge.vue';
import { api } from '../../composables/api.js';
import { paseDesdeDetalle } from '../../composables/paseDesdeDetalle.js';

const route = useRoute();
const numero = computed(() => route.params.numero);
const detalle = ref(null);
const pase = ref(null);
const error = ref('');

onMounted(async () => {
  try {
    const guardado = JSON.parse(sessionStorage.getItem('accesos-ultimo-envio') ?? 'null');
    if (guardado?.numero === numero.value) pase.value = guardado.borrador;
  } catch { /* sin almacenamiento */ }
  try {
    detalle.value = await api(`/solicitudes/${encodeURIComponent(numero.value)}`);
    pase.value ??= paseDesdeDetalle(detalle.value);
  } catch (e) {
    error.value = e.status === 404 ? 'No encontramos esa solicitud en este equipo. Si la enviaste desde otro, consultala con el número y tu DNI.' : e.message;
  }
});

const estadoPase = computed(() => {
  if (!detalle.value) return 'Esperando la validación de HSE';
  if (detalle.value.qr_svg) return detalle.value.vigente ? 'Habilitado para ingresar' : detalle.value.motivo_pase;
  return 'Esperando la validación de HSE';
});
const email = computed(() => detalle.value?.email ?? pase.value?.datos.solicitante.email ?? '');
</script>

<template>
  <div class="wrap exito">
    <section v-if="error" class="mensaje" aria-labelledby="titulo-error">
      <h1 id="titulo-error">Solicitud no encontrada</h1>
      <p class="aviso error"><span class="tri-mark" aria-hidden="true" />{{ error }}</p>
      <RouterLink class="btn-sec" to="/mis-solicitudes#consultar">Consultar con el número y el DNI</RouterLink>
    </section>
    <template v-else-if="pase">
      <section class="mensaje" aria-labelledby="titulo">
        <SuccessCheck />
        <h1 id="titulo">Solicitud enviada</h1>
        <p class="numero num">{{ numero }}</p>
        <StatusBadge v-if="detalle" :estado="detalle.estado" />
        <p>Guardá el número: con él y tu DNI la consultás desde cualquier equipo. {{ email ? `Te avisamos a ${email} en cada etapa.` : '' }}</p>
        <ol class="siguientes">
          <li><b>HSE revisa la documentación y la inducción.</b> Si falta algo, te escribe con el motivo.</li>
          <li><b>El responsable de la planta autoriza la visita.</b></li>
          <li><b>Te llega el pase con el QR</b> por mail y en Mis solicitudes. Portería lo valida al entrar.</li>
        </ol>
        <div class="acciones">
          <RouterLink class="btn-corte" to="/mis-solicitudes">Ver mis solicitudes</RouterLink>
          <RouterLink class="enlace" to="/solicitud/nueva">Hacer otra solicitud</RouterLink>
        </div>
      </section>
      <aside class="lado" aria-label="Pase de acceso">
        <PassPreview :borrador="pase" :numero="numero" :qr="detalle?.qr_svg ?? ''" :habilitado="Boolean(detalle?.vigente)" :estado-texto="estadoPase" />
        <a v-if="detalle?.qr_svg" class="btn-sec descargar" :href="detalle.pdf" download>Descargar PDF</a>
      </aside>
    </template>
  </div>
</template>

<style scoped>
.exito { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 64px; align-items: start; padding-top: 48px; max-width: 1200px; }
.mensaje { display: grid; gap: 18px; justify-items: start; }
h1 { font-size: var(--t-seccion); line-height: 1.04; }
.numero { font-size: var(--t-sub); font-weight: 650; font-stretch: 112%; }
.mensaje > p:not(.numero) { max-width: 56ch; }
.siguientes { display: grid; gap: 12px; margin: 8px 0; padding-left: 20px; }
.siguientes li { padding-left: 6px; max-width: 56ch; }
.siguientes b { font-weight: 600; }
.acciones { display: flex; flex-wrap: wrap; align-items: center; gap: 16px 28px; margin-top: 8px; }
.lado { position: sticky; top: 24px; display: grid; gap: 12px; }
.descargar { justify-self: start; }
@media (max-width: 900px) {
  .exito { grid-template-columns: 1fr; gap: 32px; padding-top: 28px; }
  h1 { font-size: var(--t-seccion-chico); }
  .lado { position: static; }
}
</style>
