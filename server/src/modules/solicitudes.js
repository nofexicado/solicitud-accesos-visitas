// Envío de solicitudes del invitado. Todo en una transacción: numeración por año, empresa,
// personas, vehículos, documentos (tomados de los uploads del dispositivo), historial y liga al
// dispositivo. La Idempotency-Key evita duplicados si el navegador reintenta.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { esquemaSolicitud, formatearNumero, fechaLocalISO } from '@accesos/shared';
import { config } from '../config.js';
import { query, transaccion } from '../db.js';
import { logger } from '../logger.js';
import { ErrorHttp } from '../middleware/errores.js';
import { limiteEnvios } from '../middleware/limites.js';
import { leerComprobante, videoParaPlanta } from './induccion.js';
import { categoriasSinDocumentos } from './catalogo.js';
import { alEnviar, casillasHse } from './avisos.js';
import { encolar } from '../notificaciones/cola.js';
import { ESTADOS_CON_QR, exigirToken, qrSvg, solicitudDeToken, vigencia } from './pase.js';
import { generarPdf } from './pdf.js';
import { cargarDetalle } from './detalle.js';

export { cargarDetalle };

export const solicitudes = Router();

const errorCampo = (campo, mensaje, status = 422) => new ErrorHttp(status, mensaje, { campos: { [campo]: mensaje } });

async function numeroExistente(clave, dispositivo) {
  const { rows } = await query('SELECT numero, creado_por_dispositivo FROM solicitudes WHERE idempotency_key = $1', [clave]);
  if (!rows[0]) return null;
  if (rows[0].creado_por_dispositivo !== dispositivo) throw new ErrorHttp(409, 'Esa solicitud ya fue enviada desde otro equipo.');
  return rows[0].numero;
}

/** Destino válido: el pack existe y está activo, la planta es del pack y el autorizante es de la planta. */
async function validarDestino(destino) {
  const { rows: [pack] } = await query('SELECT id FROM packs WHERE id = $1 AND activo', [destino.pack_id]);
  if (!pack) throw errorCampo('destino.pack_id', 'El pack elegido ya no está disponible');
  if (destino.planta_id) {
    const { rowCount } = await query('SELECT 1 FROM plantas WHERE id = $1 AND pack_id = $2 AND activo', [destino.planta_id, destino.pack_id]);
    if (!rowCount) throw errorCampo('destino.planta_id', 'La planta elegida no pertenece al pack');
  }
  if (destino.autorizante_id) {
    const { rowCount } = await query(
      `SELECT 1 FROM autorizante_plantas ap JOIN usuarios u ON u.id = ap.usuario_id AND u.activo
       WHERE ap.usuario_id = $1 AND ap.planta_id = $2`,
      [destino.autorizante_id, destino.planta_id],
    );
    if (!rowCount) throw errorCampo('destino.autorizante_id', 'Esa persona no autoriza visitas a la planta elegida');
  }
}

solicitudes.post('/solicitudes', limiteEnvios, async (req, res) => {
  const clave = z.uuid({ error: 'Falta la clave de envío. Recargá la página.' }).parse(req.get('idempotency-key'));
  const dispositivo = await req.dispositivo(false);
  if (!dispositivo) throw new ErrorHttp(422, 'No reconocemos este equipo. Volvé a ver la inducción y a subir los documentos.');

  const repetida = await numeroExistente(clave, dispositivo);
  if (repetida) return res.status(200).json({ numero: repetida, repetida: true });

  const d = esquemaSolicitud(await categoriasSinDocumentos()).parse(req.body);
  const induccion = leerComprobante(d.seguridad.induccion_comprobante, dispositivo);
  const video = await videoParaPlanta(d.destino.planta_id);
  if (!video || video.id !== induccion.video) throw errorCampo('seguridad.induccion_comprobante', 'La inducción corresponde a otro video. Volvé a verla.');
  await validarDestino(d.destino);

  try {
    const numero = await transaccion(async (c) => {
      // Documentos: tienen que ser uploads de este equipo, sin vencer.
      const docs = [];
      for (const [campo, tipo] of [['doc_art', 'art'], ['doc_nomina', 'nomina']]) {
        const id = d.documentos[campo];
        if (!id) continue;
        const { rows: [u] } = await c.query(
          'SELECT * FROM uploads_temporales WHERE id = $1 AND dispositivo_id = $2 AND expira > now() FOR UPDATE',
          [id, dispositivo],
        );
        if (!u) throw errorCampo(`documentos.${campo}`, 'El archivo venció o no se encontró: volvé a subirlo');
        docs.push({ ...u, tipo });
      }

      // La razón social que ya existe para el CUIT no se pisa desde el portal público.
      const { rows: [empresa] } = await c.query(
        `INSERT INTO empresas (cuit, razon_social) VALUES ($1, $2)
         ON CONFLICT (cuit) DO UPDATE SET cuit = EXCLUDED.cuit RETURNING id`,
        [d.solicitante.cuit, d.solicitante.razon_social],
      );
      const anio = Number(fechaLocalISO().slice(0, 4));
      const { rows: [cont] } = await c.query(
        `INSERT INTO solicitud_contadores (anio, ultimo) VALUES ($1, 1)
         ON CONFLICT (anio) DO UPDATE SET ultimo = solicitud_contadores.ultimo + 1 RETURNING ultimo`,
        [anio],
      );
      const numero = formatearNumero(anio, cont.ultimo);
      const { rows: [invitado] } = await c.query("SELECT id FROM usuarios WHERE es_invitado AND activo ORDER BY id LIMIT 1");

      const { rows: [s] } = await c.query(
        `INSERT INTO solicitudes (numero, estado, empresa_id, solicitante_nombre, email, telefono, pack_id, planta_id,
           otra_locacion, contacto_interno, autorizante_id, categoria, contrato_ref, motivo, fecha_desde, fecha_hasta,
           hora_desde, hora_hasta, induccion_video_id, induccion_inicio, induccion_fin, epp_aceptado_at,
           idempotency_key, creado_por_usuario, creado_por_dispositivo, ip)
         VALUES ($1,'enviada',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now(),$21,$22,$23,$24)
         RETURNING id`,
        [numero, empresa.id, d.solicitante.solicitante_nombre, d.solicitante.email, d.solicitante.telefono,
          d.destino.pack_id, d.destino.planta_id, d.destino.otra_locacion, d.destino.contacto_interno,
          d.destino.autorizante_id, d.motivo.categoria, d.motivo.contrato_ref, d.motivo.motivo,
          d.motivo.fecha_desde, d.motivo.fecha_hasta, d.motivo.hora_desde || null, d.motivo.hora_hasta || null,
          induccion.video, induccion.inicio, induccion.fin, clave, invitado?.id ?? null, dispositivo, req.ip],
      );

      for (const p of d.personal.personas) {
        await c.query('INSERT INTO solicitud_personas (solicitud_id, nombre_apellido, tipo_doc, nro_doc, cargo) VALUES ($1,$2,$3,$4,$5)',
          [s.id, p.nombre_apellido, p.tipo_doc, p.nro_doc, p.cargo]);
      }
      for (const v of d.personal.vehiculos) {
        await c.query('INSERT INTO solicitud_vehiculos (solicitud_id, patente, marca_modelo, vto_seguro, vto_vtv) VALUES ($1,$2,$3,$4,$5)',
          [s.id, v.patente, v.marca_modelo, v.vto_seguro, v.vto_vtv]);
      }
      for (const u of docs) {
        await c.query(
          `INSERT INTO documentos (solicitud_id, tipo, nombre_original, archivo, mime_real, tamano, sha256, av_escaneado_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [s.id, u.tipo, u.nombre_original, u.archivo, u.mime_real, u.tamano, u.sha256, u.av_escaneado_at],
        );
        await c.query('DELETE FROM uploads_temporales WHERE id = $1', [u.id]);
      }
      // El historial nunca guarda datos personales: solo datos de proceso.
      await c.query(
        `INSERT INTO solicitud_eventos (solicitud_id, estado_anterior, estado_nuevo, accion, usuario_id, actor, detalle, ip)
         VALUES ($1, NULL, 'enviada', 'enviar', $2, 'invitado', $3, $4)`,
        [s.id, invitado?.id ?? null, { personas: d.personal.personas.length, vehiculos: d.personal.vehiculos.length, documentos: docs.length }, req.ip],
      );
      await c.query('INSERT INTO dispositivo_solicitudes (dispositivo_id, solicitud_id) VALUES ($1, $2)', [dispositivo, s.id]);
      await alEnviar(c, s.id);
      return numero;
    });
    logger.info({ numero }, 'solicitud enviada');
    res.status(201).json({ numero });
  } catch (err) {
    // Dos envíos simultáneos con la misma clave: gana uno y el otro devuelve el mismo número.
    if (err.code === '23505' && String(err.constraint).includes('idempotency')) {
      const numero = await numeroExistente(clave, dispositivo);
      if (numero) return res.status(200).json({ numero, repetida: true });
    }
    throw err;
  }
});

/** Lo que ve el invitado: sin ids internos; con QR y PDF cuando la solicitud tiene pase. */
export async function paraInvitado(s) {
  const { id, qr_version: _v, ...publico } = s;
  const conPase = ESTADOS_CON_QR.includes(s.estado) && !s.depurada_at;
  const pase = vigencia(s);
  return {
    ...publico,
    // El estado del pase va aparte: "motivo" es el motivo de la visita.
    vigente: pase.vigente,
    motivo_pase: pase.motivo,
    qr_svg: conPase ? await qrSvg(s) : null,
    pdf: `/api/solicitudes/${encodeURIComponent(s.numero)}/comprobante.pdf`,
  };
}

solicitudes.get('/solicitudes/:numero', async (req, res) => {
  const numero = z.string().max(20).parse(req.params.numero);
  const s = await cargarDetalle({ numero, dispositivo: await req.dispositivo(false) });
  if (!s) throw new ErrorHttp(404, 'No encontramos esa solicitud en este equipo.');
  res.set('Cache-Control', 'no-store').json(await paraInvitado(s));
});

// Reemplazo de un documento que HSE observó. El archivo nuevo pasó por la misma subida (tipo real y
// Defender) y tiene que ser de este equipo. El documento vuelve a "pendiente" y se avisa a HSE.
solicitudes.post('/solicitudes/:numero/documentos/:tipo/reemplazo', limiteEnvios, async (req, res) => {
  const numero = z.string().max(20).parse(req.params.numero);
  const tipo = z.enum(['art', 'nomina', 'otro']).parse(req.params.tipo);
  const { upload_id: uploadId } = z.object({ upload_id: z.uuid({ error: 'Subí el archivo corregido' }) }).parse(req.body);
  const dispositivo = await req.dispositivo(false);
  if (!dispositivo) throw new ErrorHttp(404, 'No encontramos esa solicitud en este equipo.');

  const anterior = await transaccion(async (c) => {
    const { rows: [sol] } = await c.query(
      `SELECT s.id, s.estado FROM solicitudes s
       JOIN dispositivo_solicitudes ds ON ds.solicitud_id = s.id AND ds.dispositivo_id = $2
       WHERE s.numero = $1 FOR UPDATE OF s`, [numero, dispositivo]);
    if (!sol) throw new ErrorHttp(404, 'No encontramos esa solicitud en este equipo.');
    const { rows: [doc] } = await c.query(
      "SELECT id, archivo FROM documentos WHERE solicitud_id = $1 AND tipo = $2 AND estado_revision = 'observado' FOR UPDATE",
      [sol.id, tipo]);
    if (!doc || !['enviada', 'validacion_hse'].includes(sol.estado)) {
      throw new ErrorHttp(409, 'Ese documento no está observado: no hace falta reemplazarlo.');
    }
    const { rows: [u] } = await c.query(
      'SELECT * FROM uploads_temporales WHERE id = $1 AND dispositivo_id = $2 AND expira > now() FOR UPDATE', [uploadId, dispositivo]);
    if (!u) throw new ErrorHttp(422, 'El archivo venció o no se encontró: volvé a subirlo', { campos: { upload_id: 'Volvé a subir el archivo' } });

    // La observación queda a la vista de HSE hasta que lo acepte u observe de nuevo.
    await c.query(
      `UPDATE documentos SET nombre_original = $2, archivo = $3, mime_real = $4, tamano = $5, sha256 = $6,
              av_escaneado_at = $7, subido_at = now(), estado_revision = 'pendiente', revisado_por = NULL, revisado_at = NULL
       WHERE id = $1`,
      [doc.id, u.nombre_original, u.archivo, u.mime_real, u.tamano, u.sha256, u.av_escaneado_at]);
    await c.query('DELETE FROM uploads_temporales WHERE id = $1', [u.id]);
    const { rows: [invitado] } = await c.query('SELECT id FROM usuarios WHERE es_invitado AND activo ORDER BY id LIMIT 1');
    await c.query(
      `INSERT INTO solicitud_eventos (solicitud_id, accion, usuario_id, actor, detalle, ip)
       VALUES ($1, 'reemplazar_documento', $2, 'invitado', $3, $4)`,
      [sol.id, invitado?.id ?? null, { documento: tipo }, req.ip]);

    // Aviso a quien la tiene tomada en HSE; si nadie (o ya no está activo), a todo HSE.
    const { rows: [quien] } = await c.query(
      `SELECT u.email FROM solicitud_eventos e JOIN usuarios u ON u.id = e.usuario_id AND u.activo
       WHERE e.solicitud_id = $1 AND e.accion = 'tomar_hse' ORDER BY e.created_at DESC, e.id DESC LIMIT 1`, [sol.id]);
    for (const d of quien ? [quien.email] : await casillasHse(c)) {
      await encolar(c, { destinatario: d, plantilla: 'documento_reemplazado', solicitudId: sol.id, payload: { documento: tipo } });
    }
    return doc.archivo;
  });
  // El archivo anterior se borra después del COMMIT.
  if (anterior) await fsp.rm(path.join(config.dirs.uploads, anterior), { force: true });
  logger.info({ numero, tipo }, 'documento reemplazado');
  res.json(await paraInvitado(await cargarDetalle({ numero, dispositivo })));
});

const enviarPdf = async (res, s) => {
  const pdf = await generarPdf(s);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="pase-${s.numero}.pdf"`,
    'Cache-Control': 'no-store',
  }).send(pdf);
};

solicitudes.get('/solicitudes/:numero/comprobante.pdf', async (req, res) => {
  const numero = z.string().max(20).parse(req.params.numero);
  const s = await cargarDetalle({ numero, dispositivo: await req.dispositivo(false) });
  if (!s) throw new ErrorHttp(404, 'No encontramos esa solicitud en este equipo.');
  await enviarPdf(res, s);
});

// Link firmado del mail de aprobación: sirve desde cualquier equipo mientras la versión del QR no cambie.
solicitudes.get('/comprobantes/:token.pdf', async (req, res) => {
  const t = exigirToken(await solicitudDeToken(z.string().max(400).parse(req.params.token), 'pdf'));
  await enviarPdf(res, await cargarDetalle({ id: t.id }));
});
