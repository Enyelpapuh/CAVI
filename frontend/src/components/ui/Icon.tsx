import type { IconName } from './IconName';

interface IconProps {
  name: IconName | string;
  size?: number;
  filled?: boolean;
  class?: string;
  title?: string;
}

export function Icon({ name, size = 20, filled = false, class: className = '', title }: IconProps) {
  return (
    <span
      class={`material-symbols-outlined shrink-0 ${className}`}
      style={{
        fontSize: `${size}px`,
        width: `${size}px`,
        height: `${size}px`,
        fontVariationSettings: filled ? "'FILL' 1" : undefined,
      }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      {name}
    </span>
  );
}
