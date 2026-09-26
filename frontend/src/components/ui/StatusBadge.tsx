import { evaluarEstado, type EstadoEfectivo, type EstadoPrestamo } from '../../lib/estadoPrestamo';

interface ConfiguracionEstado {
  label: string;
  clases: string;
  punto: string;
}

const ESTADOS: Record<EstadoEfectivo, ConfiguracionEstado> = {
  AL_DIA: {
    label: 'Al Día',
    clases: 'bg-green-50 text-green-600 border-green-200',
    punto: 'bg-green-600',
  },
  EN_GRACIA: {
    label: 'En Gracia',
    clases: 'bg-yellow-50 text-amber-700 border-yellow-200',
    punto: 'bg-yellow-500',
  },
  EN_MORA: {
    label: 'En Mora',
    clases: 'bg-red-50 text-red-600 border-red-200',
    punto: 'bg-red-600',
  },
  CANCELADO: {
    label: 'Liquidado',
    clases: 'bg-slate-100 text-slate-500 border-slate-200',
    punto: 'bg-slate-400',
  },
};

interface StatusBadgeProps {
  estado: EstadoPrestamo;
  diasAtraso?: number | null;
  showDot?: boolean;
  class?: string;
}

export function StatusBadge({ estado, diasAtraso, showDot = true, class: className = '' }: StatusBadgeProps) {
  const efectivo = evaluarEstado(estado, diasAtraso);
  const config = ESTADOS[efectivo];
  const detalle =
    efectivo === 'EN_MORA' && diasAtraso != null && diasAtraso > 0
      ? `${config.label} (${diasAtraso}d)`
      : config.label;

  return (
    <span
      class={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-label-xs uppercase ${config.clases} ${className}`}
    >
      {showDot && <span class={`h-1.5 w-1.5 rounded-full ${config.punto}`} aria-hidden="true" />}
      {detalle}
    </span>
  );
}

export { ESTADOS as CONFIGURACION_ESTADOS };
export type { EstadoEfectivo };
