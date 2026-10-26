import type { ComponentChildren } from 'preact';
import { Modal } from './Modal';
import { Button } from './Button';
import { Icon } from './Icon';
import type { IconName } from './IconName';

export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message?: string;
  children?: ComponentChildren;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
  icon?: IconName;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  children,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'primary',
  loading = false,
  icon,
}: ConfirmModalProps) {
  const iconoPorDefecto: IconName =
    icon || (variant === 'danger' ? 'warning' : variant === 'warning' ? 'warning' : 'info');

  const estiloIcono =
    variant === 'danger'
      ? 'bg-rose-100 text-rose-600 border border-rose-200'
      : variant === 'warning'
      ? 'bg-amber-100 text-amber-600 border border-amber-200'
      : 'bg-green-100 text-green-700 border border-green-200';

  const botonVariante = variant === 'danger' ? 'danger' : 'primary';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div class="flex w-full items-center justify-end gap-2 sm:gap-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={botonVariante} size="sm" onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </div>
      }
    >
      <div class="flex items-start gap-3.5 py-1">
        <span class={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${estiloIcono}`}>
          <Icon name={iconoPorDefecto} size={22} />
        </span>
        <div class="min-w-0 flex-1 space-y-2">
          {message && (
            <p class="text-body-md text-slate-600 leading-relaxed break-words">
              {message}
            </p>
          )}
          {children}
        </div>
      </div>
    </Modal>
  );
}
