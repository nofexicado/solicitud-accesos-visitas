// Borrador del asistente en este navegador (localStorage). El "Borrador" no existe en el servidor:
// la solicitud nace en "Enviada" al enviarse. No guarda archivos, solo los ids de los uploads.
import { reactive, ref, watch } from 'vue';

const CLAVE = 'accesos-borrador';
const VERSION = 1;

export function borradorVacio() {
  return {
    version: VERSION,
    // Se genera al empezar: si la red falla y se reintenta el envío, el servidor no duplica.
    idempotencia: crypto.randomUUID(),
    pasoMax: 0,
    guardado: null,
    datos: {
      solicitante: { razon_social: '', cuit: '', solicitante_nombre: '', email: '', telefono: '' },
      destino: { pack_id: null, planta_id: null, otra_locacion: '', contacto_interno: '', autorizante_id: null, pendiente_asignacion: false },
      motivo: { categoria: '', contrato_ref: '', motivo: '', fecha_desde: '', fecha_hasta: '', hora_desde: '', hora_hasta: '' },
      personal: { personas: [{ nombre_apellido: '', tipo_doc: 'dni', nro_doc: '', cargo: '' }], vehiculos: [] },
      documentos: { doc_art: null, doc_nomina: null },
      seguridad: { induccion_comprobante: '', acepta_hse: false },
    },
    // Lo que se muestra pero no se envía: nombres de archivos, nombres de pack/planta/autorizante.
    vista: { archivos: {}, pack: '', planta: '', autorizante: '', induccion_fin: '' },
  };
}

function leer() {
  try {
    const b = JSON.parse(localStorage.getItem(CLAVE));
    return b?.version === VERSION ? b : null;
  } catch {
    return null;
  }
}

// Un borrador recién empezado (o recién descartado) no se guarda: no hay nada que retomar.
const VACIO = JSON.stringify(borradorVacio().datos);
const estaVacio = (b) => b.pasoMax === 0 && JSON.stringify(b.datos) === VACIO;

export function useBorrador() {
  const guardado = leer();
  const borrador = reactive(borradorVacio());
  // Si había uno sin terminar, se ofrece retomarlo en vez de pisarlo.
  const pendiente = ref(guardado && guardado.pasoMax > 0 ? guardado : null);
  if (guardado && !pendiente.value) Object.assign(borrador, guardado);

  let reloj;
  watch(borrador, () => {
    clearTimeout(reloj);
    reloj = setTimeout(() => {
      if (estaVacio(borrador)) return;
      borrador.guardado = new Date().toISOString();
      try { localStorage.setItem(CLAVE, JSON.stringify(borrador)); } catch { /* sin almacenamiento: sigue en memoria */ }
    }, 500);
  }, { deep: true });

  return {
    borrador,
    pendiente,
    retomar() { Object.assign(borrador, pendiente.value); pendiente.value = null; },
    empezarDeCero() { Object.assign(borrador, borradorVacio()); pendiente.value = null; },
    descartar() {
      clearTimeout(reloj);
      try { localStorage.removeItem(CLAVE); } catch { /* nada */ }
    },
  };
}
