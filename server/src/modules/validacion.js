// Validación de un pase en un punto de control. Es la única regla de "¿puede entrar?": la usa la
// recepción de planta y está pensada para que un dispositivo externo (el lector QR del
// intercomunicador del pack) la consulte más adelante sin cambios. Contrato en docs/validacion-qr.md.
import { fechaLocalISO, ZONA_HORARIA } from '@accesos/shared';
import { config } from '../config.js';
import { query as consultaPorDefecto } from '../db.js';
import { verificar } from '../firmas.js';
import { ESTADOS_CON_QR } from './pase.js';

export const RESULTADO = { HABILITADO: 'habilitado', NO_HABILITADO: 'no_habilitado', DESCONOCIDO: 'desconocido' };

const diaMes = (iso) => iso.split('-').reverse().slice(0, 2).join('/');
const horaLocal = (instante) => instante.toLocaleTimeString('es-AR', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/**
 * Del texto que trae el QR saca el token: acepta la URL completa (https://…/q/<token>) o el token solo.
 * Así un lector externo puede mandar lo que leyó, sin interpretarlo.
 */
export function tokenDeCodigo(codigo) {
  const texto = String(codigo ?? '').trim();
  const enUrl = texto.match(/\/q\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)(?:[?#].*)?$/);
  return enUrl ? enUrl[1] : texto;
}

const SELECT = `
  SELECT s.id, s.numero, s.estado, s.qr_version, s.categoria, s.fecha_desde, s.fecha_hasta,
         to_char(s.hora_desde, 'HH24:MI') AS hora_desde, to_char(s.hora_hasta, 'HH24:MI') AS hora_hasta,
         s.pack_id, pk.nombre AS pack, s.planta_id, pl.nombre AS planta, s.otra_locacion, s.contacto_interno,
         s.depurada_at, e.razon_social AS empresa, e.cuit
  FROM solicitudes s
  JOIN empresas e ON e.id = s.empresa_id
  JOIN packs pk ON pk.id = s.pack_id
  LEFT JOIN plantas pl ON pl.id = s.planta_id`;

/**
 * Evalúa si la solicitud habilita a entrar ahora en la planta indicada.
 *   pase:  { codigo } (lo que se leyó del QR) o { numero } (búsqueda manual en recepción)
 *   lugar: { plantaId } planta donde está el punto de control (null = no se controla el destino)
 * Devuelve { resultado, habilitado, motivo, avisos[], solicitud } — `solicitud` es la fila interna
 * (con id) o null si el código no corresponde a ningún pase.
 */
export async function validarPase(pase, { plantaId = null, ahora = new Date(), consulta = consultaPorDefecto } = {}) {
  let s;
  let reemplazado = false;
  if (pase.codigo !== undefined) {
    const t = verificar(config.QR_SECRET, tokenDeCodigo(pase.codigo));
    if (!t || t.p !== 'qr' || !Number.isInteger(t.s)) {
      return { resultado: RESULTADO.DESCONOCIDO, habilitado: false, motivo: 'El código no es un pase válido o está dañado.', avisos: [], solicitud: null };
    }
    ({ rows: [s] } = await consulta(`${SELECT} WHERE s.id = $1`, [t.s]));
    reemplazado = Boolean(s) && s.qr_version !== t.v;
  } else {
    ({ rows: [s] } = await consulta(`${SELECT} WHERE s.numero = $1`, [pase.numero]));
  }
  if (!s) return { resultado: RESULTADO.DESCONOCIDO, habilitado: false, motivo: 'No encontramos ese pase.', avisos: [], solicitud: null };

  const no = (motivo) => ({ resultado: RESULTADO.NO_HABILITADO, habilitado: false, motivo, avisos: [], solicitud: s });
  const hoy = fechaLocalISO(ahora);
  if (reemplazado) return no('Este QR fue reemplazado por uno nuevo: pedile el pase actualizado.');
  if (s.depurada_at) return no('La solicitud está cerrada.');
  if (!ESTADOS_CON_QR.includes(s.estado)) {
    const MOTIVOS = { rechazada: 'La solicitud fue rechazada.', vencida: 'La solicitud venció.' };
    return no(MOTIVOS[s.estado] ?? 'La solicitud todavía no está aprobada.');
  }
  if (hoy < s.fecha_desde) return no(`Habilitado recién desde el ${diaMes(s.fecha_desde)}.`);
  if (hoy > s.fecha_hasta) return no(`El pase venció el ${diaMes(s.fecha_hasta)}.`);
  if (plantaId) {
    if (s.planta_id && s.planta_id !== plantaId) return no(`Es para ${s.planta}, no para esta planta.`);
    if (!s.planta_id) {
      const { rows: [p] } = await consulta('SELECT pack_id FROM plantas WHERE id = $1', [plantaId]);
      if (p?.pack_id !== s.pack_id) return no(`Es para una locación del ${s.pack}.`);
    }
  }
  // El horario pedido no bloquea: se avisa.
  const avisos = [];
  const hora = horaLocal(ahora);
  if (s.hora_desde && hora < s.hora_desde) avisos.push(`Llega antes del horario pedido (desde las ${s.hora_desde}).`);
  if (s.hora_hasta && hora > s.hora_hasta) avisos.push(`Está fuera del horario pedido (hasta las ${s.hora_hasta}).`);
  return { resultado: RESULTADO.HABILITADO, habilitado: true, motivo: '', avisos, solicitud: s };
}
