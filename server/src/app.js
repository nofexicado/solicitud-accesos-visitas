// Aplicación Express. index.js la levanta; los tests la importan directo.
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { canal, requireCanal } from './middleware/canal.js';
import { mismoOrigen } from './middleware/seguridad.js';
import { dispositivo } from './middleware/dispositivo.js';
import { limiteGeneral } from './middleware/limites.js';
import { manejarErrores, noEncontrado } from './middleware/errores.js';
import { catalogo } from './modules/catalogo.js';
import { induccion } from './modules/induccion.js';
import { uploads } from './modules/uploads.js';
import { solicitudes } from './modules/solicitudes.js';
import { pase } from './modules/pase.js';
import { misSolicitudes } from './modules/mis-solicitudes.js';
import { auth, requireRol, sesion } from './modules/auth.js';
import { operador } from './modules/operador.js';
import { control } from './modules/control.js';

export function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  // Solo nginx (en loopback) es proxy de confianza: de ahí sale la IP real del cliente.
  app.set('trust proxy', 'loopback');

  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  }));
  app.use(canal);
  app.use(cookieParser());
  app.use(express.json({ limit: '300kb' }));

  const api = express.Router();
  api.use(limiteGeneral, mismoOrigen, dispositivo);
  api.get('/canal', (req, res) => res.json({ canal: req.canal }));
  api.use(catalogo);
  api.use(induccion);
  api.use(uploads);
  api.use(solicitudes);
  api.use(pase);
  api.use(misSolicitudes);
  // Solo desde la LAN (nginx interno): desde internet estas rutas no existen (404).
  api.use('/auth', requireCanal('interno'), auth);
  api.use('/operador', requireCanal('interno'), sesion, requireRol('hse', 'autorizante'), operador);
  api.use('/control', requireCanal('interno'), sesion, control);
  api.use(noEncontrado);

  app.use('/api', api);
  app.use(noEncontrado);
  app.use(manejarErrores);
  return app;
}
