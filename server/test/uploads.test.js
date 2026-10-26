import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { equipo } from './ayuda.js';
import { config } from '../src/config.js';

// PDF mínimo válido (los magic bytes alcanzan para file-type).
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]);
const subir = (e, buf, nombre) => e.agente.post('/api/uploads').set('X-Requested-With', 'accesos').attach('archivo', buf, nombre);

afterEach(() => { config.AV_ENABLED = false; });

describe('uploads', () => {
  it('acepta un PDF y lo guarda fuera de la carpeta pública con nombre uuid', async () => {
    const e = equipo();
    const r = await subir(e, PDF, 'ART octubre.pdf');
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ nombre: 'ART octubre.pdf', mime: 'application/pdf', tamano: PDF.length });
    expect(fs.existsSync(path.join(config.dirs.uploads, r.body.id))).toBe(true);
    expect(fs.readdirSync(config.dirs.tmp)).toHaveLength(0);
  });

  it('rechaza un ejecutable renombrado a .pdf (magic bytes)', async () => {
    const r = await subir(equipo(), EXE, 'factura.pdf');
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/PDF, JPG o PNG/);
    expect(fs.readdirSync(config.dirs.tmp)).toHaveLength(0);
  });

  it('rechaza archivos de más del límite', async () => {
    const grande = Buffer.concat([PDF, Buffer.alloc(config.UPLOAD_MAX_MB * 1024 * 1024 + 10)]);
    const r = await subir(equipo(), grande, 'grande.pdf');
    expect(r.status).toBe(413);
  });

  it('si Defender falla, el archivo se rechaza (falla cerrada)', async () => {
    config.AV_ENABLED = true;
    const original = config.AV_MPCMDRUN;
    config.AV_MPCMDRUN = process.execPath; // node.exe con "-Scan" termina con error: no es un resultado limpio
    try {
      const r = await subir(equipo(), PDF, 'art.pdf');
      expect(r.status).toBe(422);
      expect(r.body.error).toMatch(/No pudimos aceptar el archivo/);
    } finally {
      config.AV_MPCMDRUN = original;
    }
  });

  it('solo el equipo que lo subió puede borrarlo', async () => {
    const a = equipo();
    const { body } = await subir(a, PDF, 'a.pdf');
    await equipo().del(`/api/uploads/${body.id}`);
    expect(fs.existsSync(path.join(config.dirs.uploads, body.id))).toBe(true);
    await a.del(`/api/uploads/${body.id}`);
    expect(fs.existsSync(path.join(config.dirs.uploads, body.id))).toBe(false);
  });
});
