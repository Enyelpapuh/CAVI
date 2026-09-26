/** Dias de gracia antes de que la mora sea exigible (Ley 1146 / criterio CAVI). */
export const DIAS_GRACIA = 4;

export type EstadoPrestamo = 'VIGENTE' | 'EN_GRACIA' | 'EN_MORA' | 'CANCELADO';

/** Estado derivado de la fecha real de vencimiento,independiente del estado persistido. */
export type EstadoEfectivo = 'AL_DIA' | 'EN_GRACIA' | 'EN_MORA' | 'CANCELADO';

/**
 * Deriva el estado efectivo de un prestamo.
 * El Sprint 3 agregara el generador de mora que persiste EN_MORA; mientras tanto
 * `diasAtraso` permite mostrar Al Día / En Gracia / En Mora sin cobrar mora.
 */
export function evaluarEstado(
  estado: EstadoPrestamo,
  diasAtraso?: number | null
): EstadoEfectivo {
  if (estado === 'CANCELADO') return 'CANCELADO';
  if (estado === 'EN_MORA') return 'EN_MORA';
  if (estado === 'EN_GRACIA') return 'EN_GRACIA';
  if (diasAtraso != null && diasAtraso > 0) {
    return diasAtraso <= DIAS_GRACIA ? 'EN_GRACIA' : 'EN_MORA';
  }
  return 'AL_DIA';
}
