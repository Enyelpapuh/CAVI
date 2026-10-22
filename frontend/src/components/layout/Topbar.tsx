import { useAuth } from '../../context/AuthContext';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { iniciales } from '../../lib/format';

const ROL_CORTO: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  COBRANZA: 'Cobrador',
};

export function Topbar({ titulo, onAbrirMenu }: { titulo: string; onAbrirMenu: () => void }) {
  const { user, logout } = useAuth();
  const toast = useToast();

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
        <button
          type="button"
          onClick={() => toast.info('No hay alertas pendientes en tesorería.')}
          aria-label="Notificaciones"
          class="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900"
        >
          <Icon name="notifications" size={20} />
        </button>

        {user && (
          <>
            <div class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
              <span class="flex h-7 w-7 items-center justify-center rounded-full bg-green-700 text-[10px] font-bold text-white">
                {iniciales(user.nombre_completo)}
              </span>
              <span class="hidden flex-col text-left sm:flex">
                <span class="text-label-sm font-bold text-slate-900">{user.nombre_completo}</span>
                <span class="text-[10px] font-semibold text-green-700">
                  {ROL_CORTO[user.rol] ?? user.rol}
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={logout}
              aria-label="Cerrar sesión"
              class="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 lg:hidden"
            >
              <Icon name="logout" size={20} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
