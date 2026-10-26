// Plantillas HTML de los mails, con la identidad del portal. Tablas y estilos en línea para que se vean
// bien en Outlook y en webmails. Todo valor variable pasa por esc() (sin HTML del usuario).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATEGORIAS, formatearCuit } from '@accesos/shared';
import { config } from '../config.js';

const CABECERA = fs.readFileSync(fileURLToPath(new URL('../../assets/cabecera-mail.png', import.meta.url)));
const TINTA = '#15181b';
const GRIS = '#5b6168';
const FUENTE = "font-family:Archivo,'Segoe UI',Arial,sans-serif";

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const destino = (s) => [s.planta ?? (s.otra_locacion ? `Otra locación: ${s.otra_locacion}` : ''), s.pack].filter(Boolean).join(' · ');

function filas(pares) {
  return pares.filter(([, v]) => v).map(([k, v]) => `
    <tr><td style="${FUENTE};font-size:13px;color:${GRIS};padding:6px 16px 6px 0;vertical-align:top;white-space:nowrap">${esc(k)}</td>
        <td style="${FUENTE};font-size:15px;color:${TINTA};padding:6px 0">${esc(v)}</td></tr>`).join('');
}

function boton(texto, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr>
    <td style="background:${TINTA};border-radius:4px"><a href="${esc(href)}" style="${FUENTE};display:inline-block;padding:13px 22px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">${esc(texto)}</a></td>
  </tr></table>`;
}

function marco({ titulo, intro, cuerpo = '', pie = '' }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:#f2f3f1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f3f1"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden">
    <tr><td><img src="cid:cabecera" width="600" alt="Accesos a yacimientos" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>
    <tr><td style="padding:8px 32px 32px">
      <h1 style="${FUENTE};font-size:24px;line-height:1.25;color:${TINTA};margin:0 0 12px;font-weight:700">${esc(titulo)}</h1>
      <p style="${FUENTE};font-size:16px;line-height:1.5;color:${TINTA};margin:0 0 16px">${intro}</p>
      ${cuerpo}
    </td></tr>
    <tr><td style="padding:16px 32px 28px;border-top:1px solid #e3e5e2">
      <p style="${FUENTE};font-size:13px;line-height:1.5;color:${GRIS};margin:0">${pie || 'Este mail lo envía el portal de accesos a yacimientos. Si tenés dudas, respondé a este mensaje con el número de solicitud.'}</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

const datosSolicitud = (s) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0">${filas([
  ['Solicitud', s.numero],
  ['Empresa', `${s.empresa} (${formatearCuit(s.cuit)})`],
  ['Destino', destino(s)],
  ['Fechas', `${fecha(s.fecha_desde)} al ${fecha(s.fecha_hasta)}`],
  ['Personas', String(s.personas.length)],
  ['Categoría', CATEGORIAS[s.categoria]],
])}</table>`;

const urlMisSolicitudes = () => `${config.PUBLIC_URL}/mis-solicitudes`;
const urlSolicitud = (s) => `${config.PUBLIC_URL}/mis-solicitudes/${encodeURIComponent(s.numero)}`;
const DOCUMENTO = { art: 'el certificado de ART', nomina: 'la nómina del personal', otro: 'un documento' };
const urlOperador = (s) => `${config.PUBLIC_URL}/operador/${encodeURIComponent(s.numero)}`;

/**
 * plantilla → ({ s, extra }) => { asunto, html, texto, adjuntos }. `s` es el detalle de la solicitud
 * cargado al momento de enviar. Los adjuntos con cid se muestran en línea.
 */
export const PLANTILLAS = {
  recibida: ({ s }) => ({
    asunto: `Recibimos tu solicitud ${s.numero}`,
    html: marco({
      titulo: 'Recibimos tu solicitud',
      intro: `Hola ${esc(s.solicitante_nombre)}: la solicitud <b>${esc(s.numero)}</b> ya está en manos de HSE, que revisa la documentación y la inducción. Después la autoriza el responsable de la planta.`,
      cuerpo: `${datosSolicitud(s)}${boton('Ver el estado', urlMisSolicitudes())}
        <p style="${FUENTE};font-size:14px;line-height:1.5;color:${GRIS};margin:8px 0 0">Desde otro equipo, consultala con el número y tu DNI o el CUIT de la empresa.</p>`,
    }),
    texto: `Recibimos tu solicitud ${s.numero} para ${destino(s)} del ${fecha(s.fecha_desde)} al ${fecha(s.fecha_hasta)}. HSE la está revisando. Estado: ${urlMisSolicitudes()}`,
  }),

  aprobada: ({ s, qrPng, urlPdf, pdf }) => ({
    asunto: `Acceso aprobado: ${s.numero}`,
    html: marco({
      titulo: 'Tu acceso está aprobado',
      intro: `La solicitud <b>${esc(s.numero)}</b> pasó HSE y la autorizó el responsable de la planta. Presentá este QR y el DNI o pasaporte de cada persona en portería.`,
      cuerpo: `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px"><tr>
          <td style="padding:12px;background:#ffffff;border:1px solid #e3e5e2;border-radius:6px"><img src="cid:qr" width="180" height="180" alt="QR del pase ${esc(s.numero)}" style="display:block;border:0"></td>
          <td style="padding-left:20px;vertical-align:middle">
            <p style="${FUENTE};font-size:15px;color:#1f7a2d;font-weight:700;margin:0 0 6px">&#9660; Habilitado</p>
            <p style="${FUENTE};font-size:15px;color:${TINTA};margin:0">del ${esc(fecha(s.fecha_desde))} al ${esc(fecha(s.fecha_hasta))}</p>
          </td></tr></table>
        ${datosSolicitud(s)}${boton('Descargar el pase en PDF', urlPdf)}`,
      pie: 'En la ruta puede no haber señal: guardá el PDF adjunto o abrí el pase antes de salir. El QR se valida en la recepción de la planta; si cambian las fechas o se revoca, el anterior deja de valer. No lo compartas fuera de tu equipo de trabajo.',
    }),
    texto: `Tu acceso ${s.numero} está aprobado del ${fecha(s.fecha_desde)} al ${fecha(s.fecha_hasta)} para ${destino(s)}. Descargá el pase: ${urlPdf}`,
    adjuntos: [
      { nombre: 'qr.png', tipo: 'image/png', contenido: qrPng, cid: 'qr' },
      ...(pdf ? [{ nombre: `pase-${s.numero}.pdf`, tipo: 'application/pdf', contenido: pdf }] : []),
    ],
  }),

  rechazada: ({ s }) => ({
    asunto: `Solicitud ${s.numero} rechazada`,
    html: marco({
      titulo: 'No pudimos aprobar tu solicitud',
      intro: `La solicitud <b>${esc(s.numero)}</b> fue rechazada. Este es el motivo:`,
      cuerpo: `<p style="${FUENTE};font-size:16px;line-height:1.5;color:#831c1e;background:#ffedea;border-radius:4px;padding:14px 16px;margin:0 0 16px">${esc(s.motivo_rechazo || 'Sin motivo indicado.')}</p>
        ${datosSolicitud(s)}
        <p style="${FUENTE};font-size:15px;line-height:1.5;color:${TINTA};margin:16px 0 0">Podés enviar una solicitud nueva con lo que faltaba corregido.</p>
        ${boton('Hacer una solicitud nueva', `${config.PUBLIC_URL}/solicitud/nueva`)}`,
    }),
    texto: `La solicitud ${s.numero} fue rechazada. Motivo: ${s.motivo_rechazo || 'sin motivo indicado'}. Podés enviar una nueva: ${config.PUBLIC_URL}/solicitud/nueva`,
  }),

  sin_egreso: ({ payload }) => ({
    asunto: `${payload.cantidad} ${payload.cantidad === 1 ? 'persona sigue' : 'personas siguen'} sin egreso`,
    html: marco({
      titulo: 'Hay personas sin egreso registrado',
      intro: `Al cierre del día, ${payload.cantidad === 1 ? 'una persona figura' : `${payload.cantidad} personas figuran`} adentro de una planta sin egreso registrado. Confirmá con cada planta y cerralas desde el panel.`,
      cuerpo: boton('Ver la lista', `${config.PUBLIC_URL}/operador/sin-egreso`),
      pie: 'El enlace abre el panel de operador; funciona solo desde la red interna.',
    }),
    texto: `${payload.cantidad} personas sin egreso registrado. Lista: ${config.PUBLIC_URL}/operador/sin-egreso`,
  }),

  validada_hse: ({ s }) => ({
    asunto: `HSE validó tu solicitud ${s.numero}`,
    html: marco({
      titulo: 'Pasaste la validación de HSE',
      intro: `HSE revisó la documentación y la inducción de la solicitud <b>${esc(s.numero)}</b>. Ahora la tiene que autorizar el responsable de la planta; te avisamos apenas lo haga.`,
      cuerpo: `${datosSolicitud(s)}${boton('Ver el estado', urlMisSolicitudes())}`,
    }),
    texto: `HSE validó tu solicitud ${s.numero}. Falta la autorización de la planta. Estado: ${urlMisSolicitudes()}`,
  }),

  aviso_hse: ({ s }) => ({
    asunto: `Nueva solicitud para revisar: ${s.numero}`,
    html: marco({
      titulo: 'Hay una solicitud para revisar',
      intro: `<b>${esc(s.empresa)}</b> pidió acceso a ${esc(destino(s))}. Revisá la documentación y la inducción.`,
      cuerpo: `${datosSolicitud(s)}${boton('Abrir el expediente', urlOperador(s))}`,
      pie: 'El enlace abre el panel de operador; funciona solo desde la red interna.',
    }),
    texto: `Nueva solicitud ${s.numero} de ${s.empresa} para ${destino(s)}. Expediente: ${urlOperador(s)}`,
  }),

  documento_observado: ({ s, payload }) => ({
    asunto: `Hay que corregir un documento de ${s.numero}`,
    html: marco({
      titulo: 'HSE observó un documento',
      intro: `Revisando la solicitud <b>${esc(s.numero)}</b>, HSE observó ${esc(DOCUMENTO[payload.documento] ?? 'un documento')}:`,
      cuerpo: `<p style="${FUENTE};font-size:16px;line-height:1.5;color:#8a4b05;background:#fff7e0;border-radius:4px;padding:14px 16px;margin:0 0 16px">${esc(payload.observacion)}</p>
        <p style="${FUENTE};font-size:15px;line-height:1.5;color:${TINTA};margin:0">Subí el archivo corregido desde tu solicitud. Hasta que HSE lo acepte, la solicitud no avanza.</p>
        ${boton('Reemplazar el documento', urlSolicitud(s))}
        <p style="${FUENTE};font-size:14px;line-height:1.5;color:${GRIS};margin:8px 0 0">Si la abrís desde otro equipo, consultala con el número y tu DNI o el CUIT de la empresa.</p>`,
    }),
    texto: `HSE observó ${DOCUMENTO[payload.documento] ?? 'un documento'} de la solicitud ${s.numero}: ${payload.observacion}. Reemplazalo desde ${urlSolicitud(s)}`,
  }),

  documento_reemplazado: ({ s, payload }) => ({
    asunto: `Documento reemplazado en ${s.numero}`,
    html: marco({
      titulo: 'El solicitante subió el documento corregido',
      intro: `${esc(s.empresa)} reemplazó ${esc(DOCUMENTO[payload.documento] ?? 'un documento')} de la solicitud <b>${esc(s.numero)}</b>. Quedó pendiente de revisión.`,
      cuerpo: `${datosSolicitud(s)}${boton('Revisar el documento', urlOperador(s))}`,
      pie: 'El enlace abre el panel de operador; funciona solo desde la red interna.',
    }),
    texto: `${s.empresa} reemplazó ${DOCUMENTO[payload.documento] ?? 'un documento'} de ${s.numero}. Revisalo: ${urlOperador(s)}`,
  }),

  sin_autorizante: ({ s }) => ({
    asunto: `Sin autorizante en la planta: ${s.numero}`,
    html: marco({
      titulo: 'Una solicitud validada no tiene quién la autorice',
      intro: `HSE validó la solicitud <b>${esc(s.numero)}</b> de ${esc(s.empresa)}, pero ${esc(destino(s))} no tiene autorizantes cargados. Asigná uno desde el expediente o cargá un autorizante para la planta.`,
      cuerpo: `${datosSolicitud(s)}${boton('Abrir el expediente', urlOperador(s))}`,
      pie: 'El enlace abre el panel de operador; funciona solo desde la red interna.',
    }),
    texto: `La solicitud ${s.numero} de ${s.empresa} está validada pero ${destino(s)} no tiene autorizantes. Expediente: ${urlOperador(s)}`,
  }),

  aviso_autorizante: ({ s, payload = {} }) => ({
    asunto: `Solicitud para autorizar: ${s.numero}`,
    html: marco({
      titulo: 'Una visita espera tu autorización',
      intro: `HSE ya validó la solicitud <b>${esc(s.numero)}</b> de ${esc(s.empresa)}. Falta tu aprobación.${payload.compartida ? ' Este aviso les llegó a todos los autorizantes de la planta: queda asignada a quien la tome primero.' : ''}`,
      cuerpo: `${datosSolicitud(s)}${boton('Revisar y autorizar', urlOperador(s))}`,
      pie: 'El enlace abre el panel de operador; funciona solo desde la red interna.',
    }),
    texto: `La solicitud ${s.numero} de ${s.empresa} espera tu autorización: ${urlOperador(s)}`,
  }),

  prueba: () => ({
    asunto: 'Mail de prueba del portal de accesos',
    html: marco({ titulo: 'La configuración de mails funciona', intro: `Este mail salió del portal de accesos (${esc(config.PUBLIC_URL)}) con el proveedor <b>${esc(config.MAIL_PROVIDER)}</b>.` }),
    texto: `La configuración de mails del portal de accesos funciona (proveedor ${config.MAIL_PROVIDER}).`,
  }),
};

export const ADJUNTO_CABECERA = { nombre: 'cabecera.png', tipo: 'image/png', contenido: CABECERA, cid: 'cabecera' };
