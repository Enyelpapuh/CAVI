import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';
import type { IconName } from './IconName';

export type TonoKpi = 'ambar' | 'indigo' | 'esmeralda' | 'rosa' | 'neutro';

const GRADIENTS: Record<TonoKpi, string> = {
  ambar: 'from-[#f59e0b] to-[#d97706]',
  indigo: 'from-[#4f46e5] to-[#3730a3]',
  esmeralda: 'from-[#059669] to-[#047857]',
  rosa: 'from-[#e11d48] to-[#be123c]',
  neutro: 'from-slate-700 to-slate-900',
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
      class={`flex w-full flex-col items-center justify-center rounded-2xl bg-gradient-to-br p-6 text-center text-white shadow-md transition-transform hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-600/40 ${
        GRADIENTS[tono]
      } ${onClick ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default'} ${className}`}
    >
      <span class="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20 shadow-inner">
        <Icon name={icon} size={32} class="text-white" />
      </span>
      <span class="text-headline-sm font-bold tracking-wide">{label}</span>
      <span class="tnum mt-1 text-headline-xl font-extrabold">{value}</span>
      {pie && <span class="mt-1 text-[11px] font-medium text-white/90">{pie}</span>}
    </button>
  );
}
