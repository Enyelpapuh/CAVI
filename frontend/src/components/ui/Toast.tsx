import { createContext } from 'preact';
import { useCallback, useContext, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';

type TipoToast = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tipo: TipoToast;
  mensaje: string;
}

interface ToastApi {
  success: (mensaje: string) => void;
  error: (mensaje: string) => void;
  info: (mensaje: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ESTILOS: Record<TipoToast, { icono: string; clases: string }> = {
  success: { icono: 'check_circle', clases: 'text-green-600 bg-green-100' },
  error: { icono: 'warning', clases: 'text-red-600 bg-red-100' },
  info: { icono: 'notifications', clases: 'text-slate-600 bg-slate-200' },
};

const DURACION_MS = 4000;

export function ToastProvider({ children }: { children: ComponentChildren }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const siguienteId = useRef(1);

  const push = useCallback((tipo: TipoToast, mensaje: string) => {
    const id = siguienteId.current++;
    setToasts((previos) => [...previos, { id, tipo, mensaje }]);
    setTimeout(() => {
      setToasts((previos) => previos.filter((toast) => toast.id !== id));
    }, DURACION_MS);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (mensaje) => push('success', mensaje),
      error: (mensaje) => push('error', mensaje),
      info: (mensaje) => push('info', mensaje),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div class="pointer-events-none fixed right-4 top-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((toast) => {
          const estilo = ESTILOS[toast.tipo];
          return (
            <div
              key={toast.id}
              role="status"
              aria-live="polite"
              onClick={() => setToasts((previos) => previos.filter((t) => t.id !== toast.id))}
              class={`pointer-events-auto flex animate-slide-up cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-popover ${toast.tipo === 'error' ? 'border-red-200' : ''}`}
            >
              <span class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${estilo.clases}`}>
                <Icon name={estilo.icono} size={18} />
              </span>
              <p class="flex-1 pt-1 text-body-md text-slate-800">{toast.mensaje}</p>
              <button
                type="button"
                aria-label="Cerrar notificación"
                onClick={(event) => {
                  event.stopPropagation();
                  setToasts((previos) => previos.filter((t) => t.id !== toast.id));
                }}
                class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error('useToast debe usarse dentro de <ToastProvider>');
  }
  return api;
}
