// Tokens firmados con HMAC-SHA256: base64url(json).base64url(firma).
// Se usan para el comprobante de inducción, el QR del pase y los links al PDF.
import crypto from 'node:crypto';

const b64 = (buf) => Buffer.from(buf).toString('base64url');

export function firmar(secreto, datos) {
  const cuerpo = b64(JSON.stringify(datos));
  const firma = crypto.createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

/** Devuelve los datos si la firma es válida; null si no. */
export function verificar(secreto, token) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const [cuerpo, firma, sobra] = token.split('.');
  if (!cuerpo || !firma || sobra !== undefined) return null;
  const esperada = crypto.createHmac('sha256', secreto).update(cuerpo).digest();
  const recibida = Buffer.from(firma, 'base64url');
  if (recibida.length !== esperada.length || !crypto.timingSafeEqual(recibida, esperada)) return null;
  try {
    return JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
