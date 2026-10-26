import { useEffect, useState } from 'preact/hooks';
import { pagoService } from '../services/api';
import type { Pago } from '../types';
import { fmtMonto } from '../lib/format';
import { Button, Icon, Spinner } from './ui';
import { useAuth } from '../context/AuthContext';

const fmtFecha = (value: string): string => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('es-NI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
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
  const centavosPalabras = centavos === 1 ? 'un' : enteroEnPalabras(centavos);
  const plural = centavos === 1 ? 'centavo' : 'centavos';
  const fraccion = `(${String(centavos).padStart(2, '0')}/100)`;

  if (entero >= 1000000) {
    return `${fmtMonto(monto)} con ${centavosPalabras} ${plural} ${fraccion}`;
  }
  const palabras = enteroEnPalabras(entero);
  const capitalizado = `${palabras.charAt(0).toUpperCase()}${palabras.slice(1)}`;
  return `${capitalizado} córdobas con ${centavosPalabras} ${plural} ${fraccion}`;
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
  onAnulado?: () => void;
}

const CAUSAS_ANULACION = [
  {
    id: 'error_digitacion',
    label: 'Error de Digitación',
    texto: 'Error involuntario en el monto o fecha durante el registro del cobro en caja.',
    icono: 'edit',
  },
  {
    id: 'pago_duplicado',
    label: 'Pago Duplicado',
    texto: 'Comprobante duplicado involuntariamente por reconexión de terminal o doble envío.',
    icono: 'history',
  },
  {
    id: 'transferencia_rebotada',
    label: 'Transferencia Rebotada',
    texto: 'La transferencia bancaria o cheque no fue acreditado en la cuenta receptora de CAVI.',
    icono: 'account_balance',
  },
  {
    id: 'ajuste_cliente',
    label: 'Ajuste / Reclamación',
    texto: 'Ajuste operativo acordado con el cliente; se emitirá un nuevo comprobante corregido.',
    icono: 'tune',
  },
  {
    id: 'otro',
    label: 'Otro Motivo Operativo',
    texto: '',
    icono: 'description',
  },
];

export function PagoRecibo({ pagoId, onClose, onAnulado }: PagoReciboProps) {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'ADMINISTRADOR' || user?.is_superuser;

  const [recibo, setRecibo] = useState<Pago | null>(null);
  const [error, setError] = useState('');

  // Estados de anulación
  const [mostrarAnulacion, setMostrarAnulacion] = useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [causaSeleccionada, setCausaSeleccionada] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [errorAnulacion, setErrorAnulacion] = useState('');

  useEffect(() => {
    pagoService
      .getRecibo(pagoId)
      .then(setRecibo)
      .catch(() => setError('No se pudo cargar el recibo'));
  }, [pagoId]);

  // Listener para aislar la hoja del recibo al imprimir desde cualquier via (boton o Ctrl+P)
  useEffect(() => {
    const onBeforePrint = () => document.body.classList.add('imprimiendo-recibo');
    const onAfterPrint = () => document.body.classList.remove('imprimiendo-recibo');
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      document.body.classList.remove('imprimiendo-recibo');
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, []);

  const ejecutarAnulacion = async () => {
    if (!motivoAnulacion || motivoAnulacion.trim().length < 15) {
      setErrorAnulacion('El motivo es obligatorio y debe tener al menos 15 caracteres descriptivos.');
      return;
    }

    setAnulando(true);
    setErrorAnulacion('');
    try {
      const resp = await pagoService.anular(pagoId, motivoAnulacion.trim());
      setRecibo(resp.recibo);
      setMostrarAnulacion(false);
      if (onAnulado) onAnulado();
    } catch (err: any) {
      const msg = err?.response?.data?.motivo || err?.response?.data?.error || err?.response?.data?.detail || 'Error al anular el recibo';
      setErrorAnulacion(Array.isArray(msg) ? msg.join(' ') : String(msg));
    } finally {
      setAnulando(false);
    }
  };

  const [abriendoImpresion, setAbriendoImpresion] = useState(false);

  const imprimir = async () => {
    setAbriendoImpresion(true);
    // Abrir la ventana inmediatamente para evitar que el navegador bloquee la ventana emergente
    const ventana = window.open('', '_blank');
    if (ventana) {
      ventana.document.write('<!DOCTYPE html><html><head><title>Cargando Recibo Oficial CAVI...</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#334155;background:#f8fafc;}</style></head><body><p>Cargando Recibo Oficial CAVI...</p></body></html>');
    }

    try {
      if (!ventana) {
        // Si el navegador bloqueó la ventana emergente, degradar a impresión directa
        document.body.classList.add('imprimiendo-recibo');
        window.print();
        setTimeout(() => {
          document.body.classList.remove('imprimiendo-recibo');
        }, 1000);
        return;
      }
      const html = await pagoService.abrirReciboHtml(pagoId);
      ventana.document.open();
      ventana.document.write(html);
      ventana.document.close();
      ventana.focus();
    } catch {
      if (ventana) {
        ventana.close();
      }
      // Fallback a impresión dentro del documento si hay problemas de red
      document.body.classList.add('imprimiendo-recibo');
      window.print();
      setTimeout(() => {
        document.body.classList.remove('imprimiendo-recibo');
      }, 1000);
    } finally {
      setAbriendoImpresion(false);
    }
  };

  return (
    <div class="fixed inset-0 z-50 overflow-y-auto comprobante-recibo-overlay print:static">
      <div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4 comprobante-recibo-wrapper print:p-0">
        <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm print:hidden" onClick={onClose} />
        <div class="comprobante-recibo-imprimible relative w-full max-w-2xl rounded-t-2xl bg-white shadow-popover sm:rounded-2xl print:max-w-none print:shadow-none print:rounded-none">
          <div class="print:hidden flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <div class="flex items-center gap-2">
              <Icon name="receipt_long" size={18} class="text-green-700" />
              <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Recibo de Pago Oficial
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={imprimir}
                disabled={abriendoImpresion}
                title="Abrir recibo oficial en nueva pestaña para imprimir"
                class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <Icon name="open_in_new" size={16} />
                <span>Abrir en pestaña</span>
              </button>
              <button
                onClick={onClose}
                aria-label="Cerrar recibo"
                class="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
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
              <div class="comprobante-recibo-hoja relative p-6 sm:p-8 overflow-hidden">
                {/* Gran Marca de Agua Cruzada Diagonal para Recibos Cancelados / Inválidos */}
                {recibo.estado === 'ANULADO' && (
                  <div
                    class="marca-agua-anulado pointer-events-none select-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden"
                    aria-hidden="true"
                    data-testid="marca-agua-invalido"
                  >
                    <div class="border-4 sm:border-8 border-dashed border-rose-600/50 bg-white/85 px-6 py-5 sm:px-12 sm:py-7 text-center shadow-2xl -rotate-25 rounded-3xl max-w-[90%] backdrop-blur-[1px]">
                      <div class="font-display text-3xl sm:text-5xl font-black uppercase tracking-widest text-rose-700">
                        ANULADO &middot; INV&Aacute;LIDO
                      </div>
                      <div class="mt-2 text-xs sm:text-sm font-black tracking-wider text-rose-900 uppercase">
                        OPERACIÓN REVERTIDA CONTABLEMENTE &middot; SIN VALIDEZ FISCAL NI LEGAL
                      </div>
                      <div class="mt-1 text-[11px] font-mono font-bold text-rose-800">
                        COMPROBANTE CARENTE DE EFECTO LIBERATORIO TRAS SU ANULACIÓN
                      </div>
                    </div>
                  </div>
                )}

                {/* Banner de Recibo Anulado */}
                {recibo.estado === 'ANULADO' && (
                  <div class="mb-5 rounded-xl border-2 border-rose-500 bg-rose-50 p-4 text-center shadow-xs">
                    <div class="inline-flex items-center gap-2 font-display text-base sm:text-lg font-black tracking-wider text-rose-800 uppercase">
                      <Icon name="error" class="text-rose-600" /> COMPROBANTE OFICIAL ANULADO &middot; INV&Aacute;LIDO
                    </div>
                    <p class="mt-1 text-xs text-rose-900 font-medium">
                      Operación revertida contablemente por <strong>{recibo.anulado_por_nombre || 'Administrador CAVI'}</strong>{recibo.anulado_en ? ` el ${fmtFecha(recibo.anulado_en)}` : ''}.
                    </p>
                    {recibo.motivo_anulacion && (
                      <p class="mt-2 text-xs italic text-rose-950 font-bold bg-white/90 py-1.5 px-3 rounded-lg border border-rose-300">
                        Causa justificada de invalidación: &ldquo;{recibo.motivo_anulacion}&rdquo;
                      </p>
                    )}
                  </div>
                )}

                {/* Formulario de Confirmación de Anulación con Contexto Integral */}
                {mostrarAnulacion && (
                  <div class="mb-6 rounded-xl border-2 border-rose-300 bg-rose-50/90 p-4 shadow-sm space-y-3">
                    <div class="flex items-center justify-between border-b border-rose-200 pb-2">
                      <h4 class="text-title-sm font-bold text-rose-950 flex items-center gap-1.5">
                        <Icon name="warning" class="text-rose-600" />
                        Anulación de Transacción {recibo.codigo_comprobante}
                      </h4>
                      <span class="text-xs font-black font-mono text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                        Total Revertido: {fmtMonto(recibo.monto_total)}
                      </span>
                    </div>

                    <p class="text-body-xs text-rose-800 leading-relaxed">
                      Esta operación es inmutable y obligatoria bajo la Ley N° 977 (UAF). Se revertirá el abono a capital en el crédito y se debitarán las participaciones acreditadas a las bolsas de inversión familiares.
                    </p>

                    {/* Desglose Contable de Impacto */}
                    <div class="rounded-lg bg-white p-2.5 border border-rose-200 text-[11px] space-y-1">
                      <div class="text-[10px] uppercase font-bold tracking-wider text-rose-900">
                        Afectación Contable Inmediata
                      </div>
                      <div class="flex items-center justify-between text-slate-700">
                        <span>Capital devuelto a deuda del crédito:</span>
                        <span class="font-mono font-bold text-slate-900">+{fmtMonto(recibo.aplicacion_capital || 0)}</span>
                      </div>
                      <div class="flex items-center justify-between text-slate-700">
                        <span>Intereses corrientes y mora reactivados:</span>
                        <span class="font-mono font-bold text-slate-900">
                          +{fmtMonto(Number(recibo.aplicacion_interes || 0) + Number(recibo.aplicacion_mora || 0))}
                        </span>
                      </div>
                    </div>

                    {/* Selector de Causa Principal */}
                    <div>
                      <label class="block text-label-xs font-semibold text-rose-900 uppercase mb-1">
                        Causa principal de anulación:
                      </label>
                      <div class="flex flex-wrap gap-1.5">
                        {CAUSAS_ANULACION.map((c) => {
                          const activo = causaSeleccionada === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setCausaSeleccionada(c.id);
                                if (c.texto) {
                                  setMotivoAnulacion(c.texto);
                                  setErrorAnulacion('');
                                }
                              }}
                              class={`px-2.5 py-1 text-xs rounded-lg border transition flex items-center gap-1 ${
                                activo
                                  ? 'bg-rose-200 border-rose-400 text-rose-950 font-bold'
                                  : 'bg-white border-rose-200 text-rose-800 hover:bg-rose-100 font-medium'
                              }`}
                            >
                              <Icon name={c.icono} size={13} class={activo ? 'text-rose-700' : 'text-rose-500'} />
                              <span>{c.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Justificación Detallada */}
                    <div>
                      <div class="flex items-center justify-between mb-1">
                        <label class="block text-label-xs font-semibold text-rose-900 uppercase">
                          Justificación circunstanciada (Mínimo 15 caracteres): <span class="text-rose-600">*</span>
                        </label>
                        <span
                          class={`text-[11px] font-mono font-bold flex items-center gap-1 ${
                            motivoAnulacion.trim().length >= 15 ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {motivoAnulacion.trim().length >= 15 && <Icon name="check_circle" size={13} />}
                          {motivoAnulacion.trim().length}/15 caracteres
                        </span>
                      </div>
                      <textarea
                        class="w-full rounded-lg border border-rose-300 bg-white p-2.5 text-body-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                        rows={3}
                        placeholder="Describa con precisión las circunstancias de la anulación (por ejemplo: error en digitación, pago duplicado en terminal, cheque devuelto)..."
                        value={motivoAnulacion}
                        onInput={(e) => {
                          setMotivoAnulacion((e.target as HTMLTextAreaElement).value);
                          if (errorAnulacion) setErrorAnulacion('');
                        }}
                      />
                      <div class="mt-1 flex items-center justify-between text-[11px] text-rose-800">
                        <span>Registro inmutable firmado por {user?.nombre_completo || 'Administrador'}.</span>
                        {motivoAnulacion.trim().length < 15 ? (
                          <span class="font-semibold text-amber-800">
                            Faltan {15 - motivoAnulacion.trim().length} caracteres
                          </span>
                        ) : (
                          <span class="font-semibold text-emerald-800">Longitud conforme para auditoría</span>
                        )}
                      </div>
                    </div>

                    {errorAnulacion && (
                      <p class="text-body-sm text-rose-700 font-bold bg-white/80 p-2 rounded border border-rose-300">
                        {errorAnulacion}
                      </p>
                    )}

                    <div class="mt-3 flex justify-end gap-2 border-t border-rose-200 pt-2">
                      <Button variant="ghost" size="sm" onClick={() => setMostrarAnulacion(false)} disabled={anulando}>
                        Volver / Conservar
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={ejecutarAnulacion}
                        disabled={anulando || motivoAnulacion.trim().length < 15}
                      >
                        {anulando ? 'Revirtiendo saldos...' : 'Confirmar Reversión Definitiva'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Encabezado con Membrete y Logotipo CAVI en el extremo */}
                <div class="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                  <div class="flex items-center gap-3">
                    <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white font-black text-xl tracking-wider shadow-sm">
                      CAVI
                    </div>
                    <div>
                      <p class="font-display text-xl font-extrabold tracking-tight text-slate-900 leading-tight">CAVI</p>
                      <p class="text-[11px] font-medium text-slate-600">Control y Administración de Valores e Inversiones</p>
                      <p class="text-[10px] text-slate-400">Comprobante Oficial de Caja · Managua, Nicaragua</p>
                    </div>
                  </div>
                  <div class="shrink-0 text-right">
                    <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-200">
                      Recibo Oficial
                    </span>
                    <p class="font-mono text-lg font-black text-slate-900 mt-1">{recibo.codigo_comprobante}</p>
                    <p class="text-xs text-slate-500">Fecha: {fmtFecha(recibo.fecha_pago)}</p>
                  </div>
                </div>

                {/* Sello Criptográfico de Control */}
                <div class="mt-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  <div>
                    <span class="font-semibold text-slate-600 block text-[10px] uppercase tracking-wider">Código de Seguridad (SHA-256)</span>
                    <span class="font-mono font-bold text-slate-900 text-sm tracking-wider">{recibo.codigo_seguridad || '8F2A-9C4D'}</span>
                  </div>
                  <div class="text-right">
                    <span class="font-semibold text-slate-600 block text-[10px] uppercase tracking-wider">Estado Legal</span>
                    <span
                      class={`inline-block px-2.5 py-0.5 rounded text-xs font-black uppercase ${
                        recibo.estado === 'ANULADO'
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}
                    >
                      {recibo.estado === 'ANULADO' ? 'ANULADO · INVÁLIDO' : 'VÁLIDO'}
                    </span>
                  </div>
                </div>

                <dl class="mt-4 space-y-2 border-t border-dashed border-slate-300 pt-4 text-sm">
                  <div class="flex justify-between gap-4">
                    <dt class="text-slate-500">Recibido de</dt>
                    <dd class="text-right font-medium text-slate-900">{recibo.prestamo_cliente}</dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="text-slate-500">Préstamo</dt>
                    <dd class="font-medium text-slate-900">#{recibo.prestamo}</dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="text-slate-500">Método de Cobro</dt>
                    <dd class="text-right font-medium text-slate-900">
                      {METODO_LABEL[recibo.metodo_pago] || recibo.metodo_pago}
                      {recibo.referencia_bancaria ? ` · ${recibo.referencia_bancaria}` : ''}
                    </dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="text-slate-500">Operador Emisor</dt>
                    <dd class="text-right font-medium text-slate-900">{recibo.usuario_nombre}</dd>
                  </div>
                </dl>

                <div
                  class={`mt-5 rounded-xl border p-4 transition-colors ${
                    recibo.estado === 'ANULADO'
                      ? 'border-rose-300 bg-rose-50/70'
                      : 'border-green-200 bg-green-50/60'
                  }`}
                >
                  <div class="flex items-baseline justify-between gap-4">
                    <span class="text-sm font-medium text-slate-600">
                      {recibo.estado === 'ANULADO' ? 'Total Registrado (Revertido)' : 'Total Recibido'}
                    </span>
                    <div class="text-right">
                      <span
                        class={`font-display text-2xl font-bold ${
                          recibo.estado === 'ANULADO'
                            ? 'text-rose-900 line-through opacity-60'
                            : 'text-green-900'
                        }`}
                      >
                        {fmtMonto(recibo.monto_total)}
                      </span>
                      {recibo.estado === 'ANULADO' && (
                        <span class="ml-2 inline-block rounded border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-black uppercase text-rose-800">
                          REVERTIDO
                        </span>
                      )}
                    </div>
                  </div>
                  <p class="mt-2 text-xs italic text-slate-600">
                    Son: {montoEnLetras(Number(recibo.monto_total) || 0)}
                    {recibo.estado === 'ANULADO' && ' [VALOR REVERTIDO CONTABLEMENTE - OPERACIÓN ANULADA]'}
                  </p>
                </div>

                <table class="mt-5 w-full text-sm">
                  <tbody>
                    <tr>
                      <td class="py-1.5 text-slate-500">Amortización a capital</td>
                      <td class="py-1.5 text-right font-medium text-slate-900">{fmtMonto(recibo.aplicacion_capital)}</td>
                    </tr>
                    <tr>
                      <td class="py-1.5 text-slate-500">Interés corriente devengado</td>
                      <td class="py-1.5 text-right font-medium text-slate-900">{fmtMonto(recibo.aplicacion_interes)}</td>
                    </tr>
                    <tr>
                      <td class="py-1.5 text-slate-500">Mora y recargos</td>
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
                    <div class="mt-5 border-t border-dashed border-slate-300 pt-4">
                      <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Liquidación Ley 977 (50/50 Fondos e Intereses)
                      </p>
                      <table class="mt-2 w-full text-sm">
                        <tbody>
                          <tr>
                            <td class="py-1 text-slate-500">Interés de Administración (50%)</td>
                            <td class="py-1 text-right font-medium text-slate-900">
                              {fmtMonto(recibo.interes_administracion ?? 0)}
                            </td>
                          </tr>
                          <tr>
                            <td class="py-1 text-slate-500">Interés de Fondos (50%)</td>
                            <td class="py-1 text-right font-medium text-slate-900">
                              {fmtMonto(recibo.interes_fondos ?? 0)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {recibo.fondos_detalle && recibo.fondos_detalle.length > 0 && (
                      <div class="mt-4">
                        <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Reintegro a Fondos por Participación (Pi)
                        </p>
                        <ul class="mt-2 space-y-1.5">
                          {recibo.fondos_detalle.map((f) => (
                            <li
                              key={f.id}
                              class="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                            >
                              <div>
                                <span class="font-bold text-slate-800 block">
                                  {f.fondo_nombre} ({f.fondo_familiar})
                                </span>
                                <span class="text-[11px] text-slate-500">
                                  Participación en crédito: {(Number(f.porcentaje_pi) * 100).toFixed(2)}% (Pi: {f.porcentaje_pi})
                                </span>
                              </div>
                              <div class="text-right">
                                <span class="font-bold text-slate-900 block">
                                  {fmtMonto(Number(f.capital_reintegrado) + Number(f.ganancia))}
                                </span>
                                <span class="text-[11px] text-slate-500">
                                  {fmtMonto(f.capital_reintegrado)} capital · {fmtMonto(f.ganancia)} ganancia
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}

                <div class="mt-8 grid grid-cols-2 gap-8 text-center text-xs text-slate-700">
                  <div>
                    <div class="border-t border-slate-400 pt-1 font-semibold">Firma del Prestatario</div>
                    <div class="text-[10px] text-slate-500 font-mono truncate">{recibo.prestamo_cliente}</div>
                  </div>
                  <div>
                    <div class="border-t border-slate-400 pt-1 font-semibold">Firma de Quien Recibe (CAVI)</div>
                    <div class="text-[10px] text-slate-500 truncate">{recibo.usuario_nombre} · Caja</div>
                  </div>
                </div>

                {recibo.estado === 'ANULADO' && (
                  <div class="mt-4 rounded-lg bg-rose-50 border border-rose-200 p-2 text-center text-[10px] font-bold text-rose-900 uppercase tracking-wide">
                    AVISO LEGAL: Comprobante carente de fuerza ejecutiva, cobratoria o liberatoria tras su anulación formal.
                  </div>
                )}

                <p class="mt-5 text-center text-[11px] text-slate-400">
                  {recibo.estado === 'ANULADO'
                    ? `Documento oficial cancelado e invalidado por CAVI. Registro inmutable de auditoría #${recibo.id}.`
                    : `Documento oficial emitido por CAVI. Verificable con comprobante ${recibo.codigo_comprobante} y sello ${recibo.codigo_seguridad || '8F2A-9C4D'}.`}
                </p>
              </div>

              <div class="print:hidden flex items-center justify-between border-t border-slate-200 px-6 py-4">
                <div>
                  {esAdmin && recibo.estado !== 'ANULADO' && !mostrarAnulacion && (
                    <Button
                      variant="secondary"
                      size="sm"
                      class="text-rose-700 border border-rose-300 hover:bg-rose-50"
                      onClick={() => setMostrarAnulacion(true)}
                    >
                      <Icon name="close" />
                      Anular Recibo
                    </Button>
                  )}
                </div>
                <div class="flex gap-2">
                  <Button variant="secondary" onClick={onClose}>
                    Cerrar
                  </Button>
                  <Button onClick={imprimir} icon="print" loading={abriendoImpresion}>
                    {recibo.estado === 'ANULADO' ? 'Imprimir Comprobante Anulado' : 'Imprimir / PDF'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
export default PagoRecibo;