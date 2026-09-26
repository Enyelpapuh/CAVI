interface SpinnerProps {
  size?: number;
  class?: string;
  label?: string;
}

export function Spinner({ size = 24, class: className = '', label = 'Cargando' }: SpinnerProps) {
  return (
    <span
      class={`inline-block shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-green-600 ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
      role="status"
      aria-label={label}
    />
  );
}
