import { useAuth } from '../../context/AuthContext';
import { Icon } from '../ui/Icon';
import { BandejaNotificaciones } from './BandejaNotificaciones';

export function Topbar({ titulo, onAbrirMenu }: { titulo: string; onAbrirMenu: () => void }) {
  const { logout } = useAuth();

  return (
    <header class="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:left-[260px] lg:px-gutter">
      <div class="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onAbrirMenu}
          aria-label="Abrir menú de navegación"
          class="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
        >
          <Icon name="menu" size={22} />
        </button>
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-headline-sm font-bold tracking-tight text-slate-900">{titulo}</span>
          <span class="hidden text-body-sm text-slate-500 sm:inline">/ CAVI Microcréditos</span>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* Bandeja interactiva de notificaciones y cancelación de recibos */}
        <BandejaNotificaciones />

        <button
          type="button"
          onClick={logout}
          aria-label="Cerrar sesión"
          class="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 lg:hidden"
        >
          <Icon name="logout" size={20} />
        </button>
      </div>
    </header>
  );
}
