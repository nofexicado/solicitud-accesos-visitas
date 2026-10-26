import { describe, expect, it } from 'vitest';
import { puedeEjecutar, transicion, TRANSICIONES, ESTADOS } from '../src/index.js';

describe('Máquina de estados', () => {
  it('HSE valida antes que el autorizante (dos etapas en serie)', () => {
    expect(puedeEjecutar('tomar_hse', 'enviada', ['hse'])).toBe(true);
    expect(puedeEjecutar('validar_hse', 'validacion_hse', ['hse'])).toBe(true);
    expect(puedeEjecutar('aprobar', 'validacion_hse', ['autorizante'])).toBe(false);
    expect(puedeEjecutar('aprobar', 'pendiente_autorizacion', ['autorizante'])).toBe(true);
  });
  it('cada rol solo ejecuta lo suyo', () => {
    expect(puedeEjecutar('aprobar', 'pendiente_autorizacion', ['hse'])).toBe(false);
    expect(puedeEjecutar('validar_hse', 'validacion_hse', ['autorizante'])).toBe(false);
    expect(puedeEjecutar('vencer', 'aprobada', ['admin'])).toBe(false);
  });
  it('no hay transiciones desde estados finales salvo reingreso', () => {
    expect(transicion('aprobar', 'rechazada')).toBe(null);
    expect(transicion('vencer', 'ingreso')).toBe(null);
    expect(transicion('registrar_ingreso', 'egreso')?.hacia).toBe('ingreso');
  });
  it('todas las transiciones apuntan a estados existentes', () => {
    for (const t of Object.values(TRANSICIONES)) {
      expect(ESTADOS[t.hacia]).toBeDefined();
      t.desde.forEach((d) => expect(ESTADOS[d]).toBeDefined());
    }
  });
});
