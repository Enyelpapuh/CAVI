import { useId } from 'preact/hooks';
import type { ComponentChildren, JSX } from 'preact';

const CONTROL =
  'h-[38px] w-full rounded-md border border-slate-300 bg-white px-3 text-body-md text-slate-900 placeholder:text-slate-400 outline-none transition-colors focus:border-green-600 focus:ring-1 focus:ring-green-600 disabled:bg-slate-50 disabled:text-slate-400';

interface CampoProps {
  id?: string;
  label: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ComponentChildren;
  error?: string;
  hint?: string;
  required?: boolean;
  class?: string;
}

export function Campo({ id: propId, label, children, error, hint, required = false, class: className = '' }: CampoProps) {
  const autoId = useId();
  const id = propId || `field-${autoId}`;
  const ayudaId = error || hint ? `${id}-ayuda` : undefined;

  return (
    <div class={className}>
      <label for={id} class="mb-1.5 block text-label-md text-slate-700">
        {label}
        {required && <span class="ml-0.5 text-red-600">*</span>}
      </label>
      {children({
        id,
        'aria-describedby': ayudaId,
        'aria-invalid': error ? true : undefined,
      })}
      {(error || hint) && (
        <p id={ayudaId} class={`mt-1 text-body-sm ${error ? 'text-red-600' : 'text-slate-500'}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

interface InputProps {
  id?: string;
  label: string;
  value: string;
  onInput: (value: string) => void;
  type?: 'text' | 'number' | 'date' | 'email' | 'password' | 'tel';
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  prefix?: string;
  step?: string;
  min?: string;
  max?: string;
  class?: string;
  inputClass?: string;
  'data-testid'?: string;
}

export function Input({
  id,
  label,
  value,
  onInput,
  type = 'text',
  placeholder,
  error,
  hint,
  required = false,
  disabled = false,
  prefix,
  step,
  min,
  max,
  class: className = '',
  inputClass = '',
  ...rest
}: InputProps) {
  return (
    <Campo id={id} label={label} error={error} hint={hint} required={required} class={className}>
      {(aria) =>
        prefix ? (
          <div class="flex h-[38px] items-stretch overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-green-600 focus-within:ring-1 focus-within:ring-green-600">
            <span class="flex items-center border-r border-slate-200 pl-3 pr-2 text-body-sm text-slate-500">
              {prefix}
            </span>
            <input
              {...aria}
              {...rest}
              type={type}
              value={value ?? ''}
              step={step}
              min={min}
              max={max}
              placeholder={placeholder}
              disabled={disabled}
              onInput={(event) => onInput((event.currentTarget as HTMLInputElement).value)}
              class={`min-w-0 flex-1 bg-transparent px-3 text-body-md text-slate-900 outline-none placeholder:text-slate-400 disabled:text-slate-400 ${inputClass}`}
            />
          </div>
        ) : (
          <input
            {...aria}
            {...rest}
            type={type}
            value={value ?? ''}
            step={step}
            min={min}
            max={max}
            placeholder={placeholder}
            disabled={disabled}
            onInput={(event) => onInput((event.currentTarget as HTMLInputElement).value)}
            class={`${CONTROL} ${inputClass}`}
          />
        )
      }
    </Campo>
  );
}

interface SelectProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  class?: string;
  'data-testid'?: string;
}

export function Select({
  id,
  label,
  value,
  onChange,
  options,
  error,
  hint,
  required = false,
  disabled = false,
  class: className = '',
  ...rest
}: SelectProps) {
  return (
    <Campo id={id} label={label} error={error} hint={hint} required={required} class={className}>
      {(aria) => (
        <select
          {...aria}
          {...rest}
          value={value ?? ''}
          disabled={disabled}
          onChange={(event) => onChange((event.currentTarget as HTMLSelectElement).value)}
          class={`${CONTROL} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9`}
        >
          {options.map((opcion) => (
            <option key={opcion.value} value={opcion.value} disabled={opcion.disabled}>
              {opcion.label}
            </option>
          ))}
        </select>
      )}
    </Campo>
  );
}

interface TextareaProps {
  id?: string;
  label: string;
  value: string;
  onInput: (value: string) => void;
  rows?: number;
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  class?: string;
  'data-testid'?: string;
}

export function Textarea({
  id,
  label,
  value,
  onInput,
  rows = 3,
  placeholder,
  error,
  hint,
  required = false,
  class: className = '',
  ...rest
}: TextareaProps) {
  return (
    <Campo id={id} label={label} error={error} hint={hint} required={required} class={className}>
      {(aria) => (
        <textarea
          {...aria}
          {...rest}
          rows={rows}
          value={value ?? ''}
          placeholder={placeholder}
          onInput={(event) => onInput((event.currentTarget as HTMLTextAreaElement).value)}
          class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-body-md text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-green-600 focus:ring-1 focus:ring-green-600"
        />
      )}
    </Campo>
  );
}

export type { JSX };
