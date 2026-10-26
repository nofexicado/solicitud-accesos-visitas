// Errores: los esperables viajan como ErrorHttp con un mensaje para mostrar; el resto se loguea
// completo y el cliente recibe un mensaje genérico, sin detalles internos.
import { ZodError } from 'zod';
import { erroresPorCampo } from '@accesos/shared';
import { logger } from '../logger.js';

export class ErrorHttp extends Error {
  constructor(status, mensaje, extra = {}) {
    super(mensaje);
    this.status = status;
    this.extra = extra;
  }
}

export function noEncontrado(_req, res) {
  res.status(404).json({ error: 'No encontrado' });
}

// eslint-disable-next-line no-unused-vars
export function manejarErrores(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(422).json({ error: 'Revisá los datos marcados', campos: erroresPorCampo(err) });
  }
  if (err instanceof ErrorHttp) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El envío es demasiado grande' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'El envío no es JSON válido' });
  logger.error({ err, metodo: req.method, ruta: req.originalUrl }, 'error no controlado');
  res.status(500).json({ error: 'Algo falló de nuestro lado. Intentá de nuevo en unos minutos.' });
}
