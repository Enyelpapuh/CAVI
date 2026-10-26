import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { pagoService } from '../../services/api';
import type { Pago } from '../../types';
import { fmtMonto, fmtFechaHora } from '../../lib/format';
import { Button, Icon, Modal, Spinner, useToast } from '../ui';
import { PagoRecibo } from '../PagoRecibo';
import { useAuth } from '../../context/AuthContext';

interface CausaAnulacion {
  id: string;
  label: string;
  texto: string;
  icono: string;
}

const CAUSAS_ANULACION: CausaAnulacion[] = [
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

export function BandejaNotificaciones() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'ADMINISTRADOR' || user?.is_superuser;
  const toast = useToast();

  const [abierto, setAbierto] = useState(false);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'recibos' | 'alertas'>('recibos');

  // Modal para ver recibo completo
  const [verReciboId, setVerReciboId] = useState<number | null>(null);

  // Modal de cancelación/anulación de recibo con contexto integral
  const [reciboParaCancelar, setReciboParaCancelar] = useState<Pago | null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [causaSeleccionada, setCausaSeleccionada] = useState<string>('');
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelacion, setErrorCancelacion] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  const cargarRecibos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await pagoService.list({ page: 1 });
      const lista = Array.isArray(data) ? data : data?.results || [];
      setPagos(lista.slice(0, 15));
    } catch {
      // Degrada silenciosamente si el endpoint no está disponible
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarRecibos();
  }, [cargarRecibos]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!abierto) return;
    const handleClickAfuera = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickAfuera);
    return () => document.removeEventListener('mousedown', handleClickAfuera);
  }, [abierto]);

  const toggleAbierto = () => {
    const nuevo = !abierto;
    setAbierto(nuevo);
    if (nuevo) {
      cargarRecibos();
    }
  };

  const handleIniciarCancelacion = (pago: Pago) => {
    if (!esAdmin) {
      toast.error('Solo usuarios con rol Administrador pueden anular o cancelar recibos de pago.');
      return;
    }
    setReciboParaCancelar(pago);
    setMotivoCancelacion('');
    setCausaSeleccionada('');
    setErrorCancelacion('');
    setAbierto(false);
  };

  const ejecutarCancelacion = async (e: Event) => {
    e.preventDefault();
    if (!reciboParaCancelar) return;

    const motivoLimpio = motivoCancelacion.trim();
    if (motivoLimpio.length < 15) {
      setErrorCancelacion('La justificación es obligatoria y debe tener al menos 15 caracteres descriptivos.');
      return;
    }

    setCancelando(true);
    setErrorCancelacion('');
    try {
      const resp = await pagoService.anular(reciboParaCancelar.id, motivoLimpio);
      toast.success(resp.mensaje || `Recibo ${reciboParaCancelar.codigo_comprobante} cancelado exitosamente.`);
      setReciboParaCancelar(null);
      setMotivoCancelacion('');
      cargarRecibos();
    } catch (err: any) {
      const msg =
        err?.response?.data?.motivo ||
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        'Error al cancelar el recibo en tesorería.';
      setErrorCancelacion(Array.isArray(msg) ? msg.join(' ') : String(msg));
    } finally {
      setCancelando(false);
    }
  };

  const recibosActivos = pagos.filter((p) => p.estado !== 'ANULADO');
  const recibosAnulados = pagos.filter((p) => p.estado === 'ANULADO');

  return (
    <div class="relative" ref={dropdownRef}>
      {/* Botón de la Campana de Notificaciones */}
      <button
        type="button"
        onClick={toggleAbierto}
        aria-label="Bandeja de notificaciones y recibos"
        aria-expanded={abierto}
        class={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          abierto
            ? 'bg-slate-900 text-white shadow-xs'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
        }`}
        title="Bandeja de operaciones y recibos"
      >
        <Icon name="notifications" size={20} />
        {recibosActivos.length > 0 && (
          <span class="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white shadow-xs animate-pulse">
            {recibosActivos.length}
          </span>
        )}
      </button>

      {/* Panel Desplegable de Notificaciones */}
      {abierto && (
        <div class="absolute right-0 top-11 z-50 w-80 sm:w-96 md:w-[420px] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Cabecera del Panel */}
          <div class="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-4 py-3 text-white">
            <div class="flex items-center gap-2">
              <Icon name="receipt_long" size={18} class="text-emerald-400" />
              <div>
                <span class="block text-headline-sm font-bold leading-tight">Bandeja de Operaciones</span>
                <span class="text-[11px] text-slate-400">Recibos y alertas de tesorería</span>
              </div>
            </div>
            <div class="flex items-center gap-1">
              <button
                type="button"
                onClick={cargarRecibos}
                aria-label="Actualizar notificaciones"
                class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                title="Recargar recibos"
              >
                <Icon name="sync" size={16} class={loading ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar bandeja"
                class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          </div>

          {/* Selector de Pestañas */}
          <div class="flex border-b border-slate-100 bg-slate-50/70 px-4 text-body-xs font-semibold">
            <button
              type="button"
              onClick={() => setTab('recibos')}
              class={`flex items-center gap-1.5 border-b-2 py-2 px-2 transition-colors ${
                tab === 'recibos'
                  ? 'border-slate-900 text-slate-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Recibos de Caja</span>
              <span class="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px]">
                {pagos.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab('alertas')}
              class={`flex items-center gap-1.5 border-b-2 py-2 px-2 transition-colors ${
                tab === 'alertas'
                  ? 'border-slate-900 text-slate-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Alertas</span>
              {recibosAnulados.length > 0 && (
                <span class="rounded-full bg-rose-100 px-1.5 py-0.2 text-[10px] text-rose-700 font-bold">
                  {recibosAnulados.length}
                </span>
              )}
            </button>
          </div>

          {/* Contenido de la Bandeja */}
          <div class="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div class="flex justify-center py-10">
                <Spinner size={28} />
              </div>
            ) : tab === 'recibos' ? (
              pagos.length === 0 ? (
                <div class="p-8 text-center text-slate-500">
                  <Icon name="receipt" size={32} class="mx-auto text-slate-300 mb-2" />
                  <p class="text-body-sm font-medium">No hay recibos registrados hoy.</p>
                  <p class="text-[11px] text-slate-400 mt-1">
                    Los cobros efectuados aparecerán aquí para control y cancelación.
                  </p>
                </div>
              ) : (
                pagos.map((pago) => {
                  const anulado = pago.estado === 'ANULADO';
                  return (
                    <div
                      key={pago.id}
                      class={`p-3.5 transition-colors hover:bg-slate-50/80 ${
                        anulado ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-1.5">
                            <span class="font-mono text-xs font-bold text-slate-900">
                              {pago.codigo_comprobante || `#PAG-${pago.id}`}
                            </span>
                            <span
                              class={`rounded-full px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                                anulado
                                  ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {anulado ? 'Anulado' : 'Vigente'}
                            </span>
                          </div>
                          <p class="truncate text-body-xs font-semibold text-slate-800 mt-0.5">
                            {pago.prestamo_cliente || 'Cliente'}
                          </p>
                          <div class="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                            <span>{fmtFechaHora(pago.creado_en)}</span>
                            <span>&middot;</span>
                            <span>{pago.metodo_pago_display || pago.metodo_pago}</span>
                          </div>
                        </div>

                        <div class="text-right shrink-0">
                          <span
                            class={`tnum block text-body-sm font-black ${
                              anulado ? 'text-slate-400 line-through' : 'text-emerald-700'
                            }`}
                          >
                            {fmtMonto(pago.monto_total)}
                          </span>
                          <span class="text-[10px] text-slate-400">
                            Caja: {pago.usuario_nombre}
                          </span>
                        </div>
                      </div>

                      {/* Motivo si fue anulado */}
                      {anulado && pago.motivo_anulacion && (
                        <div class="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-800">
                          <span class="font-bold">Motivo:</span> {pago.motivo_anulacion}
                          {pago.anulado_por_nombre && (
                            <span class="block text-[10px] text-rose-600 mt-0.5">
                              Por: {pago.anulado_por_nombre}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Acciones del Recibo */}
                      <div class="mt-2.5 flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="visibility"
                          onClick={() => {
                            setVerReciboId(pago.id);
                            setAbierto(false);
                          }}
                          class="h-7 text-[11px] px-2"
                        >
                          Ver Recibo
                        </Button>

                        {!anulado && (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon="cancel"
                            onClick={() => handleIniciarCancelacion(pago)}
                            class="h-7 text-[11px] px-2 text-rose-700 border-rose-200 hover:bg-rose-50 hover:border-rose-300"
                            title={
                              esAdmin
                                ? 'Cancelar este recibo y revertir saldos'
                                : 'Solo el Administrador puede cancelar recibos'
                            }
                          >
                            Cancelar Recibo
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              /* Pestaña de Alertas */
              <div class="p-4 space-y-3">
                <div class="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-body-xs text-amber-900">
                  <div class="flex items-center gap-2 font-bold text-amber-800">
                    <Icon name="schedule" size={16} />
                    Ventana de Tolerancia para Cancelación
                  </div>
                  <p class="mt-1 text-[11px] text-amber-800/90">
                    Conforme a la política de tesorería, los recibos emitidos pueden cancelarse de forma atómica dentro de las 72 horas posteriores a su emisión.
                  </p>
                </div>

                {recibosAnulados.length > 0 ? (
                  <div>
                    <h4 class="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Recibos Anulados Recientemente ({recibosAnulados.length})
                    </h4>
                    <div class="space-y-2">
                      {recibosAnulados.map((anul) => (
                        <div
                          key={anul.id}
                          class="rounded-lg border border-slate-200 bg-white p-2.5 text-[11px]"
                        >
                          <div class="flex items-center justify-between font-bold text-slate-800">
                            <span>{anul.codigo_comprobante}</span>
                            <span class="text-rose-600">{fmtMonto(anul.monto_total)}</span>
                          </div>
                          <p class="text-slate-600 mt-0.5">{anul.prestamo_cliente}</p>
                          <p class="text-rose-700 italic mt-1">{anul.motivo_anulacion}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p class="text-center py-4 text-[11px] text-slate-500">
                    No se registran anulaciones en el período activo.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Pie del Panel */}
          <div class="border-t border-slate-100 bg-slate-50 px-4 py-2 text-right">
            <span class="text-[10px] text-slate-400">
              Sistema Contable CAVI &middot; Reversión Inmutable (UAF)
            </span>
          </div>
        </div>
      )}

      {/* Modal para ver e imprimir el recibo */}
      {/* Modal para ver e imprimir el recibo (renderizado en document.body para pantalla completa) */}
      {verReciboId !== null &&
        (typeof document !== 'undefined'
          ? createPortal(
              <PagoRecibo
                pagoId={verReciboId}
                onClose={() => setVerReciboId(null)}
                onAnulado={() => {
                  cargarRecibos();
                  setVerReciboId(null);
                }}
              />,
              document.body
            )
          : (
              <PagoRecibo
                pagoId={verReciboId}
                onClose={() => setVerReciboId(null)}
                onAnulado={() => {
                  cargarRecibos();
                  setVerReciboId(null);
                }}
              />
            ))}

      {/* Modal para cancelar/anular la transacción con contexto integral (renderizado en document.body) */}
      {reciboParaCancelar !== null &&
        (() => {
          const modalCancelar = (
            <Modal
              open={true}
              onClose={() => {
                if (!cancelando) {
                  setReciboParaCancelar(null);
                  setMotivoCancelacion('');
                  setCausaSeleccionada('');
                  setErrorCancelacion('');
                }
              }}
              title={`Anular Transacción ${reciboParaCancelar.codigo_comprobante || ''}`}
              subtitle="Contexto operativo y justificación de reversión contable (Ley N° 977 UAF)"
              icon="warning"
              footer={
                <div class="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
                  <span class="text-[11px] text-slate-500 text-left w-full sm:w-auto">
                    Autorizado por: <strong class="text-slate-800">{user?.nombre_completo || 'Administrador'}</strong>
                  </span>
                  <div class="flex gap-2 justify-end w-full sm:w-auto">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setReciboParaCancelar(null);
                        setMotivoCancelacion('');
                        setCausaSeleccionada('');
                        setErrorCancelacion('');
                      }}
                      disabled={cancelando}
                    >
                      Volver y Conservar
                    </Button>
                    <Button
                      type="submit"
                      form="form-cancelar-recibo"
                      loading={cancelando}
                      disabled={motivoCancelacion.trim().length < 15 || cancelando}
                      class="bg-rose-600 hover:bg-rose-700 text-white font-medium shadow-xs"
                    >
                      Confirmar Anulación Definitiva
                    </Button>
                  </div>
                </div>
              }
            >
              <form id="form-cancelar-recibo" onSubmit={ejecutarCancelacion} class="space-y-4">
                {/* Ficha de Contexto de la Transacción */}
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-body-xs">
                  <div class="flex items-center justify-between pb-2.5 border-b border-slate-200">
                    <div>
                      <span class="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                        Comprobante de Caja
                      </span>
                      <div class="font-mono font-extrabold text-slate-900 text-body-base">
                        {reciboParaCancelar.codigo_comprobante}
                      </div>
                    </div>
                    <div class="text-right">
                      <span class="text-[10px] uppercase font-bold tracking-wider text-rose-500">
                        Total a Revertir
                      </span>
                      <div class="font-mono font-black text-rose-600 text-title-base tnum">
                        {fmtMonto(reciboParaCancelar.monto_total)}
                      </div>
                    </div>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                    <div>
                      <span class="text-slate-400 font-medium block">Prestatario titular:</span>
                      <span class="font-bold text-slate-800 text-xs">
                        {reciboParaCancelar.prestamo_cliente}
                      </span>
                    </div>
                    <div>
                      <span class="text-slate-400 font-medium block">Cajero receptor:</span>
                      <span class="font-semibold text-slate-800">
                        {reciboParaCancelar.usuario_nombre || 'Cajero CAVI'}
                      </span>
                    </div>
                    <div>
                      <span class="text-slate-400 font-medium block">Canal de pago:</span>
                      <span class="font-semibold text-slate-800">
                        {reciboParaCancelar.metodo_pago_display || reciboParaCancelar.metodo_pago}
                        {reciboParaCancelar.referencia_bancaria
                          ? ` (Ref: ${reciboParaCancelar.referencia_bancaria})`
                          : ''}
                      </span>
                    </div>
                    <div>
                      <span class="text-slate-400 font-medium block">Fecha original de cobro:</span>
                      <span class="font-semibold text-slate-800">
                        {fmtFechaHora(reciboParaCancelar.creado_en)}
                      </span>
                    </div>
                  </div>

                  {/* Desglose de Reversión Contable */}
                  <div class="mt-2 rounded-lg bg-white p-2.5 border border-slate-200 space-y-1.5 text-[11px]">
                    <div class="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                      Desglose de Afectación Contable
                    </div>
                    <div class="flex items-center justify-between text-slate-600">
                      <span>Capital devuelto a deuda del cliente:</span>
                      <span class="font-mono font-bold text-slate-900">
                        +{fmtMonto(reciboParaCancelar.aplicacion_capital || 0)}
                      </span>
                    </div>
                    <div class="flex items-center justify-between text-slate-600">
                      <span>Intereses corrientes y mora reactivados:</span>
                      <span class="font-mono font-bold text-slate-900">
                        +{fmtMonto(
                          Number(reciboParaCancelar.aplicacion_interes || 0) +
                            Number(reciboParaCancelar.aplicacion_mora || 0)
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Selector de Causa Principal de la Anulación */}
                <div>
                  <label class="block text-body-xs font-semibold text-slate-700 mb-1.5">
                    Causa principal de la cancelación <span class="text-slate-400 font-normal">(asiste en la justificación formal)</span>:
                  </label>
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {CAUSAS_ANULACION.map((c) => {
                      const activo = causaSeleccionada === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setCausaSeleccionada(c.id);
                            if (c.texto) {
                              setMotivoCancelacion(c.texto);
                              setErrorCancelacion('');
                            }
                          }}
                          class={`px-2.5 py-1.5 text-left text-xs rounded-xl border transition flex items-center gap-1.5 ${
                            activo
                              ? 'bg-rose-50 border-rose-300 text-rose-900 font-bold shadow-xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 font-medium'
                          }`}
                        >
                          <Icon name={c.icono} size={14} class={activo ? 'text-rose-600' : 'text-slate-400'} />
                          <span class="truncate">{c.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Campo de Justificación Obligatoria */}
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <label class="block text-body-xs font-semibold text-slate-700">
                      Contexto circunstanciado / Justificación <span class="text-rose-500">*</span>
                    </label>
                    <span
                      class={`text-[11px] font-mono font-bold flex items-center gap-1 ${
                        motivoCancelacion.trim().length >= 15 ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      {motivoCancelacion.trim().length >= 15 && <Icon name="check_circle" size={13} />}
                      {motivoCancelacion.trim().length}/15 caracteres
                    </span>
                  </div>
                  <textarea
                    value={motivoCancelacion}
                    onInput={(e) => {
                      setMotivoCancelacion((e.currentTarget as HTMLTextAreaElement).value);
                      if (errorCancelacion) setErrorCancelacion('');
                    }}
                    placeholder="Describa con precisión el motivo de la anulación (por ejemplo: error en digitación del comprobante de transferencia bancaria, cliente solicita ajuste inmediato)..."
                    rows={3}
                    required
                    class="w-full rounded-xl border border-slate-200 p-2.5 text-body-sm text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/10 shadow-xs resize-none"
                  />
                  <div class="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Normativa UAF: Se exige una explicación mínima de 15 caracteres.</span>
                    {motivoCancelacion.trim().length < 15 ? (
                      <span class="text-amber-600 font-medium">
                        Faltan {15 - motivoCancelacion.trim().length} caracteres
                      </span>
                    ) : (
                      <span class="text-emerald-600 font-medium">
                        Justificación con longitud válida
                      </span>
                    )}
                  </div>
                </div>

                {/* Advertencia Legal de Impacto */}
                <div class="rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-body-xs text-rose-900 space-y-1">
                  <div class="flex items-center gap-1.5 font-bold text-rose-800">
                    <Icon name="warning" size={16} class="text-rose-600" />
                    Impacto Contable y Legal de la Anulación
                  </div>
                  <ul class="text-[11px] space-y-0.5 text-rose-800 list-disc list-inside">
                    <li>Se reintegrará la deuda al préstamo del cliente por el monto de capital amortizado.</li>
                    <li>Se revertirán los fondos y ganancias distribuidas en las bolsas de capital familiares.</li>
                    <li>La transacción se registrará con severidad CRÍTICA en la bitácora inmutable de auditoría.</li>
                  </ul>
                </div>

                {errorCancelacion && (
                  <p class="text-body-xs font-semibold text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                    {errorCancelacion}
                  </p>
                )}
              </form>
            </Modal>
          );

          return typeof document !== 'undefined'
            ? createPortal(modalCancelar, document.body)
            : modalCancelar;
        })()}
    </div>
  );
}
