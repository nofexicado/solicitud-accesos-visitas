// "Mis solicitudes": las ligadas a este dispositivo, la consulta por N° + DNI/CUIT para traer una
// enviada desde otro equipo, y quitar una de este equipo.
import { Router } from 'express';
import { z } from 'zod';
import { normalizarNumero, normalizarCuit } from '@accesos/shared';
import { query } from '../db.js';
import { ErrorHttp } from '../middleware/errores.js';
import { limiteConsulta } from '../middleware/limites.js';
import { vigencia } from './pase.js';

export const misSolicitudes = Router();

misSolicitudes.get('/mis-solicitudes', async (req, res) => {
  const dispositivo = await req.dispositivo(false);
  if (!dispositivo) return res.json([]);
  const { rows } = await query(
    `SELECT s.numero, s.estado, s.categoria, e.razon_social AS empresa, pk.nombre AS pack,
            COALESCE(pl.nombre, NULLIF(s.otra_locacion, '')) AS planta, s.fecha_desde, s.fecha_hasta,
            s.created_at, s.depurada_at,
            (SELECT count(*)::int FROM solicitud_personas sp WHERE sp.solicitud_id = s.id) AS personas,
            (SELECT count(*)::int FROM solicitud_vehiculos sv WHERE sv.solicitud_id = s.id) AS vehiculos
     FROM dispositivo_solicitudes ds
     JOIN solicitudes s ON s.id = ds.solicitud_id
     JOIN empresas e ON e.id = s.empresa_id
     JOIN packs pk ON pk.id = s.pack_id
     LEFT JOIN plantas pl ON pl.id = s.planta_id
     WHERE ds.dispositivo_id = $1
     ORDER BY s.created_at DESC
     LIMIT 200`,
    [dispositivo],
  );
  res.set('Cache-Control', 'no-store').json(rows.map(({ depurada_at: _d, ...r }) => ({ ...r, vigente: vigencia({ ...r, depurada_at: _d }).vigente })));
});

// La respuesta es la misma si el número no existe o si el documento no coincide: el número solo
// (que es correlativo) no da acceso a nada.
const NO_ENCONTRADA = 'No encontramos una solicitud con esos datos. Revisá el número y el documento.';

misSolicitudes.post('/consulta', limiteConsulta, async (req, res) => {
  const { numero, documento } = z.object({
    numero: z.string().trim().max(30).transform(normalizarNumero),
    documento: z.string().trim().min(6, 'Ingresá el DNI, pasaporte o CUIT').max(20),
  }).parse(req.body);
  const doc = documento.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cuit = normalizarCuit(documento);
  const { rows: [s] } = await query(
    `SELECT s.id FROM solicitudes s JOIN empresas e ON e.id = s.empresa_id
     WHERE s.numero = $1 AND s.depurada_at IS NULL
       AND (e.cuit = $2 OR EXISTS (SELECT 1 FROM solicitud_personas p WHERE p.solicitud_id = s.id AND p.nro_doc = $3))`,
    [numero, cuit, doc],
  );
  if (!s) throw new ErrorHttp(404, NO_ENCONTRADA);
  const dispositivo = await req.dispositivo(true);
  await query('INSERT INTO dispositivo_solicitudes (dispositivo_id, solicitud_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [dispositivo, s.id]);
  res.json({ numero });
});

misSolicitudes.delete('/mis-solicitudes/:numero', async (req, res) => {
  const numero = z.string().max(30).parse(req.params.numero);
  const dispositivo = await req.dispositivo(false);
  if (dispositivo) {
    await query(
      'DELETE FROM dispositivo_solicitudes WHERE dispositivo_id = $1 AND solicitud_id = (SELECT id FROM solicitudes WHERE numero = $2)',
      [dispositivo, numero],
    );
  }
  res.status(204).end();
});
