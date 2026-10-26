import { evaluarEstado, type EstadoEfectivo, type EstadoPrestamo } from '../../lib/estadoPrestamo';

interface ConfiguracionEstado {
  label: string;
  clases: string;
  punto: string;
}

const ESTADOS: Record<EstadoEfectivo, ConfiguracionEstado> = {
  AL_DIA: {
    label: 'Al Día',
    clases: 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20',
    punto: 'bg-green-500',
  },
  EN_GRACIA: {
    label: 'En Gracia',
    clases: 'bg-yellow-50 text-amber-800 ring-1 ring-inset ring-amber-600/20',
    punto: 'bg-amber-500',
  },
  EN_MORA: {
    label: 'En Mora',
    clases: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/10',
    punto: 'bg-red-500',
  },
  CANCELADO: {
    label: 'Liquidado',
    clases: 'bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-500/10',
    punto: 'bg-slate-400',
  },
};

interface StatusBadgeProps {
  estado?: EstadoPrestamo;
  variant?: 'activo' | 'inactivo' | 'al_dia' | 'en_gracia' | 'en_mora' | 'cancelado' | string;
  status?: string;
  label?: string;
  diasAtraso?: number | null;
  showDot?: boolean;
  class?: string;
}

export function StatusBadge({
  estado,
  variant,
  status,
  label,
  diasAtraso,
  showDot = true,
  class: className = '',
}: StatusBadgeProps) {
  // Soporte directo para etiquetas explícitas (ej: activo/inactivo)
  if (label) {
    const v = (variant || status || 'activo').toLowerCase();
    const esPositivo = v === 'activo' || v === 'al_dia' || v === 'vigente';
    const esAlerta = v === 'en_gracia' || v === 'pendiente';
    const esNegativo = v === 'inactivo' || v === 'en_mora';

    const clases = esPositivo
      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20'
      : esAlerta
      ? 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20'
      : esNegativo
      ? 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/10'
      : 'bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-500/10';

    const punto = esPositivo ? 'bg-emerald-500' : esAlerta ? 'bg-amber-500' : esNegativo ? 'bg-rose-500' : 'bg-slate-400';

    return (
      <span
        class={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-label-xs font-bold uppercase ${clases} ${className}`}
      >
        {showDot && <span class={`h-1.5 w-1.5 rounded-full ${punto}`} aria-hidden="true" />}
        {label}
      </span>
    );
  }

  const efectivo = evaluarEstado(estado || 'VIGENTE', diasAtraso);
  const config = ESTADOS[efectivo];
  const detalle =
    efectivo === 'EN_MORA' && diasAtraso != null && diasAtraso > 0
      ? `${config.label} (${diasAtraso}d)`
      : config.label;

  return (
    <span
      class={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-label-xs uppercase ${config.clases} ${className}`}
    >
      {showDot && <span class={`h-1.5 w-1.5 rounded-full ${config.punto}`} aria-hidden="true" />}
      {detalle}
    </span>
  );
}

export { ESTADOS as CONFIGURACION_ESTADOS };
export type { EstadoEfectivo };
