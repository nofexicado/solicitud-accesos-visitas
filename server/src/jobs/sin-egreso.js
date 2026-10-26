// Al cierre del día: si queda gente adentro sin egreso, HSE recibe un aviso con el enlace a la
// lista para cerrarlos. La hora sale de configuracion.cierre_dia_hora (20:00 por defecto).
import { leerConfiguracion, transaccion } from '../db.js';
import { logger } from '../logger.js';
import { encolar } from '../notificaciones/cola.js';
import { casillasHse } from '../modules/avisos.js';
import { sinEgreso } from '../modules/control.js';

export async function avisarSinEgreso() {
  const { personas } = await sinEgreso();
  if (!personas.length) return 0;
  await transaccion(async (c) => {
    for (const d of await casillasHse(c)) await encolar(c, { destinatario: d, plantilla: 'sin_egreso', payload: { cantidad: personas.length } });
  });
  return personas.length;
}

/** Lee la hora de cierre y deja programado el aviso (lo agenda quien llama, con node-cron). */
export async function programarAvisoSinEgreso(agendar) {
  let hora = String(await leerConfiguracion('cierre_dia_hora', '20:00'));
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    logger.warn({ hora }, 'cierre_dia_hora inválida: se usa 20:00');
    hora = '20:00';
  }
  agendar(hora, avisarSinEgreso);
}
