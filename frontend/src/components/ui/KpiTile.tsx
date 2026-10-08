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
  class?: string;
}

export function KpiTile({ label, value, icon, tono = 'neutro', pie, onClick, class: className = '' }: KpiTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      class={`flex w-full flex-col items-start justify-center rounded-2xl p-6 text-left ring-1 ring-inset transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
        COLORES[tono]
      } ${onClick ? 'cursor-pointer hover:bg-opacity-80' : 'cursor-default'} ${className}`}
    >
      <div class="mb-4 flex items-center gap-3">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
          <Icon name={icon} size={22} />
        </span>
        <span class="text-sm font-medium opacity-80">{label}</span>
      </div>
      <span class="tnum text-3xl font-semibold tracking-tight">{value}</span>
      {pie && <span class="mt-2 text-xs font-medium opacity-70">{pie}</span>}
    </button>
  );
}
