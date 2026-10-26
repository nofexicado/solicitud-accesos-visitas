import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { query } from '../src/db.js';
import { config } from '../src/config.js';
import { procesarCola, armarMensaje } from '../src/notificaciones/cola.js';
import { esc } from '../src/notificaciones/plantillas.js';
import { alCambiarEstado } from '../src/modules/avisos.js';
import { transaccion } from '../src/db.js';
import { equipoListo, solicitud, enviar } from './fabrica.js';

afterEach(() => { config.MAIL_ENABLED = false; });
// La cola procesa de a 10 por antigüedad: cada test arranca con la cola vacía.
beforeEach(() => query("UPDATE notificaciones_cola SET estado = 'enviado' WHERE estado <> 'enviado'"));

async function enviada(cambios) {
  const listo = await equipoListo();
  const r = await enviar(listo.e, solicitud(listo, cambios));
  const { rows: [s] } = await query('SELECT id FROM solicitudes WHERE numero = $1', [r.body.numero]);
  return s.id;
}
const cola = (id) => query('SELECT plantilla, destinatario, estado, intentos, ultimo_error FROM notificaciones_cola WHERE solicitud_id = $1 ORDER BY id', [id]).then((r) => r.rows);

describe('mails', () => {
  it('al enviar se encola "recibida" para el solicitante, y "aviso_hse" para cada casilla de HSE', async () => {
    await query(`UPDATE configuracion SET valor = '["hse@ejemplo.test"]' WHERE clave = 'notificar_hse'`);
    try {
      const id = await enviada();
      expect(await cola(id)).toEqual([
        expect.objectContaining({ plantilla: 'recibida', destinatario: 'mojeda@ejemplo.com', estado: 'pendiente' }),
        expect.objectContaining({ plantilla: 'aviso_hse', destinatario: 'hse@ejemplo.test', estado: 'pendiente' }),
      ]);
    } finally {
      await query(`UPDATE configuracion SET valor = '[]' WHERE clave = 'notificar_hse'`);
    }
  });

  it('con MAIL_ENABLED=false no envía nada y los deja pendientes', async () => {
    const id = await enviada();
    expect(await procesarCola()).toEqual({ omitido: 'MAIL_ENABLED=false' });
    expect((await cola(id))[0].estado).toBe('pendiente');
  });

  it('activado sin casilla configurada tampoco envía', async () => {
    config.MAIL_ENABLED = true;
    const r = await procesarCola();
    expect(r.omitido).toMatch(/falta/);
  });

  it('al activarlo salen los pendientes; si falla queda en error y se reintenta más tarde', async () => {
    const id = await enviada();
    const enviados = [];
    await procesarCola({ enviar: async (m) => enviados.push(m) });
    const [recibida] = await cola(id);
    expect(recibida.estado).toBe('enviado');
    const m = enviados.find((x) => x.asunto.includes('Recibimos'));
    expect(m.html).toContain('cid:cabecera');
    expect(m.adjuntos[0].cid).toBe('cabecera');

    const id2 = await enviada();
    await procesarCola({ enviar: async () => { throw new Error('535 auth failed'); } });
    const [fallo] = await cola(id2);
    expect(fallo).toMatchObject({ estado: 'error', intentos: 1, ultimo_error: '535 auth failed' });
    // No se reintenta antes de su próximo intento.
    await procesarCola({ enviar: async () => {} });
    expect((await cola(id2))[0].estado).toBe('error');
  });

  it('aprobada lleva el QR en línea y el link firmado al PDF; rechazada lleva el motivo', async () => {
    const id = await enviada();
    await query("UPDATE solicitudes SET estado = 'aprobada' WHERE id = $1", [id]);
    await transaccion((c) => alCambiarEstado(c, id, 'aprobada'));
    const fila = (await query("SELECT * FROM notificaciones_cola WHERE solicitud_id = $1 AND plantilla = 'aprobada'", [id])).rows[0];
    const m = await armarMensaje(fila);
    expect(m.html).toContain('cid:qr');
    expect(m.html).toMatch(/\/api\/comprobantes\/[\w-]+\.[\w-]+\.pdf/);
    // En línea la cabecera y el QR; además, el pase en PDF como adjunto.
    expect(m.adjuntos.filter((a) => a.cid).map((a) => a.cid)).toEqual(['cabecera', 'qr']);
    expect(m.adjuntos.some((a) => a.tipo === 'application/pdf')).toBe(true);

    await query("UPDATE solicitudes SET estado = 'rechazada', motivo_rechazo = $2 WHERE id = $1", [id, 'La ART <vence> antes']);
    await transaccion((c) => alCambiarEstado(c, id, 'rechazada'));
    const r = await armarMensaje((await query("SELECT * FROM notificaciones_cola WHERE solicitud_id = $1 AND plantilla = 'rechazada'", [id])).rows[0]);
    expect(r.html).toContain('La ART &lt;vence&gt; antes');
  });

  it('escapa el HTML de los datos del usuario', () => {
    expect(esc('<script>"x"</script>')).toBe('&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
  });
});
