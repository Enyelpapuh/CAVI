import type { ComponentChildren } from 'preact';
import { useRouter } from '../../lib/router';
import { Icon } from '../ui';

interface PageHeaderProps {
  titulo: string;
  descripcion?: string;
  actions?: ComponentChildren;
  children?: ComponentChildren;
}

export function PageHeader({ titulo, descripcion, actions, children }: PageHeaderProps) {
  const { path, goBack } = useRouter();
  
  // No mostrar la flecha de regreso en la pantalla principal
  const mostrarBack = path !== '/';

  return (
    <div class="mb-space-md flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3 min-w-0">
        {mostrarBack && (
          <button
            onClick={goBack}
            class="group flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-95"
            aria-label="Volver atrás"
          >
            <Icon name="arrow_back" size={20} class="transition-transform group-hover:-translate-x-0.5" />
          </button>
        )}
        <div class="min-w-0">
          <h1 class="text-headline-md text-slate-900">{titulo}</h1>
          {descripcion && <p class="mt-1 text-body-md text-slate-500">{descripcion}</p>}
        </div>
      </div>
      {actions && <div class="flex flex-wrap items-center gap-2">{actions}</div>}
      {children}
    </div>
  );
}
