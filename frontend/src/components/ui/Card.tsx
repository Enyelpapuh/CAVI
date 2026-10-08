import type { ComponentChildren } from 'preact';

interface CardProps {
  children: ComponentChildren;
  title?: string;
  subtitle?: string;
  action?: ComponentChildren;
  padded?: boolean;
  class?: string;
}

export function Card({ children, title, subtitle, action, padded = true, class: className = '' }: CardProps) {
  return (
    <section class={`rounded-2xl border border-slate-100 bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <header class="flex items-start justify-between gap-4 border-b border-slate-50 px-6 py-5">
          <div class="min-w-0">
            {title && <h2 class="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>}
            {subtitle && <p class="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {action && <div class="shrink-0">{action}</div>}
        </header>
      )}
      <div class={padded ? 'p-6' : ''}>{children}</div>
    </section>
  );
}
