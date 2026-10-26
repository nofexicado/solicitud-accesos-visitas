// Catálogo público: packs con sus plantas, autorizantes por planta y requisitos HSE.
import { Router } from 'express';
import { z } from 'zod';
import { CATEGORIAS, CATEGORIAS_SIN_DOCUMENTOS } from '@accesos/shared';
import { query, leerConfiguracion } from '../db.js';

export const catalogo = Router();

catalogo.get('/catalogo/packs', async (_req, res) => {
  const { rows } = await query(`
    SELECT p.id, p.codigo, p.nombre, p.descripcion,
           COALESCE(json_agg(json_build_object('id', pl.id, 'codigo', pl.codigo, 'nombre', pl.nombre)
                    ORDER BY pl.orden, pl.nombre) FILTER (WHERE pl.id IS NOT NULL), '[]') AS plantas
    FROM packs p LEFT JOIN plantas pl ON pl.pack_id = p.id AND pl.activo
    WHERE p.activo
    GROUP BY p.id ORDER BY p.orden, p.nombre`);
  res.set('Cache-Control', 'public, max-age=300').json(rows);
});

/**
 * Categorías que van sin ART ni nómina, según configuracion.categorias_sin_documentos. Si el valor
 * guardado no es una lista de categorías conocidas, rige el valor por defecto (solo visitas).
 */
export async function categoriasSinDocumentos() {
  const valor = await leerConfiguracion('categorias_sin_documentos', CATEGORIAS_SIN_DOCUMENTOS);
  const r = z.array(z.enum(Object.keys(CATEGORIAS))).safeParse(valor);
  return r.success ? r.data : CATEGORIAS_SIN_DOCUMENTOS;
}

// Reglas que el asistente necesita para validar igual que el servidor.
catalogo.get('/catalogo/reglas', async (_req, res) => {
  res.set('Cache-Control', 'no-cache').json({ categorias_sin_documentos: await categoriasSinDocumentos() });
});

// Solo nombre e id: el invitado elige a quién se dirige, sin ver mails ni roles.
catalogo.get('/catalogo/plantas/:id/autorizantes', async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const { rows } = await query(
    `SELECT u.id, u.nombre FROM autorizante_plantas ap
     JOIN usuarios u ON u.id = ap.usuario_id AND u.activo
     JOIN plantas p ON p.id = ap.planta_id AND p.activo
     WHERE ap.planta_id = $1 ORDER BY u.nombre`,
    [id],
  );
  res.json(rows);
});

// Requisitos generales más los de la planta (si se pide una).
catalogo.get('/hse/requisitos', async (req, res) => {
  const planta = z.coerce.number().int().positive().optional().parse(req.query.planta || undefined);
  const { rows } = await query(
    `SELECT r.id, r.tipo, r.titulo, r.detalle, r.obligatorio, r.planta_id, pl.nombre AS planta
     FROM requisitos_hse r LEFT JOIN plantas pl ON pl.id = r.planta_id
     WHERE r.activo AND (r.planta_id IS NULL OR r.planta_id = $1)
     ORDER BY r.planta_id NULLS FIRST, r.tipo, r.orden`,
    [planta ?? null],
  );
  res.set('Cache-Control', 'public, max-age=300').json(rows);
});
