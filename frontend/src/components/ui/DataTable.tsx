import type { ComponentChildren } from 'preact';
import { Spinner } from './Spinner';
import { EmptyState } from './EmptyState';

export interface Columna<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  className?: string;
  render: (row: T, index: number) => ComponentChildren;
}

interface DataTableProps<T> {
  columns: Columna<T>[];
  rows: T[];
  getKey: (row: T, index: number) => string | number;
  caption?: string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  footer?: ComponentChildren;
  onRowClick?: (row: T) => void;
}

const ALINEACION = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export function DataTable<T>({
  columns,
  rows,
  getKey,
  caption,
  loading = false,
  emptyTitle = 'Sin registros',
  emptyDescription,
  footer,
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-body-md">
        {caption && <caption class="sr-only">{caption}</caption>}
        <thead>
          <tr class="h-9 border-b border-slate-200 bg-slate-50">
            {columns.map((columna) => (
              <th
                key={columna.key}
                scope="col"
                style={columna.width ? { width: columna.width } : undefined}
                class={`px-3 text-label-xs font-semibold uppercase tracking-wider text-slate-500 ${
                  ALINEACION[columna.align ?? 'left']
                }`}
              >
                {columna.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} class="h-32">
                <div class="flex items-center justify-center gap-3 text-body-md text-slate-500">
                  <Spinner size={20} />
                  Cargando...
                </div>
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState title={emptyTitle} description={emptyDescription} />
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr
                key={getKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                class={`h-12 border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50 ${
                  onRowClick ? 'cursor-pointer' : ''
                }`}
              >
                {columns.map((columna) => (
                  <td
                    key={columna.key}
                    class={`px-3 ${ALINEACION[columna.align ?? 'left']} ${columna.className ?? ''}`}
                  >
                    {columna.render(row, index)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer && rows.length > 0 && (
          <tfoot>
            <tr class="h-12 border-t-2 border-slate-200 bg-slate-50">{footer}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
