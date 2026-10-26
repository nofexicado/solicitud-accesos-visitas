// Subida de documentos del invitado. Orden: multer a data/tmp → tipo real por magic bytes →
// Microsoft Defender → recién ahí se mueve a data/uploads y queda como upload temporal del
// dispositivo (48 h) hasta que la solicitud lo tome.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { fileTypeFromFile } from 'file-type';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { query, leerConfiguracion } from '../db.js';
import { ErrorHttp } from '../middleware/errores.js';
import { limiteUploads } from '../middleware/limites.js';
import { escanear } from './antivirus.js';

export const uploads = Router();

const TIPOS_POR_DEFECTO = ['application/pdf', 'image/jpeg', 'image/png'];
const VIGENCIA = '48 hours';

const recibir = multer({
  storage: multer.diskStorage({
    destination: config.dirs.tmp,
    filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: config.UPLOAD_MAX_MB * 1024 * 1024, files: 1, fields: 2, fieldSize: 100 },
}).single('archivo');

function multerComoPromesa(req, res) {
  return new Promise((resolve, reject) => recibir(req, res, (err) => {
    if (!err) return resolve();
    if (err.code === 'LIMIT_FILE_SIZE') return reject(new ErrorHttp(413, `El archivo supera los ${config.UPLOAD_MAX_MB} MB. Achicalo o escanealo con menos resolución.`));
    if (err instanceof multer.MulterError) return reject(new ErrorHttp(400, 'Subí un solo archivo por vez.'));
    reject(err);
  }));
}

const hash = (ruta) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(ruta).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
});

/** Nombre para mostrar: sin rutas ni caracteres de control. En disco el archivo es siempre un uuid. */
const limpiarNombre = (n) => path.basename(String(n ?? 'archivo')).replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_').slice(0, 200) || 'archivo';

uploads.post('/uploads', limiteUploads, async (req, res) => {
  const dispositivo = await req.dispositivo(true);
  await multerComoPromesa(req, res);
  if (!req.file) throw new ErrorHttp(400, 'No llegó ningún archivo.');
  const tmp = req.file.path;
  try {
    const permitidos = await leerConfiguracion('upload_tipos', TIPOS_POR_DEFECTO);
    const tipo = await fileTypeFromFile(tmp);
    if (!tipo || !permitidos.includes(tipo.mime)) throw new ErrorHttp(422, 'Solo se aceptan archivos PDF, JPG o PNG.');

    const sha256 = await hash(tmp);
    const av = await escanear(tmp);
    if (av.resultado === 'amenaza' || av.resultado === 'error') {
      // Se loguea el hash, nunca el contenido.
      logger.warn({ sha256, resultado: av.resultado, detalle: av.detalle }, 'upload rechazado por el antivirus');
      throw new ErrorHttp(422, 'No pudimos aceptar el archivo. Probá con otro o pedile a tu empresa una copia nueva.');
    }

    const id = crypto.randomUUID();
    await fsp.rename(tmp, path.join(config.dirs.uploads, id));
    const nombre = limpiarNombre(req.file.originalname);
    await query(
      `INSERT INTO uploads_temporales (id, dispositivo_id, archivo, nombre_original, mime_real, tamano, sha256, av_escaneado_at, expira)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '${VIGENCIA}')`,
      [id, dispositivo, id, nombre, tipo.mime, req.file.size, sha256, av.resultado === 'limpio' ? new Date() : null],
    );
    res.status(201).json({ id, nombre, tamano: req.file.size, mime: tipo.mime });
  } finally {
    await fsp.rm(tmp, { force: true });
  }
});

uploads.delete('/uploads/:id', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const dispositivo = await req.dispositivo(false);
  const { rows } = await query('DELETE FROM uploads_temporales WHERE id = $1 AND dispositivo_id = $2 RETURNING archivo', [id, dispositivo]);
  if (rows[0]) await fsp.rm(path.join(config.dirs.uploads, rows[0].archivo), { force: true });
  res.status(204).end();
});

/** Borra los uploads que nadie usó en 48 h (archivo y fila). Lo llama el job de limpieza. */
export async function limpiarUploadsVencidos() {
  const { rows } = await query('DELETE FROM uploads_temporales WHERE expira < now() RETURNING archivo');
  await Promise.all(rows.map((r) => fsp.rm(path.join(config.dirs.uploads, r.archivo), { force: true })));
  return rows.length;
}
