// Escaneo de archivos con Microsoft Defender antes de aceptarlos. Falla cerrada: solo el código 0
// (sin amenazas) con el archivo todavía en su lugar cuenta como limpio; amenaza (código 2), cualquier
// otro código, timeout o archivo desaparecido (lo puso en cuarentena la protección en tiempo real)
// se rechaza.
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { config } from '../config.js';
import { logger } from '../logger.js';

const MAX_EN_PARALELO = 2;
let activos = 0;
const espera = [];

async function turno() {
  if (activos < MAX_EN_PARALELO) { activos += 1; return; }
  await new Promise((resolve) => espera.push(resolve));
  activos += 1;
}
function liberar() {
  activos -= 1;
  espera.shift()?.();
}

function correrDefender(ruta) {
  return new Promise((resolve) => {
    execFile(
      config.AV_MPCMDRUN,
      ['-Scan', '-ScanType', '3', '-File', ruta, '-DisableRemediation'],
      { timeout: config.AV_TIMEOUT_SEG * 1000, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => resolve({ codigo: err ? (err.killed ? 'timeout' : err.code) : 0, salida: String(stdout ?? '') }),
    );
  });
}

/**
 * Devuelve { resultado: 'limpio' | 'amenaza' | 'error' | 'desactivado', detalle }.
 * Con AV_ENABLED=false (solo desarrollo) no escanea y devuelve 'desactivado'.
 */
export async function escanear(ruta) {
  if (!config.AV_ENABLED) return { resultado: 'desactivado', detalle: 'AV_ENABLED=false' };
  await turno();
  try {
    const { codigo, salida } = await correrDefender(ruta);
    const sigue = await fs.access(ruta).then(() => true, () => false);
    if (!sigue) return { resultado: 'amenaza', detalle: 'el archivo desapareció durante el escaneo (cuarentena)' };
    if (codigo === 0) return { resultado: 'limpio', detalle: '' };
    if (codigo === 2) return { resultado: 'amenaza', detalle: salida.split(/\r?\n/).find((l) => /threat|amenaza/i.test(l))?.trim() ?? 'amenaza detectada' };
    return { resultado: 'error', detalle: `MpCmdRun terminó con código ${codigo}` };
  } finally {
    liberar();
  }
}

export function avisoSiDesactivado() {
  if (!config.AV_ENABLED) {
    const nivel = config.esProduccion ? 'error' : 'warn';
    logger[nivel]('AV_ENABLED=false: los archivos subidos NO se escanean con Microsoft Defender. Solo aceptable en desarrollo.');
  }
}
