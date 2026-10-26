// Protección CSRF para mutaciones: además de las cookies SameSite=Strict, toda request que modifica
// algo tiene que venir del mismo origen y traer el header propio que agrega el front.
import { config } from '../config.js';

const publico = new URL(config.PUBLIC_URL);
// En desarrollo, localhost y 127.0.0.1 son el mismo equipo, y además del servidor de Vite vale
// `vite preview` (4173), que sirve el build para probar el service worker.
const ORIGENES = new Set([publico.origin]);
if (!config.esProduccion && ['localhost', '127.0.0.1'].includes(publico.hostname)) {
  for (const h of ['localhost', '127.0.0.1']) {
    for (const puerto of [publico.port, '4173']) ORIGENES.add(`${publico.protocol}//${h}${puerto ? `:${puerto}` : ''}`);
  }
}
const SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function mismoOrigen(req, res, next) {
  if (SEGUROS.has(req.method)) return next();
  const origen = req.get('origin');
  const valido = origen ? ORIGENES.has(origen) : true; // sin Origin: clientes no navegador (curl, tests)
  if (!valido || req.get('x-requested-with') !== 'accesos') {
    return res.status(403).json({ error: 'Solicitud rechazada por seguridad. Recargá la página e intentá de nuevo.' });
  }
  next();
}
