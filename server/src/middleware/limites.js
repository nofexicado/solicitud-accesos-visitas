// Rate limit por IP real del cliente (nginx la pasa en X-Real-IP; trust proxy = loopback).
import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';

const crear = (minutos, limite, mensaje, skip) =>
  rateLimit({
    skip,
    windowMs: minutos * 60 * 1000,
    limit: config.NODE_ENV === 'test' ? 10_000 : limite,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: mensaje },
  });

// El video de inducción se pide en muchos rangos: no cuenta para el límite general.
export const limiteGeneral = crear(1, 300, 'Demasiadas solicitudes. Esperá un minuto.', (req) => req.method === 'GET' && /^\/induccion\/video\/\d+\/archivo$/.test(req.path));
export const limiteEnvios = crear(15, 30, 'Demasiados envíos desde esta conexión. Esperá unos minutos.');
export const limiteUploads = crear(15, 60, 'Demasiados archivos subidos. Esperá unos minutos.');
export const limiteLogin = crear(15, 10, 'Demasiados intentos de ingreso desde esta conexión. Esperá 15 minutos.');
export const limiteConsulta = crear(15, 5, 'Demasiados intentos de consulta. Esperá 15 minutos.');
