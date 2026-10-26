// Comprobante en PDF generado en el servidor: logo, franja de barrera, datos, personas, vehículos y
// el QR si el pase está aprobado. Archivo estático (latin) para el texto; el logo en vectores.
import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import { CATEGORIAS, etiquetaEstado, formatearCuit, formatearPatente } from '@accesos/shared';
import { ESTADOS_CON_QR, qrPng, urlQr, vigencia } from './pase.js';

const require = createRequire(import.meta.url);
// WOFF (no WOFF2): fontkit lo embebe como TrueType y todos los visores lo muestran.
const FUENTE = (peso) => require.resolve(`@fontsource/archivo/files/archivo-latin-${peso}-normal.woff`);

const TINTA = '#15181b';
const GRIS = '#5b6168';
const VERDE = '#299f2d';
const LINEA = '#e3e5e2';
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 40"><rect x="1" y="6" width="9" height="33" rx="1.5" fill="${TINTA}"/><rect x="8" y="8" width="48" height="10" rx="2" fill="${VERDE}"/><path d="M17 18h5l6-10h-5zM30 18h5l6-10h-5zM43 18h5l6-10h-5z" fill="#ffffff"/></svg>`;

const fecha = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');

/** Devuelve un Buffer con el PDF. `s` es el detalle de la solicitud (con id, qr_version, personas…). */
export async function generarPdf(s) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Pase ${s.numero}`, Author: 'Accesos a yacimientos' } });
  doc.registerFont('texto', FUENTE(400));
  doc.registerFont('medio', FUENTE(600));
  doc.registerFont('negrita', FUENTE(700));
  const partes = [];
  doc.on('data', (p) => partes.push(p));
  const fin = new Promise((resolve) => doc.on('end', resolve));

  const ancho = doc.page.width;
  const izq = 48;
  const util = ancho - 96;

  // Franja de barrera diagonal con el flanco del triángulo (29,3°).
  doc.save().rect(0, 0, ancho, 22).clip();
  for (let x = -30; x < ancho + 30; x += 28) {
    doc.polygon([x, 22], [x + 14, 22], [x + 14 + 12.3, 0], [x + 12.3, 0]).fill(TINTA);
  }
  doc.restore();

  SVGtoPDF(doc, LOGO, izq, 48, { width: 34, height: 24, preserveAspectRatio: 'xMinYMin meet' });
  doc.font('negrita').fontSize(17).fillColor(TINTA).text('ACCESOS', izq + 42, 53, { characterSpacing: 0.8 });
  doc.font('texto').fontSize(10).fillColor(GRIS).text('Pase de acceso a yacimientos', izq, 80);
  doc.font('negrita').fontSize(24).fillColor(TINTA).text(s.numero, izq, 100);

  const conQr = ESTADOS_CON_QR.includes(s.estado) && !s.depurada_at;
  const { vigente, motivo } = vigencia(s);
  const estadoTexto = conQr ? (vigente ? 'Habilitado' : `${etiquetaEstado(s.estado)} · ${motivo}`) : etiquetaEstado(s.estado);
  if (conQr && vigente) doc.polygon([izq, 136], [izq + 11, 136], [izq + 5.5, 145.7]).fill(VERDE);
  doc.font('medio').fontSize(11).fillColor(conQr && vigente ? '#1f7a2d' : GRIS).text(estadoTexto, izq + (conQr && vigente ? 16 : 0), 134, { width: util - 190 });
  // La patente, grande: es lo primero que mira recepción junto con el QR.
  const patentes = s.vehiculos.map((v) => (v.patente ? formatearPatente(v.patente) : '')).filter(Boolean);
  doc.font('texto').fontSize(8.5).fillColor(GRIS).text(patentes.length > 1 ? 'Patentes' : 'Patente', izq, 164);
  doc.font('negrita').fontSize(20).fillColor(TINTA).text(patentes.length ? patentes.join('   ') : 'Sin vehículo', izq, 176, { width: util - 190 });

  // QR (o su lugar) arriba a la derecha.
  const qrX = ancho - 48 - 150;
  if (conQr) {
    doc.image(await qrPng(s, 600), qrX, 50, { width: 150 });
    doc.font('texto').fontSize(7.5).fillColor(GRIS).text('Recepción lo valida contra el sistema.', qrX, 204, { width: 150, align: 'center' });
  } else {
    doc.roundedRect(qrX, 50, 150, 150, 4).fill('#e9ebe8');
    doc.font('texto').fontSize(9).fillColor(GRIS).text('El QR aparece cuando la solicitud se aprueba.', qrX + 16, 112, { width: 118, align: 'center' });
  }

  // Datos principales en dos columnas de pares.
  let y = 236;
  const fila = (k, v, x, w) => {
    doc.font('texto').fontSize(8.5).fillColor(GRIS).text(k, x, y);
    doc.font('medio').fontSize(10.5).fillColor(TINTA).text(v || '—', x, y + 11, { width: w });
  };
  const pares = [
    ['Empresa', s.empresa], ['CUIT', formatearCuit(s.cuit)],
    ['Destino', [s.planta ?? (s.otra_locacion ? `Otra locación: ${s.otra_locacion}` : ''), s.pack].filter(Boolean).join(' · ')], ['Fechas', `${fecha(s.fecha_desde)} al ${fecha(s.fecha_hasta)}`],
    ['Solicitante', s.solicitante_nombre], ['Horario', s.hora_desde || s.hora_hasta ? `${s.hora_desde ?? '—'} a ${s.hora_hasta ?? '—'}` : 'Sin horario fijo'],
    ['Visita a', s.contacto_interno], ['Categoría', CATEGORIAS[s.categoria] ?? s.categoria],
  ];
  for (let i = 0; i < pares.length; i += 2) {
    fila(pares[i][0], pares[i][1], izq, util / 2 - 16);
    fila(pares[i + 1][0], pares[i + 1][1], izq + util / 2, util / 2);
    y += 38;
  }

  const tabla = (titulo, columnas, filas) => {
    y += 12;
    doc.font('negrita').fontSize(12).fillColor(TINTA).text(titulo, izq, y);
    y += 22;
    let x = izq;
    columnas.forEach(([c, w]) => { doc.font('texto').fontSize(8.5).fillColor(GRIS).text(c, x, y, { width: w }); x += w; });
    y += 15;
    doc.moveTo(izq, y).lineTo(izq + util, y).lineWidth(0.6).strokeColor(LINEA).stroke();
    for (const f of filas) {
      if (y > doc.page.height - 110) { doc.addPage(); y = 48; }
      y += 6;
      x = izq;
      f.forEach((v, i) => { doc.font('texto').fontSize(10).fillColor(TINTA).text(v, x, y, { width: columnas[i][1] - 8 }); x += columnas[i][1]; });
      y += 16;
      doc.moveTo(izq, y).lineTo(izq + util, y).lineWidth(0.4).strokeColor(LINEA).stroke();
    }
  };
  tabla(`Personas (${s.personas.length})`, [['Nombre y apellido', 230], ['Documento', 140], ['Cargo', util - 370]],
    s.personas.map((p) => [p.nombre_apellido, `${p.tipo_doc === 'dni' ? 'DNI' : 'Pasaporte'} ${p.nro_doc ?? '—'}`, p.cargo]));
  if (s.vehiculos.length) {
    tabla(`Vehículos (${s.vehiculos.length})`, [['Patente', 110], ['Marca y modelo', 190], ['Seguro hasta', 110], ['VTV hasta', util - 410]],
      s.vehiculos.map((v) => [v.patente ? formatearPatente(v.patente) : '—', v.marca_modelo, fecha(v.vto_seguro), fecha(v.vto_vtv)]));
  }

  // Pie: qué hacer en portería y cómo verificar.
  const pie = doc.page.height - 104;
  doc.moveTo(izq, pie).lineTo(izq + util, pie).lineWidth(0.6).strokeColor(LINEA).stroke();
  doc.font('medio').fontSize(9.5).fillColor(TINTA).text('Presentá este pase y el DNI o pasaporte de cada persona en portería, con el equipo de protección indicado.', izq, pie + 10, { width: util });
  doc.font('texto').fontSize(8).fillColor(GRIS).text(
    conQr ? `Verificación: ${urlQr(s).slice(0, 60)}…  ·  Generado el ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Ushuaia', hourCycle: 'h23' })}` : `Generado el ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Ushuaia', hourCycle: 'h23' })}`,
    izq, pie + 38, { width: util },
  );

  doc.end();
  await fin;
  return Buffer.concat(partes);
}
