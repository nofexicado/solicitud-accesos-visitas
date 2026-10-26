import { describe, expect, it } from 'vitest';
import {
  esCuitValido, formatearCuit, esPatenteValida, tipoPatente, formatearPatente,
  esDocumentoValido, normalizarNumero, esNumeroValido, formatearNumero, esFechaISO,
} from '../src/index.js';

describe('CUIT', () => {
  it('acepta CUIT reales con o sin guiones', () => {
    expect(esCuitValido('33-69345023-9')).toBe(true); // AFIP
    expect(esCuitValido('30500010912')).toBe(true);
  });
  it('rechaza dígito verificador, prefijo y largo incorrectos', () => {
    expect(esCuitValido('33-69345023-8')).toBe(false);
    expect(esCuitValido('99-69345023-9')).toBe(false);
    expect(esCuitValido('3369345023')).toBe(false);
    expect(esCuitValido('')).toBe(false);
  });
  it('formatea', () => expect(formatearCuit('33693450239')).toBe('33-69345023-9'));
});

describe('Patentes', () => {
  it.each([
    ['abc 123', 'auto-vieja', 'ABC 123'],
    ['AB-123-CD', 'auto-mercosur', 'AB 123 CD'],
    ['A123BCD', 'moto-mercosur', 'A 123 BCD'],
    ['123abc', 'moto-vieja', '123 ABC'],
  ])('%s → %s', (entrada, tipo, formato) => {
    expect(tipoPatente(entrada)).toBe(tipo);
    expect(formatearPatente(entrada)).toBe(formato);
  });
  it('rechaza formatos inválidos', () => {
    expect(esPatenteValida('AB1234')).toBe(false);
    expect(esPatenteValida('ABCD12')).toBe(false);
  });
});

describe('Documentos', () => {
  it('DNI de 7 u 8 dígitos, con puntos', () => {
    expect(esDocumentoValido('dni', '30.123.456')).toBe(true);
    expect(esDocumentoValido('dni', '1234567')).toBe(true);
    expect(esDocumentoValido('dni', '123456')).toBe(false);
  });
  it('pasaporte alfanumérico', () => expect(esDocumentoValido('pasaporte', 'AAA123456')).toBe(true));
});

describe('Número de solicitud', () => {
  it('formatea y normaliza', () => {
    expect(formatearNumero(2026, 42)).toBe('ACC-2026-000042');
    expect(normalizarNumero('vel 2026 42')).toBe('ACC-2026-000042');
    expect(normalizarNumero('2026-000042')).toBe('ACC-2026-000042');
    expect(esNumeroValido('ACC-2026-000042')).toBe(true);
    expect(esNumeroValido('ACC-26-42')).toBe(false);
  });
});

describe('Fechas', () => {
  it('valida fechas reales', () => {
    expect(esFechaISO('2026-02-28')).toBe(true);
    expect(esFechaISO('2026-02-30')).toBe(false);
  });
});
