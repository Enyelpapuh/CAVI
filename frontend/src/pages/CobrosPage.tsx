import { useState, useEffect, useMemo } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { prestamoService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Prestamo, Pago } from '../types';

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

const estadoBadge: Record<string, string> = {
  VIGENTE: 'bg-green-100 text-green-800',
  EN_GRACIA: 'bg-blue-100 text-blue-800',
  EN_MORA: 'bg-red-100 text-red-800',
  CANCELADO: 'bg-gray-100 text-gray-800',
};

const METODOS = [
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTRO', label: 'Otro' },
];

interface PasoModal {
  tipo: 'cobro' | 'confirmar' | 'recibo';
}

export function CobrosPage() {
  const { user } = useAuth();
  const esCobranza = user?.rol === 'COBRANZA';

  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Prestamo | null>(null);
  const [paso, setPaso] = useState<PasoModal>({ tipo: 'cobro' });
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [referencia, setReferencia] = useState('');
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pago, setPago] = useState<Pago | null>(null);

  const fetchPrestamos = async () => {
    setLoading(true);
    try {
      const resultados = await Promise.all(
        ['VIGENTE', 'EN_MORA'].map((estado) => prestamoService.list({ estado }))
      );
      const unicos = new Map<number, Prestamo>();
      resultados.forEach((r) =>
        r.results.forEach((p: Prestamo) => unicos.set(p.id, p))
      );
      setPrestamos(Array.from(unicos.values()));
    } catch (err: any) {
      console.error('Error fetching prestamos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrestamos();
  }, []);

  const filtrados = useMemo(() => {
    const texto = search.trim().toLowerCase();
    if (!texto) return prestamos;
    return prestamos.filter(
      (p) =>
        p.cliente_nombre.toLowerCase().includes(texto) ||
        String(p.id).includes(texto)
    );
  }, [prestamos, search]);

  const minimoInteres = selected ? Number(selected.interes_minimo_ciclo) || 0 : 0;
  const montoNum = Number(monto) || 0;
  const saldoDeudorNum = selected ? Number(selected.saldo_deudor) || 0 : 0;

  const validacion = useMemo(() => {
    const errores: string[] = [];
    if (montoNum <= 0) {
      errores.push('Ingrese un monto mayor a cero');
    } else if (montoNum < minimoInteres) {
      errores.push(
        `El pago mínimo aceptado es el interés del ciclo (${fmtMonto(minimoInteres)}). Art. 3180 del Código Civil.`
      );
    }
    if (!fechaPago) errores.push('Indique la fecha del pago');
    if (metodoPago === 'TRANSFERENCIA' && !referencia.trim()) {
      errores.push('Las transferencias requieren referencia bancaria');
    }
    return errores;
  }, [montoNum, minimoInteres, fechaPago, metodoPago, referencia]);

  const puedeConfirmar = validacion.length === 0;

  const abrirCobro = (prestamo: Prestamo) => {
    setSelected(prestamo);
    setPaso({ tipo: 'cobro' });
    setMonto('');
    setMetodoPago('EFECTIVO');
    setReferencia('');
    setError('');
    setPago(null);
    setFechaPago(new Date().toISOString().slice(0, 10));
  };

  const cerrarModal = () => {
    setSelected(null);
    setPaso({ tipo: 'cobro' });
    setError('');
    setPago(null);
  };

  const registrarPago = async () => {
    if (!selected || !puedeConfirmar) return;
    setSubmitting(true);
    setError('');
    try {
      const creado = await prestamoService.pagar(selected.id, {
        monto,
        fecha_pago: fechaPago,
        metodo_pago: metodoPago,
        referencia_bancaria: referencia,
      });
      setPago(creado);
      setPaso({ tipo: 'recibo' });
      fetchPrestamos();
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.monto) {
        setError((data.monto as string[]).join(' '));
      } else if (data?.detail) {
        setError(String(data.detail));
      } else {
        setError('No se pudo registrar el cobro');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const pasarAConfirmar = () => {
    setError('');
    setPaso({ tipo: 'confirmar' });
  };

  return (
    <Layout>
      <div class="space-y-6 max-w-3xl mx-auto">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 class="text-2xl font-bold text-gray-900">Asentamiento de Cobros</h2>
            <p class="text-sm text-gray-500 mt-1">
              El pago se imputa primero a mora, luego interés corriente y después capital (Art. 3180 C.C.)
            </p>
            {esCobranza && (
              <p class="text-xs text-gray-400 mt-1">
                Vista restringida por privacidad (Ley 787): no incluye utilidades ni origen de fondos.
              </p>
            )}
          </div>
        </div>

        <div class="bg-white shadow rounded-lg p-4">
          <div class="max-w-md">
            <label htmlFor="buscar-cobro" class="sr-only">Buscar préstamo por cliente</label>
            <input
              id="buscar-cobro"
              type="text"
              value={search}
              onInput={(e) => setSearch(e.currentTarget.value)}
              placeholder="Buscar por cliente o # de préstamo..."
              class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div class="bg-white shadow rounded-lg p-8 text-center">
            <div class="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mx-auto"></div>
            <p class="mt-2 text-gray-600">Cargando préstamos...</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div class="bg-white shadow rounded-lg p-12 text-center text-gray-500">
            No hay préstamos activos para cobrar
          </div>
        ) : (
          <div class="space-y-3">
            {filtrados.map((prestamo) => (
              <button
                key={prestamo.id}
                onClick={() => abrirCobro(prestamo)}
                class="w-full text-left bg-white shadow rounded-lg p-5 hover:shadow-md hover:bg-gray-50 transition flex items-center justify-between gap-4"
              >
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${estadoBadge[prestamo.estado] || ''}`}>
                      {prestamo.estado}
                    </span>
                    <span class="text-xs text-gray-400">#{prestamo.id}</span>
                  </div>
                  <p class="mt-1 text-sm font-semibold text-gray-900 truncate">{prestamo.cliente_nombre}</p>
                  <p class="text-xs text-gray-500">
                    {prestamo.periodicidad === 'MENSUAL' ? 'Mensual' : 'Quincenal'} · {prestamo.plazo_meses} meses · {fmtMonto(Number(prestamo.tasa_interes) * 100)}%
                  </p>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-xl font-bold text-gray-900">{fmtMonto(prestamo.saldo_deudor)}</p>
                  <p class="text-xs text-gray-500">
                    {prestamo.proxima_cuota
                      ? `Cuota ${fmtFecha(prestamo.proxima_cuota.fecha_vencimiento)}: ${fmtMonto(prestamo.proxima_cuota.cuota)}`
                      : 'Sin cuotas pendientes'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-4">
              <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={cerrarModal} />

              {paso.tipo !== 'recibo' ? (
                <div class="relative bg-white rounded-t-xl sm:rounded-lg shadow-xl max-w-lg w-full p-6">
                  <div class="flex items-start justify-between mb-4">
                    <div>
                      <h3 class="text-lg font-medium text-gray-900">
                        Cobro a {selected.cliente_nombre}
                      </h3>
                      <p class="text-sm text-gray-500">
                        #{selected.id} · Saldo deudor: {fmtMonto(selected.saldo_deudor)}
                      </p>
                    </div>
                    <button onClick={cerrarModal} aria-label="Cerrar" class="text-gray-400 hover:text-gray-600">
                      <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {paso.tipo === 'cobro' && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (puedeConfirmar) pasarAConfirmar();
                      }}
                      class="space-y-4"
                    >
                      <div>
                        <label htmlFor="monto-cobro" class="block text-sm font-medium text-gray-700">
                          Monto a cobrar (C$)
                        </label>
                        <input
                          id="monto-cobro"
                          type="number"
                          step="0.01"
                          min="0.01"
                          inputmode="decimal"
                          value={monto}
                          onInput={(e) => setMonto(e.currentTarget.value)}
                          placeholder="0.00"
                          class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                        <p class="mt-1 text-xs text-gray-500">
                          Mínimo del ciclo: {fmtMonto(minimoInteres)} · Saldo deudor: {fmtMonto(saldoDeudorNum)}
                        </p>
                      </div>

                      <div>
                        <label htmlFor="metodo-pago" class="block text-sm font-medium text-gray-700">Método de pago</label>
                        <select
                          id="metodo-pago"
                          value={metodoPago}
                          onChange={(e) => setMetodoPago(e.currentTarget.value)}
                          class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white"
                        >
                          {METODOS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </div>

                      {metodoPago === 'TRANSFERENCIA' && (
                        <div>
                          <label htmlFor="ref-bancaria" class="block text-sm font-medium text-gray-700">Referencia bancaria</label>
                          <input
                            id="ref-bancaria"
                            type="text"
                            value={referencia}
                            onInput={(e) => setReferencia(e.currentTarget.value)}
                            placeholder="No. de transferencia"
                            class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          />
                        </div>
                      )}

                      <div>
                        <label htmlFor="fecha-pago" class="block text-sm font-medium text-gray-700">Fecha del pago</label>
                        <input
                          id="fecha-pago"
                          type="date"
                          value={fechaPago}
                          onInput={(e) => setFechaPago(e.currentTarget.value)}
                          class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                      </div>

                      {validacion.map((v) => (
                        <p key={v} class="text-sm text-red-600">{v}</p>
                      ))}
                      {error && <p class="text-sm text-red-600">{error}</p>}

                      <div class="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={cerrarModal} class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={!puedeConfirmar}
                          class="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                        >
                          Continuar
                        </button>
                      </div>
                    </form>
                  )}

                  {paso.tipo === 'confirmar' && (
                    <div class="space-y-4">
                      <div class="rounded-md bg-gray-50 border border-gray-200 px-4 py-3 space-y-2">
                        <div class="flex justify-between text-sm">
                          <span class="text-gray-500">Monto recibido</span>
                          <span class="font-medium text-gray-900">{fmtMonto(monto)}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                          <span class="text-gray-500">Método</span>
                          <span class="font-medium text-gray-900">
                            {METODOS.find((m) => m.value === metodoPago)?.label}
                          </span>
                        </div>
                        <div class="flex justify-between text-sm">
                          <span class="text-gray-500">Fecha</span>
                          <span class="font-medium text-gray-900">{fmtFecha(fechaPago)}</span>
                        </div>
                      </div>

                      {error && <p class="text-sm text-red-600">{error}</p>}

                      <div class="flex justify-end space-x-3 pt-4">
                        <button
                          type="button"
                          onClick={() => setPaso({ tipo: 'cobro' })}
                          class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                        >
                          Atrás
                        </button>
                        <button
                          type="button"
                          onClick={registrarPago}
                          disabled={submitting}
                          class="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                        >
                          {submitting ? 'Registrando...' : 'Confirmar Cobro'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div class="relative bg-white rounded-t-xl sm:rounded-lg shadow-xl max-w-lg w-full p-6">
                  <div class="text-center">
                    <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                      <svg class="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 class="mt-4 text-lg font-medium text-gray-900">Cobro registrado</h3>
                    <p class="mt-1 text-sm text-gray-500">
                      {pago?.codigo_comprobante} · {fmtMonto(pago?.monto_total ?? 0)}
                    </p>
                    {Number(pago?.exceso_no_aplicado || 0) > 0 && (
                      <p class="mt-2 text-xs text-orange-700 bg-orange-50 rounded-md px-3 py-2 inline-block">
                        El excedente de {fmtMonto(pago?.exceso_no_aplicado ?? 0)} no fue aplicado por superar la deuda.
                      </p>
                    )}
                  </div>
                  <div class="mt-6 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p class="text-gray-500">Amortización capital</p>
                      <p class="font-medium text-gray-900">{fmtMonto(pago?.aplicacion_capital ?? 0)}</p>
                    </div>
                    <div>
                      <p class="text-gray-500">Interés corriente</p>
                      <p class="font-medium text-gray-900">{fmtMonto(pago?.aplicacion_interes ?? 0)}</p>
                    </div>
                    <div>
                      <p class="text-gray-500">Mora</p>
                      <p class="font-medium text-gray-900">{fmtMonto(pago?.aplicacion_mora ?? 0)}</p>
                    </div>
                    <div>
                      <p class="text-gray-500">Saldo insoluto (capital)</p>
                      <p class="font-medium text-gray-900">{fmtMonto(pago?.saldo_insoluto_tras_pago ?? selected.saldo_insoluto)}</p>
                    </div>
                  </div>
                  <div class="mt-6 flex justify-center space-x-3">
                    <button
                      onClick={cerrarModal}
                      class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      Registrar otro cobro
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}