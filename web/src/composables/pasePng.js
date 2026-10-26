// "Guardar pase": arma en el navegador una imagen PNG del pase (N°, QR y patente bien grandes) para
// tenerla en la galería del celular. No necesita conexión: usa los datos y el QR ya cargados.
import { formatearPatente } from '@accesos/shared';

const TINTA = '#15181b';
const GRIS = '#5b6168';
const VERDE = '#1f7a2d';
const FUENTE = '"Archivo Variable", "Archivo", system-ui, sans-serif';
// Misma barrera que LogoMark.vue (viewBox 0 0 56 40) y la palabra ACCESOS.
const BRAZO_RAYAS = 'M17 18h5l6-10h-5zM30 18h5l6-10h-5zM43 18h5l6-10h-5z';

const fecha = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '');

function cargarSvg(svg, lado) {
  const conTamano = svg.replace('<svg ', `<svg width="${lado}" height="${lado}" `);
  const url = URL.createObjectURL(new Blob([conTamano], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function texto(ctx, t, x, y, { tam, peso = 400, color = TINTA, ancho = 936, alinear = 'left' }) {
  ctx.font = `${peso} ${tam}px ${FUENTE}`;
  ctx.fillStyle = color;
  ctx.textAlign = alinear;
  let s = String(t);
  while (ctx.measureText(s).width > ancho && s.length > 4) s = `${s.slice(0, -2)}…`;
  ctx.fillText(s, x, y);
}

/** Dibuja el pase y devuelve un Blob PNG. d = detalle de la solicitud tal como lo devuelve la API. */
export async function pasePng(d, { estado = '' } = {}) {
  await Promise.all([document.fonts.load(`700 80px ${FUENTE}`), document.fonts.load(`400 32px ${FUENTE}`)]).catch(() => {});
  const W = 1080;
  const H = 1700;
  const lienzo = document.createElement('canvas');
  lienzo.width = W;
  lienzo.height = H;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Franja de barrera diagonal.
  ctx.fillStyle = TINTA;
  for (let x = -60; x < W + 60; x += 56) {
    ctx.beginPath();
    ctx.moveTo(x, 48); ctx.lineTo(x + 28, 48); ctx.lineTo(x + 28 + 27, 0); ctx.lineTo(x + 27, 0);
    ctx.fill();
  }

  // Logo.
  ctx.save();
  ctx.translate(72, 92);
  ctx.scale(1.5, 1.5);
  ctx.fillStyle = TINTA;
  ctx.beginPath(); ctx.roundRect(1, 6, 9, 33, 1.5); ctx.fill();
  ctx.fillStyle = '#299f2d';
  ctx.beginPath(); ctx.roundRect(8, 8, 48, 10, 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fill(new Path2D(BRAZO_RAYAS));
  ctx.restore();
  texto(ctx, 'ACCESOS', 72 + 100, 146, { tam: 44, peso: 700 });

  texto(ctx, 'Pase de acceso a yacimientos', 72, 210, { tam: 32, color: GRIS });
  texto(ctx, d.numero, 72, 300, { tam: 80, peso: 700 });
  if (estado) texto(ctx, estado, 72, 360, { tam: 36, peso: 600, color: d.vigente ? VERDE : GRIS });

  // QR grande, centrado, con margen blanco.
  if (d.qr_svg) {
    const qr = await cargarSvg(d.qr_svg, 620);
    ctx.drawImage(qr, (W - 620) / 2, 410, 620, 620);
  } else {
    ctx.fillStyle = '#e9ebe8';
    ctx.fillRect((W - 620) / 2, 410, 620, 620);
    texto(ctx, 'El QR aparece cuando se aprueba', W / 2, 730, { tam: 34, color: GRIS, alinear: 'center' });
  }

  // Patente, como en la chapa.
  const patentes = (d.vehiculos ?? []).map((v) => (v.patente ? formatearPatente(v.patente) : '')).filter(Boolean);
  texto(ctx, patentes.length > 1 ? 'Patentes' : 'Patente', 72, 1110, { tam: 30, color: GRIS });
  texto(ctx, patentes.length ? patentes.join('  ·  ') : 'Sin vehículo', 72, 1200, { tam: patentes.length > 1 ? 64 : 96, peso: 700 });

  const destino = [d.planta ?? (d.otra_locacion ? `Otra locación: ${d.otra_locacion}` : ''), d.pack].filter(Boolean).join(' · ');
  let y = 1290;
  for (const [k, v] of [['Empresa', d.empresa], ['Destino', destino], ['Fechas', `${fecha(d.fecha_desde)} al ${fecha(d.fecha_hasta)}${d.hora_desde ? ` · ${d.hora_desde} a ${d.hora_hasta ?? '—'}` : ''}`],
    ['Personas', (d.personas ?? []).map((p) => p.nombre_apellido).join(', ')]]) {
    texto(ctx, k, 72, y, { tam: 26, color: GRIS });
    texto(ctx, v || '—', 260, y, { tam: 32, peso: 500, ancho: 748 });
    y += 64;
  }
  texto(ctx, 'Mostralo en la recepción de la planta con el DNI de cada persona.', 72, H - 60, { tam: 28, color: GRIS });

  return new Promise((resolve) => lienzo.toBlob(resolve, 'image/png'));
}

/** Guarda la imagen: en el celular abre "Compartir" (Guardar imagen); si no, la descarga. */
export async function guardarPase(d, opciones) {
  const blob = await pasePng(d, opciones);
  const nombre = `pase-${d.numero}.png`;
  const archivo = new File([blob], nombre, { type: 'image/png' });
  if (navigator.canShare?.({ files: [archivo] }) && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ files: [archivo], title: `Pase ${d.numero}` }); return 'compartido'; } catch (e) { if (e.name === 'AbortError') return 'cancelado'; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'descargado';
}
