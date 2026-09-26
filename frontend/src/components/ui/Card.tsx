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
    <section class={`rounded-lg border border-slate-200 bg-white shadow-card ${className}`}>
      {(title || action) && (
        <header class="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div class="min-w-0">
            {title && <h2 class="text-headline-sm truncate text-slate-900">{title}</h2>}
            {subtitle && <p class="mt-0.5 text-body-sm text-slate-500">{subtitle}</p>}
          </div>
          {action && <div class="shrink-0">{action}</div>}
        </header>
      )}
      <div class={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}
