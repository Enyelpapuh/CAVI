import { useEffect, useState } from 'preact/hooks';
import { pagoService } from '../services/api';
import type { Pago } from '../types';
import { fmtMonto } from '../lib/format';
import { Button, Icon, Spinner } from './ui';

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
      <div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4 print:p-0">
        <div class="fixed inset-0 bg-slate-900/50 print:hidden" onClick={onClose} />
        <div class="relative w-full max-w-lg rounded-t-2xl bg-white shadow-popover sm:rounded-2xl print:max-w-none print:shadow-none print:rounded-none">
          <div class="print:hidden flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <div class="flex items-center gap-2">
              <Icon name="receipt_long" size={18} class="text-green-700" />
              <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Recibo Ley 842
              </span>
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar recibo"
              class="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <Icon name="close" size={20} />
            </button>
          </div>

          {error ? (
            <div class="p-10 text-center">
              <Icon name="error" size={32} class="mx-auto text-red-500" />
              <p class="mt-3 text-sm font-medium text-red-600">{error}</p>
              <Button variant="secondary" onClick={onClose} class="mt-5">
                Cerrar
              </Button>
            </div>
          ) : !recibo ? (
            <div class="p-10 text-center">
              <Spinner size={32} />
              <p class="mt-3 text-sm text-slate-500">Cargando recibo...</p>
            </div>
          ) : (
            <>
              <div class="p-6 sm:p-8">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <p class="font-display text-2xl font-bold tracking-tight text-slate-900">CAVI</p>
                    <p class="text-xs text-slate-500">Casa de Asociación de Vivienda de Interés</p>
                    <p class="mt-1 inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">
                      Recibo de Pago · Ley 842
                    </p>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="font-mono text-lg font-semibold text-slate-900">{recibo.codigo_comprobante}</p>
                    <p class="text-xs text-slate-500">Fecha: {fmtFecha(recibo.fecha_pago)}</p>
                  </div>
                </div>

                <dl class="mt-6 space-y-2 border-t border-dashed border-slate-300 pt-4 text-sm">
                  <div class="flex justify-between gap-4">
                    <dt class="text-slate-500">Recibido de</dt>
                    <dd class="text-right font-medium text-slate-900">{recibo.prestamo_cliente}</dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="text-slate-500">Préstamo</dt>
                    <dd class="font-medium text-slate-900">#{recibo.prestamo}</dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="text-slate-500">Método</dt>
                    <dd class="text-right font-medium text-slate-900">
                      {METODO_LABEL[recibo.metodo_pago] || recibo.metodo_pago}
                      {recibo.referencia_bancaria ? ` · ${recibo.referencia_bancaria}` : ''}
                    </dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="text-slate-500">Registrado por</dt>
                    <dd class="text-right font-medium text-slate-900">{recibo.usuario_nombre}</dd>
                  </div>
                </dl>

                <div class="mt-6 rounded-xl border border-green-200 bg-green-50/60 p-4">
                  <div class="flex items-baseline justify-between gap-4">
                    <span class="text-sm font-medium text-slate-600">Total recibido</span>
                    <span class="font-display text-2xl font-bold text-green-900">{fmtMonto(recibo.monto_total)}</span>
                  </div>
                  <p class="mt-2 text-xs italic text-slate-600">
                    Son: {montoEnLetras(Number(recibo.monto_total) || 0)}
                  </p>
                </div>

                <table class="mt-6 w-full text-sm">
                  <tbody>
                    <tr>
                      <td class="py-1.5 text-slate-500">Amortización a capital</td>
                      <td class="py-1.5 text-right font-medium text-slate-900">{fmtMonto(recibo.aplicacion_capital)}</td>
                    </tr>
                    <tr>
                      <td class="py-1.5 text-slate-500">Interés corriente</td>
                      <td class="py-1.5 text-right font-medium text-slate-900">{fmtMonto(recibo.aplicacion_interes)}</td>
                    </tr>
                    <tr>
                      <td class="py-1.5 text-slate-500">Mora</td>
                      <td class="py-1.5 text-right font-medium text-slate-900">{fmtMonto(recibo.aplicacion_mora)}</td>
                    </tr>
                    {Number(recibo.exceso_no_aplicado || 0) > 0 && (
                      <tr>
                        <td class="py-1.5 text-slate-500">Exceso no aplicado</td>
                        <td class="py-1.5 text-right font-medium text-amber-700">
                          {fmtMonto(recibo.exceso_no_aplicado ?? 0)}
                        </td>
                      </tr>
                    )}
                    <tr class="border-t border-slate-200">
                      <td class="py-2.5 font-medium text-slate-700">Saldo insoluto tras pago</td>
                      <td class="py-2.5 text-right font-bold text-slate-900">{fmtMonto(recibo.saldo_insoluto_tras_pago)}</td>
                    </tr>
                  </tbody>
                </table>

                {recibo.interes_administracion !== undefined && (
                  <>
                    <div class="mt-6 border-t border-dashed border-slate-300 pt-4">
                      <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Liquidación Ley 977 (50/50)
                      </p>
                      <table class="mt-2 w-full text-sm">
                        <tbody>
                          <tr>
                            <td class="py-1.5 text-slate-500">Interés de Administración (50%)</td>
                            <td class="py-1.5 text-right font-medium text-slate-900">
                              {fmtMonto(recibo.interes_administracion ?? 0)}
                            </td>
                          </tr>
                          <tr>
                            <td class="py-1.5 text-slate-500">Interés de Fondos (50%)</td>
                            <td class="py-1.5 text-right font-medium text-slate-900">
                              {fmtMonto(recibo.interes_fondos ?? 0)}
                            </td>
                          </tr>
                          <tr>
                            <td class="py-1.5 text-slate-500">Ganancia de Administración acumulada</td>
                            <td class="py-1.5 text-right font-medium text-slate-900">
                              {fmtMonto(recibo.ganancia_administracion ?? 0)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {recibo.fondos_detalle && recibo.fondos_detalle.length > 0 && (
                      <div class="mt-5">
                        <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Reintegro a Fondos
                        </p>
                        <ul class="mt-2 space-y-1.5">
                          {recibo.fondos_detalle.map((f) => (
                            <li
                              key={f.id}
                              class="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                            >
                              <span class="font-medium text-slate-700">
                                {f.fondo_nombre} ({f.fondo_familiar})
                              </span>
                              <span class="text-slate-600">
                                {fmtMonto(f.capital_reintegrado)} reintegrados · {fmtMonto(f.ganancia)} ganancia
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}

                <div class="mt-8 grid grid-cols-2 gap-8 text-center text-xs text-slate-600">
                  <div>
                    <div class="border-t border-slate-300 pt-1">Firma del clavador / pagador</div>
                  </div>
                  <div>
                    <div class="border-t border-slate-300 pt-1">Firma de quien recibe</div>
                  </div>
                </div>

                <p class="mt-6 text-center text-[11px] text-slate-400">
                  Documento generado electrónicamente. Verifique su autenticidad mediante el código {recibo.codigo_comprobante}.
                </p>
              </div>

              <div class="print:hidden flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
                <Button variant="secondary" onClick={onClose}>
                  Cerrar
                </Button>
                <Button onClick={imprimir} icon="print">
                  Imprimir / PDF
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}