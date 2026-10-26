// Manda un mail de prueba con el proveedor configurado (MAIL_PROVIDER), sin pasar por la cola.
// Sirve para probar la casilla antes de poner MAIL_ENABLED=true.
//   node scripts/send-test-mail.js persona@ejemplo.com
import { config } from '../src/config.js';
import { ADJUNTO_CABECERA, PLANTILLAS } from '../src/notificaciones/plantillas.js';
import { faltantes, proveedorConfigurado } from '../src/notificaciones/proveedores.js';

const para = process.argv[2];
if (!para || !para.includes('@')) {
  console.error('Uso: node scripts/send-test-mail.js destinatario@dominio');
  process.exit(1);
}
const falta = faltantes();
if (falta.length) {
  console.error(`Falta configurar en server/.env: ${falta.join(', ')} (proveedor ${config.MAIL_PROVIDER}).`);
  process.exit(1);
}
if (!config.MAIL_ENABLED) console.warn('Aviso: MAIL_ENABLED=false. Este script envía igual; la cola sigue sin enviar hasta activarlo.');
const m = PLANTILLAS.prueba();
try {
  await proveedorConfigurado()({ para, asunto: m.asunto, html: m.html, texto: m.texto, adjuntos: [ADJUNTO_CABECERA] });
  console.log(`Enviado a ${para} por ${config.MAIL_PROVIDER} desde ${config.MAIL_FROM}.`);
} catch (err) {
  console.error(`No se pudo enviar por ${config.MAIL_PROVIDER}: ${err.message}`);
  if (config.MAIL_PROVIDER === 'smtp' && /auth|535|5\.7\./i.test(err.message)) {
    console.error('Si Office 365 rechaza el usuario y contraseña, probá MAIL_PROVIDER=graph con una app registration con Mail.Send.');
  }
  process.exit(1);
}
