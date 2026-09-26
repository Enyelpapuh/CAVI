import type { ComponentChildren } from 'preact';

interface PageHeaderProps {
  titulo: string;
  descripcion?: string;
  actions?: ComponentChildren;
  children?: ComponentChildren;
}

export function PageHeader({ titulo, descripcion, actions, children }: PageHeaderProps) {
  return (
    <div class="mb-space-md flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <h1 class="text-headline-md text-slate-900">{titulo}</h1>
        {descripcion && <p class="mt-1 text-body-md text-slate-500">{descripcion}</p>}
      </div>
      {actions && <div class="flex flex-wrap items-center gap-2">{actions}</div>}
      {children}
    </div>
  );
}
