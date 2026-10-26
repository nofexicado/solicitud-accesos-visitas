// Inducción de seguridad. El servidor mide el tiempo: firma un recibo al empezar el video y, si pasó
// al menos la duración (menos una tolerancia), firma el comprobante que viaja con la solicitud.
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { query, leerConfiguracion } from '../db.js';
import { config } from '../config.js';
import { firmar, verificar } from '../firmas.js';
import { ErrorHttp } from '../middleware/errores.js';

export const induccion = Router();

// Un comprobante sirve para enviar la solicitud durante este tiempo después de ver el video.
export const VIGENCIA_COMPROBANTE_MS = 48 * 3600 * 1000;

/** Video que corresponde a la planta (o el general activo si la planta no tiene uno propio). */
export async function videoParaPlanta(plantaId) {
  const { rows } = await query(
    `SELECT v.id, v.titulo, v.archivo, v.duracion_seg, v.version
     FROM videos_induccion v
     WHERE v.activo AND v.id = COALESCE(
       (SELECT pl.video_id FROM plantas pl WHERE pl.id = $1),
       (SELECT id FROM videos_induccion WHERE activo ORDER BY id LIMIT 1))`,
    [plantaId ?? null],
  );
  return rows[0] ?? null;
}

induccion.get('/induccion/video', async (req, res) => {
  const planta = z.coerce.number().int().positive().optional().parse(req.query.planta || undefined);
  const video = await videoParaPlanta(planta);
  if (!video) throw new ErrorHttp(404, 'No hay un video de inducción cargado. Avisale a tu contacto.');
  const { archivo, ...publico } = video;
  res.json({ ...publico, url: `/api/induccion/video/${video.id}/archivo` });
});

// Stream con soporte de Range (sendFile lo maneja): el navegador pide el video por partes.
induccion.get('/induccion/video/:id/archivo', async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const { rows } = await query('SELECT archivo FROM videos_induccion WHERE id = $1 AND activo', [id]);
  const archivo = rows[0]?.archivo;
  if (!archivo || path.basename(archivo) !== archivo) throw new ErrorHttp(404, 'Video no encontrado');
  res.sendFile(archivo, { root: config.dirs.videos, maxAge: '1h', headers: { 'Content-Type': 'video/mp4' } }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Video no encontrado' });
  });
});

induccion.post('/induccion/iniciar', async (req, res) => {
  const { video_id: videoId } = z.object({ video_id: z.number().int().positive() }).parse(req.body);
  const { rows } = await query('SELECT id FROM videos_induccion WHERE id = $1 AND activo', [videoId]);
  if (!rows.length) throw new ErrorHttp(404, 'Video no encontrado');
  const dispositivo = await req.dispositivo(true);
  res.json({ recibo: firmar(config.INDUCCION_SECRET, { t: 'ini', v: videoId, d: dispositivo, i: Date.now() }) });
});

induccion.post('/induccion/completar', async (req, res) => {
  const { recibo } = z.object({ recibo: z.string().max(1024) }).parse(req.body);
  const dispositivo = await req.dispositivo(false);
  const datos = verificar(config.INDUCCION_SECRET, recibo);
  if (!datos || datos.t !== 'ini' || datos.d !== dispositivo) throw new ErrorHttp(422, 'No pudimos validar la inducción. Volvé a ver el video desde el principio.');
  const { rows } = await query('SELECT duracion_seg FROM videos_induccion WHERE id = $1', [datos.v]);
  if (!rows.length) throw new ErrorHttp(422, 'El video cambió. Volvé a verlo desde el principio.');
  const tolerancia = Number(await leerConfiguracion('induccion_tolerancia_seg', 5));
  const fin = Date.now();
  const minimo = (rows[0].duracion_seg - tolerancia) * 1000;
  if (fin - datos.i < minimo) {
    throw new ErrorHttp(422, 'El video todavía no terminó. Miralo completo sin adelantarlo.', { faltan_seg: Math.ceil((minimo - (fin - datos.i)) / 1000) });
  }
  res.json({
    comprobante: firmar(config.INDUCCION_SECRET, { t: 'ok', v: datos.v, d: dispositivo, i: datos.i, f: fin }),
    fin: new Date(fin).toISOString(),
  });
});

/** Valida el comprobante al recibir la solicitud. Devuelve { video, inicio, fin } o lanza 422. */
export function leerComprobante(token, dispositivo) {
  const c = verificar(config.INDUCCION_SECRET, token);
  if (!c || c.t !== 'ok' || c.d !== dispositivo) throw new ErrorHttp(422, 'La inducción no es válida para este equipo. Volvé a ver el video.', { campos: { 'seguridad.induccion_comprobante': 'Volvé a ver el video de inducción' } });
  if (Date.now() - c.f > VIGENCIA_COMPROBANTE_MS) throw new ErrorHttp(422, 'Pasaron más de 48 horas desde la inducción. Volvé a ver el video.', { campos: { 'seguridad.induccion_comprobante': 'Volvé a ver el video de inducción' } });
  return { video: c.v, inicio: new Date(c.i), fin: new Date(c.f) };
}
