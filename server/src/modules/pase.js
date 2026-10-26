// QR del pase y su verificación. El QR no lleva el id plano ni datos personales: es un token firmado
// { p:'qr', s: id, v: qr_version } que portería valida contra el servidor. Subir qr_version revoca
// los QR anteriores. "Vigente" = aprobada (o adentro) y hoy dentro de las fechas aprobadas.
import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { fechaLocalISO, etiquetaEstado } from '@accesos/shared';
import { config } from '../config.js';
import { query } from '../db.js';
import { firmar, verificar } from '../firmas.js';
import { ErrorHttp } from '../middleware/errores.js';

export const pase = Router();

export const ESTADOS_CON_QR = ['aprobada', 'ingreso', 'egreso'];

export const tokenQr = (s) => firmar(config.QR_SECRET, { p: 'qr', s: Number(s.id), v: s.qr_version });
export const tokenPdf = (s) => firmar(config.QR_SECRET, { p: 'pdf', s: Number(s.id), v: s.qr_version });
export const urlQr = (s) => `${config.PUBLIC_URL}/q/${tokenQr(s)}`;
export const urlPdfFirmado = (s) => `${config.PUBLIC_URL}/api/comprobantes/${tokenPdf(s)}.pdf`;

export const qrSvg = (s) => QRCode.toString(urlQr(s), { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#15181b', light: '#ffffff' } });
export const qrPng = (s, ancho = 480) => QRCode.toBuffer(urlQr(s), { type: 'png', margin: 1, width: ancho, errorCorrectionLevel: 'M', color: { dark: '#15181b', light: '#ffffff' } });

const fecha = (iso) => iso.split('-').reverse().slice(0, 2).join('/');

/** Estado del pase para un instante dado: { vigente, motivo }. */
export function vigencia(s, hoy = fechaLocalISO()) {
  if (s.depurada_at) return { vigente: false, motivo: 'La solicitud está cerrada.' };
  // Después de un egreso el pase sigue valiendo dentro de sus fechas (visitas de varios días).
  if (!ESTADOS_CON_QR.includes(s.estado)) {
    return { vigente: false, motivo: `La solicitud está "${etiquetaEstado(s.estado).toLowerCase()}".` };
  }
  if (hoy < s.fecha_desde) return { vigente: false, todavia_no: true, motivo: `Vale desde el ${fecha(s.fecha_desde)}.` };
  if (hoy > s.fecha_hasta) return { vigente: false, motivo: `Venció el ${fecha(s.fecha_hasta)}.` };
  return { vigente: true, motivo: '' };
}

/** Carga la solicitud de un token del propósito pedido; null si el token no es válido o fue reemplazado. */
export async function solicitudDeToken(token, proposito) {
  const t = verificar(config.QR_SECRET, token);
  if (!t || t.p !== proposito || !Number.isInteger(t.s)) return null;
  const { rows: [s] } = await query(
    `SELECT s.id, s.numero, s.estado, s.qr_version, s.fecha_desde, s.fecha_hasta, s.depurada_at,
            pk.nombre AS pack, COALESCE(pl.nombre, NULLIF(s.otra_locacion, '')) AS planta,
            (SELECT count(*)::int FROM solicitud_personas sp WHERE sp.solicitud_id = s.id) AS personas
     FROM solicitudes s JOIN packs pk ON pk.id = s.pack_id LEFT JOIN plantas pl ON pl.id = s.planta_id
     WHERE s.id = $1`,
    [t.s],
  );
  if (!s) return null;
  if (s.qr_version !== t.v) return { ...s, reemplazado: true };
  return s;
}

// Verificación pública del QR: solo dice si vale, para qué fechas y destino. Sin datos personales.
pase.get('/verificar/:token', async (req, res) => {
  const token = z.string().max(400).parse(req.params.token);
  const s = await solicitudDeToken(token, 'qr');
  res.set('Cache-Control', 'no-store');
  if (!s) return res.json({ valido: false, motivo: 'El código no es un pase válido o está dañado.' });
  if (s.reemplazado) return res.json({ valido: false, numero: s.numero, motivo: 'Este QR fue reemplazado por uno nuevo.' });
  const { vigente, motivo, todavia_no: todaviaNo } = vigencia(s);
  res.json({
    valido: vigente, motivo, todavia_no: Boolean(todaviaNo), numero: s.numero, estado: s.estado,
    fecha_desde: s.fecha_desde, fecha_hasta: s.fecha_hasta, pack: s.pack, planta: s.planta, personas: s.personas,
  });
});

export function exigirToken(s) {
  if (!s || s.reemplazado) throw new ErrorHttp(404, 'El enlace no es válido o fue reemplazado.');
  return s;
}
