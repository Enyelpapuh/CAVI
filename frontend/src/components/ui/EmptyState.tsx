import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';
import type { IconName } from './IconName';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: IconName;
  action?: ComponentChildren;
}

export function EmptyState({ title, description, icon = 'search', action }: EmptyStateProps) {
  return (
    <div class="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <span class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon name={icon} size={24} />
      </span>
      <div>
        <p class="text-label-md text-slate-700">{title}</p>
        {description && <p class="mt-1 text-body-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
