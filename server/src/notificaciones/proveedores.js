// Proveedores de envío, elegidos por MAIL_PROVIDER: SMTP (nodemailer) o Microsoft Graph (app
// registration con permiso de aplicación Mail.Send), por si Office 365 no permite SMTP con usuario
// y contraseña. Los dos reciben el mismo mensaje: { para, asunto, html, texto, adjuntos }.
import nodemailer from 'nodemailer';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { config } from '../config.js';

/** Qué falta para poder enviar; [] si está todo. */
export function faltantes() {
  const f = [];
  if (!config.MAIL_FROM) f.push('MAIL_FROM');
  if (config.MAIL_PROVIDER === 'smtp') {
    for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) if (!config[k]) f.push(k);
  } else {
    for (const k of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']) if (!config[k]) f.push(k);
  }
  return f;
}

let transporte;
async function enviarSmtp(m) {
  transporte ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    requireTLS: !config.SMTP_SECURE,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });
  await transporte.sendMail({
    from: { name: config.MAIL_FROM_NAME, address: config.MAIL_FROM },
    to: m.para,
    subject: m.asunto,
    html: m.html,
    text: m.texto,
    attachments: m.adjuntos.map((a) => ({ filename: a.nombre, content: a.contenido, contentType: a.tipo, cid: a.cid })),
  });
}

let msal;
async function enviarGraph(m) {
  msal ??= new ConfidentialClientApplication({
    auth: {
      clientId: config.GRAPH_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${config.GRAPH_TENANT_ID}`,
      clientSecret: config.GRAPH_CLIENT_SECRET,
    },
  });
  const { accessToken } = await msal.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] });
  const remitente = config.GRAPH_SENDER || config.MAIL_FROM;
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(remitente)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: m.asunto,
        body: { contentType: 'HTML', content: m.html },
        toRecipients: [{ emailAddress: { address: m.para } }],
        from: { emailAddress: { address: remitente, name: config.MAIL_FROM_NAME } },
        attachments: m.adjuntos.map((a) => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: a.nombre,
          contentType: a.tipo,
          contentBytes: Buffer.from(a.contenido).toString('base64'),
          ...(a.cid ? { contentId: a.cid, isInline: true } : {}),
        })),
      },
      saveToSentItems: false,
    }),
  });
  if (!res.ok) throw new Error(`Graph respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export const proveedorConfigurado = () => (config.MAIL_PROVIDER === 'graph' ? enviarGraph : enviarSmtp);
