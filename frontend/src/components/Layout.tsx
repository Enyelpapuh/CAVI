import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useRouter } from '../lib/router';
import { useAuth } from '../context/AuthContext';
import { Sidebar } from './layout/Sidebar';
import { Topbar } from './layout/Topbar';
import { TITULOS_RUTA } from './layout/navegacion';

interface LayoutProps {
  children: ComponentChildren;
  /** Titulo del encabezado superior; si se omite se deduce de la ruta. */
  titulo?: string;
}

export function Layout({ children, titulo }: LayoutProps) {
  const { user } = useAuth();
  const { path: rutaActual } = useRouter();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const encabezado = titulo ?? TITULOS_RUTA[rutaActual] ?? 'CAVI';

  useEffect(() => {
    setMenuAbierto(false);
  }, [rutaActual]);

  useEffect(() => {
    if (!menuAbierto) return;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuAbierto(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuAbierto]);

  if (!user) {
    return <div class="min-h-screen bg-slate-50">{children}</div>;
  }

  return (
    <div class="min-h-screen bg-slate-50">
      <aside class="fixed inset-y-0 left-0 z-50 hidden lg:block">
        <Sidebar />
      </aside>

      {menuAbierto && (
        <div class="fixed inset-0 z-50 lg:hidden">
          <div
            class="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setMenuAbierto(false)}
            data-testid="drawer-backdrop"
            aria-hidden="true"
          />
          <aside
            class="absolute inset-y-0 left-0 shadow-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
          >
            <Sidebar onNavegar={() => setMenuAbierto(false)} />
          </aside>
        </div>
      )}

      <div class="lg:pl-[260px]">
        <Topbar titulo={encabezado} onAbrirMenu={() => setMenuAbierto(true)} />
        <main class="min-h-screen w-full px-4 pt-16 sm:px-6 lg:px-gutter">
          <div class="mx-auto max-w-[1600px] py-space-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
