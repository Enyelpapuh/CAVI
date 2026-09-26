const fmtMoneda = new Intl.NumberFormat('es-NI', {
  style: 'currency',
  currency: 'NIO',
  minimumFractionDigits: 2,
});

const fmtDecimal = new Intl.NumberFormat('es-NI', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtEntero = new Intl.NumberFormat('es-NI', { maximumFractionDigits: 0 });

/** Monto con simbolo de cordoba: C$1,845.98 */
export const fmtMonto = (value: number | string | null | undefined): string =>
  fmtMoneda.format(Number(value) || 0);

/** Monto sin simbolo para tablas y celdas: 1,845.98 */
export const fmtNumero = (value: number | string | null | undefined): string =>
  fmtDecimal.format(Number(value) || 0);

export const fmtCantidad = (value: number | string | null | undefined): string =>
  fmtEntero.format(Number(value) || 0);

export const fmtPorcentaje = (value: number | string | null | undefined, decimales = 2): string =>
  `${(Number(value) || 0).toFixed(decimales)}%`;

export const fmtFecha = (value: string | Date | null | undefined): string => {
  if (!value) return '-';
  const fecha = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value;
  if (Number.isNaN(fecha.getTime())) return '-';
  return fecha.toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const fmtFechaHora = (value: string | Date | null | undefined): string => {
  if (!value) return '-';
  const fecha = new Date(value);
  if (Number.isNaN(fecha.getTime())) return '-';
  return fecha.toLocaleString('es-NI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Iniciales para avatares: "Juan Carlos Perez" -> "JP" */
export const iniciales = (nombre: string | null | undefined): string => {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
};

/** Normaliza texto para busqueda: sin acentos ni mayusculas */
export const normalizar = (texto: string | null | undefined): string =>
  (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
