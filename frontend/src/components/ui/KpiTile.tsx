import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';
import type { IconName } from './IconName';

type Tono = 'default' | 'success' | 'warning' | 'danger' | 'neutral';

const TONES: Record<Tono, { fondo: string; icono: string }> = {
  default: { fondo: 'from-green-50 to-emerald-50/30', icono: 'text-green-600 bg-green-100' },
  success: { fondo: 'from-green-50 to-emerald-50/30', icono: 'text-green-600 bg-green-100' },
  warning: { fondo: 'from-yellow-50 to-amber-50/30', icono: 'text-amber-600 bg-yellow-100' },
  danger: { fondo: 'from-red-50 to-rose-50/30', icono: 'text-red-600 bg-red-100' },
  neutral: { fondo: 'from-slate-50 to-slate-100/40', icono: 'text-slate-600 bg-slate-200' },
};

interface KpiTileProps {
  label: string;
  value: ComponentChildren;
  icon: IconName;
  tono?: Tono;
  meta?: ComponentChildren;
  onClick?: () => void;
}

export function KpiTile({ label, value, icon, tono = 'default', meta, onClick }: KpiTileProps) {
  const config = TONES[tono];
  const Etiqueta = onClick ? 'button' : 'div';

  return (
    <Etiqueta
      onClick={onClick}
      class={`flex w-full items-start justify-between gap-3 rounded-lg border border-slate-200 bg-gradient-to-br p-5 text-left shadow-card transition-colors ${config.fondo} ${
        onClick ? 'hover:border-green-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600/30' : ''
      }`}
    >
      <div class="min-w-0">
        <p class="text-label-xs uppercase text-slate-500">{label}</p>
        <p class="tnum mt-1.5 text-data-metric text-slate-900">{value}</p>
        {meta && <div class="mt-2 text-label-sm text-slate-500">{meta}</div>}
      </div>
      <span class={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${config.icono}`}>
        <Icon name={icon} size={22} />
      </span>
    </Etiqueta>
  );
}
