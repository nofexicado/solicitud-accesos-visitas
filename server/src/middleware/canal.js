// Canal de la request: "interno" (LAN) o "externo" (internet). Lo fija nginx con X-Canal y solo se
// cree si la conexión viene de loopback; cualquier otra cosa es externo (falla cerrada).
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function canal(req, _res, next) {
  const desdeNginx = LOOPBACK.has(req.socket.remoteAddress);
  req.canal = desdeNginx && req.get('x-canal') === 'interno' ? 'interno' : 'externo';
  next();
}

/** Responde 404 (no revela que la ruta existe) si la request no viene del canal pedido. */
export const requireCanal = (esperado) => (req, res, next) =>
  req.canal === esperado ? next() : res.status(404).json({ error: 'No encontrado' });
