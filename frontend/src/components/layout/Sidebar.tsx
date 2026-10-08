import { useRouter } from '../../lib/router';
import { useAuth } from '../../context/AuthContext';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { iniciales } from '../../lib/format';
import { seccionesVisibles } from './navegacion';

const LINK_BASE =
  'flex items-center justify-between gap-3 rounded-lg border-l-[3px] border-transparent px-3 py-2.5 text-body-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600/40';
const LINK_INACTIVO = 'text-slate-400 hover:bg-slate-800 hover:text-slate-100';
const LINK_ACTIVO = 'border-green-600 bg-slate-800 font-semibold text-white';

const ROL_LABEL: Record<string, string> = {
  ADMINISTRADOR: 'Administrador General',
  COBRANZA: 'Cobrador de Ruta',
};

export function Sidebar({ onNavegar }: { onNavegar?: () => void }) {
  const { user, logout } = useAuth();
  const { path: currentPath, navigate } = useRouter();
  const toast = useToast();
  const secciones = seccionesVisibles(user?.rol);

  return (
    <div class="flex h-full w-[260px] flex-col justify-between border-r border-slate-800 bg-slate-900">
      <div class="flex flex-col overflow-y-auto">
        <div class="flex h-16 items-center gap-3 px-6">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-green-700">
            <Icon name="account_balance" size={20} class="text-white" />
          </span>
          <span class="flex flex-col">
            <span class="text-headline-sm font-bold tracking-tight text-slate-100">CAVI</span>
            <span class="text-label-xs uppercase tracking-wider text-slate-400">Microcréditos Admin</span>
          </span>
        </div>

        <nav class="flex flex-col gap-1 px-3 pb-4" aria-label="Navegación principal">
          {secciones.map((seccion) => (
            <div key={seccion.titulo} class="mb-2">
              <p class="px-3 py-2 text-label-xs uppercase tracking-wider text-slate-500">{seccion.titulo}</p>
              {seccion.items.map((item) =>
                item.path && !item.pendiente ? (
                  <a
                    key={item.label}
                    href={`#${item.path}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(item.path!);
                      if (onNavegar) onNavegar();
                    }}
                    class={`${LINK_BASE} ${currentPath === item.path ? LINK_ACTIVO : LINK_INACTIVO}`}
                    aria-current={currentPath === item.path ? 'page' : undefined}
                  >
                    <span class="flex items-center gap-3">
                      <Icon name={item.icon} size={20} />
                      {item.label}
                    </span>
                    {item.badge && (
                      <span class="rounded bg-green-800/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-300">
                        {item.badge}
                      </span>
                    )}
                  </a>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => toast.info(`${item.label} estará disponible en el ${item.pendiente ?? 'próximo sprint'}.`)}
                    class={`${LINK_BASE} cursor-not-allowed text-slate-600 hover:bg-transparent hover:text-slate-600`}
                    aria-disabled="true"
                  >
                    <span class="flex items-center gap-3">
                      <Icon name={item.icon} size={18} />
                      {item.label}
                    </span>
                    {item.pendiente && (
                      <span class="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {item.pendiente}
                      </span>
                    )}
                  </button>
                )
              )}
            </div>
          ))}
        </nav>
      </div>

      {user && (
        <div class="border-t border-slate-800 p-4">
          <div class="mb-2 flex items-center gap-3 rounded-lg bg-slate-800/60 p-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-700 text-label-xs font-bold text-white">
              {iniciales(user.nombre_completo)}
            </span>
            <span class="flex min-w-0 flex-col">
              <span class="truncate text-label-sm text-slate-100">{user.nombre_completo}</span>
              <span class="text-label-xs text-green-400">{ROL_LABEL[user.rol] ?? user.rol}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={logout}
            class="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-label-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <Icon name="logout" size={18} />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
