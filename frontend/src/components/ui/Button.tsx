import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';
import type { IconName } from './IconName';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTES: Record<ButtonVariant, string> = {
  primary:
    'bg-green-600 text-white hover:bg-green-700 active:scale-[0.99] focus-visible:ring-green-600/30',
  secondary:
    'border border-slate-200 bg-white text-slate-900 hover:bg-slate-100 active:scale-[0.99] focus-visible:ring-slate-400/30',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400/30',
  destructive: 'bg-red-600 text-white hover:bg-red-700 active:scale-[0.99] focus-visible:ring-red-600/30',
};

const TAMANOS: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-label-sm gap-1.5',
  md: 'h-10 px-4 text-label-md gap-2',
  lg: 'h-12 px-5 text-body-lg gap-2',
};

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  fullWidth = false
): string {
  return [
    'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap',
    'transition-colors duration-150 outline-none',
    'focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTES[variant],
    TAMANOS[size],
    fullWidth ? 'w-full' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

interface ButtonProps {
  children: ComponentChildren;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  title?: string;
  class?: string;
  'data-testid'?: string;
  'aria-label'?: string;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  iconRight,
  title,
  class: className = '',
  ...rest
}: ButtonProps) {
  const inactivo = disabled || loading;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={inactivo}
      title={title}
      class={`${buttonClasses(variant, size, fullWidth)} ${className}`}
      {...rest}
    >
      {loading ? (
        <span
          class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />
      )}
      {children}
      {iconRight && !loading && <Icon name={iconRight} size={size === 'sm' ? 16 : 18} />}
    </button>
  );
}
