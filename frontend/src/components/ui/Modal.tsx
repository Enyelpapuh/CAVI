import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';
import type { IconName } from './IconName';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const TAMANOS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: IconName;
  size?: ModalSize;
  footer?: ComponentChildren;
  children: ComponentChildren;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  size = 'md',
  footer,
  children,
}: ModalProps) {
  const cerrarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    cerrarRef.current?.focus();

    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div class="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        class="absolute inset-0"
        onClick={onClose}
        data-testid="modal-backdrop"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        class={`relative z-10 flex max-h-[92vh] w-full ${TAMANOS[size]} flex-col overflow-hidden rounded-t-lg bg-white shadow-modal sm:rounded-lg`}
      >
        <header class="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          {icon && (
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-green-50 text-green-600">
              <Icon name={icon} size={22} />
            </span>
          )}
          <div class="min-w-0 flex-1">
            <h2 class="text-headline-sm text-slate-900">{title}</h2>
            {subtitle && <p class="mt-0.5 text-body-sm text-slate-500">{subtitle}</p>}
          </div>
          <button
            ref={cerrarRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            class="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30"
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        <div class="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <footer class="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
