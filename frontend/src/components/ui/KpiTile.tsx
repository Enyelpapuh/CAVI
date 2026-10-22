import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';
import type { IconName } from './IconName';

export type TonoKpi = 'ambar' | 'indigo' | 'esmeralda' | 'rosa' | 'neutro';

const COLORES: Record<TonoKpi, string> = {
  ambar: 'bg-amber-50 text-amber-900 ring-amber-100',
  indigo: 'bg-indigo-50 text-indigo-900 ring-indigo-100',
  esmeralda: 'bg-emerald-50 text-emerald-900 ring-emerald-100',
  rosa: 'bg-rose-50 text-rose-900 ring-rose-100',
  neutro: 'bg-slate-50 text-slate-900 ring-slate-100',
};

interface KpiTileProps {
  label: string;
  value: ComponentChildren;
  icon: IconName;
  tono?: TonoKpi;
  pie?: ComponentChildren;
  onClick?: () => void;
  compact?: boolean;
  class?: string;
}

export function KpiTile({
  label,
  value,
  icon,
  tono = 'neutro',
  pie,
  onClick,
  compact = false,
  class: className = '',
}: KpiTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      class={`flex w-full flex-col items-start justify-center text-left ring-1 ring-inset transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
        COLORES[tono]
      } ${compact ? 'rounded-xl p-3.5 sm:p-4' : 'rounded-2xl p-6'} ${
        onClick ? 'cursor-pointer hover:bg-opacity-80' : 'cursor-default'
      } ${className}`}
    >
      <div class={`flex items-center gap-2.5 ${compact ? 'mb-2' : 'mb-4'}`}>
        <span
          class={`flex shrink-0 items-center justify-center bg-white shadow-sm ring-1 ring-black/5 ${
            compact ? 'h-7 w-7 rounded-lg' : 'h-10 w-10 rounded-xl'
          }`}
        >
          <Icon name={icon} size={compact ? 16 : 22} />
        </span>
        <span class={`font-medium ${compact ? 'text-xs uppercase tracking-wider opacity-90' : 'text-sm opacity-80'}`}>
          {label}
        </span>
      </div>
      <span class={`tnum font-bold tracking-tight ${compact ? 'text-xl sm:text-2xl' : 'text-3xl'}`}>{value}</span>
      {pie && (
        <span class={`font-medium opacity-70 ${compact ? 'mt-1 text-[11px]' : 'mt-2 text-xs'}`}>{pie}</span>
      )}
    </button>
  );
}
