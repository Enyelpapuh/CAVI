import { useEffect, useState } from 'preact/hooks';
import { pagoService } from '../services/api';
import type { Pago } from '../types';

const fmtMonto = (value: number | string): string => {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
};

const fmtFecha = (value: string): string => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('es-NI');
};

const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const DIECIS = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve'];
const DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function menoresCien(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (n < 20) return DIECIS[n - 10];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (u === 0) return DECENAS[d];
  if (d === 2) return `veinti${UNIDADES[u]}`;
  return `${DECENAS[d]} y ${UNIDADES[u]}`;
}

function menorMil(n: number): string {
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (c === 1 && r === 0) return 'cien';
  const cent = c > 0 ? `${CENTENAS[c]}${r > 0 ? ' ' : ''}` : '';
  return cent + (r > 0 ? menoresCien(r) : '');
}

function enteroEnPalabras(n: number): string {
  if (n === 0) return 'cero';
  const miles = Math.floor(n / 1000);
  const rest = n % 1000;
  let s = '';
  if (miles > 0) {
    s = miles === 1 ? 'mil' : `${menorMil(miles)} mil`;
    if (rest === 0) return s;
    s += ' ';
  }
  return s + menorMil(rest);
}

export function montoEnLetras(monto: number): string {
  const entero = Math.trunc(monto);
  const centavos = Math.round((monto - entero) * 100);
  if (entero >= 1000000) {
    return `${fmtMonto(monto)} (${String(centavos).padStart(2, '0')}/100)`;
  }
  const palabras = enteroEnPalabras(entero);
  const capitalizado = `${palabras.charAt(0).toUpperCase()}${palabras.slice(1)}`;
  return `${capitalizado} córdobas con ${String(centavos).padStart(2, '0')}/100`;
}

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CHEQUE: 'Cheque',
  OTRO: 'Otro',
};

interface PagoReciboProps {
  pagoId: number;
  onClose: () => void;
}

export function PagoRecibo({ pagoId, onClose }: PagoReciboProps) {
  const [recibo, setRecibo] = useState<Pago | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    pagoService
      .getRecibo(pagoId)
      .then(setRecibo)
      .catch(() => setError('No se pudo cargar el recibo'));
  }, [pagoId]);

  const imprimir = () => window.print();

  return (
    <div class="fixed inset-0 z-50 overflow-y-auto print:static">
      <div class="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-4 print:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 print:hidden" onClick={onClose} />
        <div class="relative bg-white rounded-t-xl sm:rounded-lg shadow-xl w-full max-w-lg print:shadow-none print:rounded-none">
          <div class="print:hidden flex items-center justify-between px-4 py-2 border-b">
            <span class="text-xs text-gray-400">Recibo Ley 842</span>
            <button onClick={onClose} aria-label="Cerrar recibo" class="text-gray-400 hover:text-gray-600">
              <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error ? (
            <div class="p-8 text-center">
              <p class="text-sm text-red-600">{error}</p>
              <button
                onClick={onClose}
                class="mt-4 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
          ) : !recibo ? (
            <div class="p-8 text-center">
              <div class="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mx-auto"></div>
              <p class="mt-2 text-xs text-gray-500">Cargando recibo...</p>
            </div>
          ) : (
            <>
              <div class="p-6 sm:p-8">
                <div class="flex items-start justify-between">
                  <div>
                    <p class="text-2xl font-bold tracking-tight text-gray-900">CAVI</p>
                    <p class="text-xs text-gray-500">Casa de Asociación de Vivienda de Interés</p>
                    <p class="text-xs text-gray-500">Recibo de Pago · Ley 842</p>
                  </div>
                  <div class="text-right">
                    <p class="font-mono text-lg font-semibold text-gray-900">{recibo.codigo_comprobante}</p>
                    <p class="text-xs text-gray-500">Fecha: {fmtFecha(recibo.fecha_pago)}</p>
                  </div>
                </div>

                <div class="mt-6 border-t border-dashed border-gray-300 pt-4 text-sm space-y-1.5">
                  <div class="flex justify-between">
                    <span class="text-gray-500">Recibido de</span>
                    <span class="font-medium text-gray-900">{recibo.prestamo_cliente}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">Préstamo</span>
                    <span class="font-medium text-gray-900">#{recibo.prestamo}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">Método</span>
                    <span class="font-medium text-gray-900">
                      {METODO_LABEL[recibo.metodo_pago] || recibo.metodo_pago}
                      {recibo.referencia_bancaria ? ` · ${recibo.referencia_bancaria}` : ''}
                    </span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">Registrado por</span>
                    <span class="font-medium text-gray-900">{recibo.usuario_nombre}</span>
                  </div>
                </div>

                <div class="mt-6 rounded-md bg-gray-50 border border-gray-200 p-4">
                  <div class="flex justify-between items-baseline">
                    <span class="text-sm text-gray-600">Total recibido</span>
                    <span class="text-xl font-bold text-gray-900">{fmtMonto(recibo.monto_total)}</span>
                  </div>
                  <p class="mt-2 text-xs text-gray-600 italic">Son: {montoEnLetras(Number(recibo.monto_total) || 0)}</p>
                </div>

                <table class="mt-6 w-full text-sm">
                  <tbody>
                    <tr>
                      <td class="py-1 text-gray-500">Amortización a capital</td>
                      <td class="py-1 text-right font-medium text-gray-900">{fmtMonto(recibo.aplicacion_capital)}</td>
                    </tr>
                    <tr>
                      <td class="py-1 text-gray-500">Interés corriente</td>
                      <td class="py-1 text-right font-medium text-gray-900">{fmtMonto(recibo.aplicacion_interes)}</td>
                    </tr>
                    <tr>
                      <td class="py-1 text-gray-500">Mora</td>
                      <td class="py-1 text-right font-medium text-gray-900">{fmtMonto(recibo.aplicacion_mora)}</td>
                    </tr>
                    {Number(recibo.exceso_no_aplicado || 0) > 0 && (
                      <tr>
                        <td class="py-1 text-gray-500">Exceso no aplicado</td>
                        <td class="py-1 text-right font-medium text-orange-700">{fmtMonto(recibo.exceso_no_aplicado ?? 0)}</td>
                      </tr>
                    )}
                    <tr class="border-t border-gray-200">
                      <td class="py-2 text-gray-700 font-medium">Saldo insoluto tras pago</td>
                      <td class="py-2 text-right font-bold text-gray-900">{fmtMonto(recibo.saldo_insoluto_tras_pago)}</td>
                    </tr>
                  </tbody>
                </table>

                {recibo.interes_administracion !== undefined && (
                  <>
                    <div class="mt-6 border-t border-dashed border-gray-300 pt-4">
                      <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Liquidación Ley 977 (50/50)
                      </p>
                      <table class="mt-2 w-full text-sm">
                        <tbody>
                          <tr>
                            <td class="py-1 text-gray-500">Interés de Administración (50%)</td>
                            <td class="py-1 text-right font-medium text-gray-900">{fmtMonto(recibo.interes_administracion ?? 0)}</td>
                          </tr>
                          <tr>
                            <td class="py-1 text-gray-500">Interés de Fondos (50%)</td>
                            <td class="py-1 text-right font-medium text-gray-900">{fmtMonto(recibo.interes_fondos ?? 0)}</td>
                          </tr>
                          <tr>
                            <td class="py-1 text-gray-500">Ganancia de Administración acumulada</td>
                            <td class="py-1 text-right font-medium text-gray-900">{fmtMonto(recibo.ganancia_administracion ?? 0)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {recibo.fondos_detalle && recibo.fondos_detalle.length > 0 && (
                      <div class="mt-4">
                        <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Reintegro a Fondos</p>
                        <div class="mt-2 space-y-1">
                          {recibo.fondos_detalle.map((f) => (
                            <div key={f.id} class="flex justify-between text-xs">
                              <span class="text-gray-500">
                                {f.fondo_nombre} ({f.fondo_familiar})
                              </span>
                              <span class="text-gray-700">
                                {fmtMonto(f.capital_reintegrado)} reintegrados · {fmtMonto(f.ganancia)} ganancia
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div class="mt-8 grid grid-cols-2 gap-8 text-center text-xs text-gray-600">
                  <div>
                    <div class="border-t border-gray-300 pt-1">Firma del clavador / pagador</div>
                  </div>
                  <div>
                    <div class="border-t border-gray-300 pt-1">Firma de quien recibe</div>
                  </div>
                </div>

                <p class="mt-6 text-center text-[11px] text-gray-400">
                  Documento generado electrónicamente. Verifique su autenticidad mediante el código {recibo.codigo_comprobante}.
                </p>
              </div>

              <div class="print:hidden flex justify-end gap-3 border-t px-6 py-4">
                <button
                  onClick={onClose}
                  class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cerrar
                </button>
                <button
                  onClick={imprimir}
                  class="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  Imprimir / PDF
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}