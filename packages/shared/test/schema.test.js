import { describe, expect, it } from 'vitest';
import {
  pasoSolicitante, pasoDestino, pasoMotivo, pasoPersonal, pasoSeguridad,
  alertasVehiculo, erroresPorCampo, fechaLocalISO, esquemaDocumentos,
} from '../src/index.js';

const manana = () => {
  const d = new Date(`${fechaLocalISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

describe('Paso 1', () => {
  it('normaliza el CUIT y el email', () => {
    const r = pasoSolicitante.parse({
      razon_social: 'Servicios Australes SRL', cuit: '33-69345023-9', solicitante_nombre: 'Ana Pérez',
      email: 'Ana@Australes.com.ar', telefono: '+54 2964 555-555',
    });
    expect(r.cuit).toBe('33693450239');
    expect(r.email).toBe('ana@australes.com.ar');
  });
  it('explica un CUIT inválido', () => {
    const r = pasoSolicitante.safeParse({
      razon_social: 'X SA', cuit: '33-69345023-8', solicitante_nombre: 'Ana Pérez', email: 'a@b.com', telefono: '2964555555',
    });
    expect(erroresPorCampo(r.error).cuit).toMatch(/dígito verificador/);
  });
});

describe('Paso 2', () => {
  it('exige planta u otra locación, y autorizante o pendiente de asignación', () => {
    const e = erroresPorCampo(pasoDestino.safeParse({ pack_id: 1, contacto_interno: 'Juan Gómez' }).error);
    expect(e.planta_id).toBeDefined();
    expect(e.autorizante_id).toBeDefined();
    const ok = pasoDestino.safeParse({ pack_id: 1, planta_id: 2, contacto_interno: 'Juan Gómez', pendiente_asignacion: true });
    expect(ok.success).toBe(true);
  });
});

describe('Paso 3', () => {
  const base = { categoria: 'visita', motivo: 'Recorrida por la planta compresora', hora_desde: '', hora_hasta: '' };
  it('rechaza fechas pasadas', () => {
    const r = pasoMotivo.safeParse({ ...base, fecha_desde: '2020-01-01', fecha_hasta: '2020-01-02' });
    expect(erroresPorCampo(r.error).fecha_desde).toBeDefined();
  });
  it('rechaza hasta anterior a desde', () => {
    const r = pasoMotivo.safeParse({ ...base, fecha_desde: manana(), fecha_hasta: fechaLocalISO() });
    expect(erroresPorCampo(r.error).fecha_hasta).toBeDefined();
  });
  it('acepta hoy → mañana', () => {
    expect(pasoMotivo.safeParse({ ...base, fecha_desde: fechaLocalISO(), fecha_hasta: manana() }).success).toBe(true);
  });
});

describe('Paso 4', () => {
  const p = { nombre_apellido: 'Ana Pérez', tipo_doc: 'dni', nro_doc: '30.123.456', cargo: 'Supervisora' };
  it('pide al menos una persona', () => {
    expect(pasoPersonal.safeParse({ personas: [] }).success).toBe(false);
  });
  it('detecta documentos repetidos aunque estén escritos distinto', () => {
    const r = pasoPersonal.safeParse({ personas: [p, { ...p, nro_doc: '30123456' }] });
    expect(erroresPorCampo(r.error)['personas.1.nro_doc']).toBe('Documento repetido');
  });
  it('avisa seguro o VTV que vencen antes del fin de la visita', () => {
    expect(alertasVehiculo({ vto_seguro: '2026-01-01', vto_vtv: '2027-01-01' }, '2026-06-01')).toHaveLength(1);
  });
});

describe('Paso 6', () => {
  it('requiere aceptar HSE', () => {
    expect(pasoSeguridad.safeParse({ induccion_comprobante: 'x'.repeat(30), acepta_hse: false }).success).toBe(false);
  });
});

describe('Paso 5', () => {
  const uuid = '7f9c1d2e-4b3a-4c5d-8e6f-0a1b2c3d4e5f';
  it('pide ART y nómina a un contratista', () => {
    const r = esquemaDocumentos('contratista').safeParse({});
    expect(Object.keys(erroresPorCampo(r.error))).toEqual(['doc_art', 'doc_nomina']);
  });
  it('no se los pide a una visita', () => {
    expect(esquemaDocumentos('visita').parse({})).toEqual({ doc_art: null, doc_nomina: null });
    expect(esquemaDocumentos('visita').parse({ doc_art: uuid }).doc_art).toBe(uuid);
  });
  it('toma la lista de categorías sin documentos que le pasen', () => {
    expect(esquemaDocumentos('auditoria', ['visita', 'auditoria']).parse({})).toEqual({ doc_art: null, doc_nomina: null });
    expect(esquemaDocumentos('visita', []).safeParse({}).success).toBe(false);
  });
});
