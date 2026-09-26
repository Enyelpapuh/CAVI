import { describe, it, expect } from 'vitest';
import { evaluarEstado, DIAS_GRACIA } from '../../../lib/estadoPrestamo';

describe('evaluarEstado', () => {
  it('marca al dia un prestamo vigente sin atraso', () => {
    expect(evaluarEstado('VIGENTE', 0)).toBe('AL_DIA');
    expect(evaluarEstado('VIGENTE')).toBe('AL_DIA');
    expect(evaluarEstado('VIGENTE', -3)).toBe('AL_DIA');
  });

  it('respeta los 4 dias de gracia antes de exigir mora', () => {
    expect(evaluarEstado('VIGENTE', 1)).toBe('EN_GRACIA');
    expect(evaluarEstado('VIGENTE', DIAS_GRACIA)).toBe('EN_GRACIA');
    expect(evaluarEstado('VIGENTE', DIAS_GRACIA + 1)).toBe('EN_MORA');
  });

  it('respeta el estado persistido cuando no hay atraso calculado', () => {
    expect(evaluarEstado('EN_MORA')).toBe('EN_MORA');
    expect(evaluarEstado('EN_GRACIA')).toBe('EN_GRACIA');
    expect(evaluarEstado('CANCELADO', 10)).toBe('CANCELADO');
  });
});
