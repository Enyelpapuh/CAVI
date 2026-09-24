import { useState, useEffect, useMemo } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { clienteService, fondoService, prestamoService } from '../services/api';
import type { Cliente, Fondo } from '../types';

const fmtMonto = (value: number | string): string => {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
};

interface FondoAporte {
  monto_aportado: string;
  porcentaje_pi: string;
}

type FondoAportes = Record<number, FondoAporte>;

export function PrestamoFormPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSearch, setClienteSearch] = useState('');
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [clienteLabel, setClienteLabel] = useState('');

  const [fondos, setFondos] = useState<Fondo[]>([]);
  const [fondosLoading, setFondosLoading] = useState(true);

  const [montoPrincipal, setMontoPrincipal] = useState('');
  const [tasaInteres, setTasaInteres] = useState('0.0250');
  const [plazoMeses, setPlazoMeses] = useState('12');
  const [periodicidad, setPeriodicidad] = useState<'MENSUAL' | 'QUINCENAL'>('MENSUAL');
  const [fechaDesembolso, setFechaDesembolso] = useState('');
  const [fechaPrimerCorte, setFechaPrimerCorte] = useState('');
  const [aportes, setAportes] = useState<FondoAportes>({});

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [createdPrestamo, setCreatedPrestamo] = useState<any>(null);

  // Cargar fondos disponibles
  useEffect(() => {
    const fetchFondos = async () => {
      setFondosLoading(true);
      try {
        const data = await fondoService.list();
        setFondos(data.results.filter((f: Fondo) => Number(f.saldo_disponible) > 0));
      } catch (err: any) {
        console.error('Error fetching fondos:', err);
      } finally {
        setFondosLoading(false);
      }
    };
    fetchFondos();
  }, []);

  // Búsqueda de clientes (debounced)
  useEffect(() => {
    if (!showClienteDropdown) return;
    const timeout = setTimeout(async () => {
      try {
        const data = await clienteService.list({ search: clienteSearch });
        setClientes(data.results);
      } catch (err: any) {
        console.error('Error fetching clientes:', err);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [clienteSearch, showClienteDropdown]);

  const totalAportado = useMemo(() => {
    return Object.values(aportes).reduce((acc, a) => acc + (Number(a.monto_aportado) || 0), 0);
  }, [aportes]);

  const sumaPi = useMemo(() => {
    return Object.values(aportes).reduce((acc, a) => acc + (Number(a.porcentaje_pi) || 0), 0);
  }, [aportes]);

  const montoPrincipalNum = Number(montoPrincipal) || 0;
  const faltante = montoPrincipalNum - totalAportado;

  const validaciones = useMemo(() => {
    const errors: string[] = [];
    if (!clienteId) errors.push('Seleccione un cliente');
    if (montoPrincipalNum <= 0) errors.push('El monto principal debe ser mayor a cero');
    if (!(Number(plazoMeses) > 0)) errors.push('El plazo debe ser mayor a cero');
    if (!(Number(tasaInteres) >= 0)) errors.push('La tasa de interés es inválida');
    if (!fechaDesembolso) errors.push('Indique la fecha de desembolso');
    if (!fechaPrimerCorte) errors.push('Indique la fecha del primer corte');
    if (fechaDesembolso && fechaPrimerCorte && fechaPrimerCorte < fechaDesembolso)
      errors.push('El primer corte no puede ser antes del desembolso');

    const fondosSeleccionados = Object.keys(aportes).filter((k) => (Number(aportes[Number(k)].monto_aportado) || 0) > 0);
    if (fondosSeleccionados.length === 0) errors.push('Seleccione al menos un fondo con monto aportado');
    if (Math.abs(totalAportado - montoPrincipalNum) > 0.01) {
      errors.push(`La suma de aportes (${totalAportado.toFixed(2)}) debe igualar el monto principal (${montoPrincipalNum.toFixed(2)})`);
    }
    if (Math.abs(sumaPi - 1) > 0.0001) {
      errors.push(`La suma de Pi (${sumaPi.toFixed(4)}) debe ser 1.0000 (100%)`);
    }
    for (const k of fondosSeleccionados) {
      const id = Number(k);
      const fondo = fondos.find((f) => f.id === id);
      if (fondo && Number(aportes[id].monto_aportado) > Number(fondo.saldo_disponible)) {
        errors.push(`El fondo '${fondo.nombre}' no tiene saldo suficiente (${fmtMonto(fondo.saldo_disponible)})`);
      }
    }
    return errors;
  }, [clienteId, montoPrincipalNum, plazoMeses, tasaInteres, fechaDesembolso, fechaPrimerCorte, aportes, totalAportado, sumaPi, fondos]);

  const canSubmit = validaciones.length === 0;

  const toggleFondo = (fondoId: number) => {
    setAportes((prev) => {
      const next = { ...prev };
      if (next[fondoId]) {
        delete next[fondoId];
      } else {
        next[fondoId] = { monto_aportado: '', porcentaje_pi: '' };
      }
      return next;
    });
  };

  const handleMontoAportado = (fondoId: number, monto: string) => {
    setAportes((prev) => {
      const next = { ...prev, [fondoId]: { ...prev[fondoId], monto_aportado: monto } };
      return next;
    });
  };

  const handlePiChange = (fondoId: number, pi: string) => {
    setAportes((prev) => {
      const next = { ...prev, [fondoId]: { ...prev[fondoId], porcentaje_pi: pi } };
      return next;
    });
  };

  // Distribuye automáticamente el monto entre fondos seleccionados y calcula Pi en vivo
  const distribuirAutomatico = () => {
    const ids = Object.keys(aportes).map(Number);
    if (ids.length === 0 || montoPrincipalNum <= 0) return;
    const next: FondoAportes = {};
    let restante = montoPrincipalNum;
    ids.forEach((id, i) => {
      const esUltimo = i === ids.length - 1;
      const monto = esUltimo ? restante : Math.round(((montoPrincipalNum / ids.length) + Number.EPSILON) * 100) / 100;
      restante = Math.round((restante - monto) * 100) / 100;
      next[id] = {
        monto_aportado: monto.toFixed(2),
        porcentaje_pi: montoPrincipalNum > 0 ? (monto / montoPrincipalNum).toFixed(4) : '0.0000',
      };
    });
    setAportes(next);
  };

  // Cuando cambia un monto de aporte, recalcular Pi proporcional si es editable manualmente
  // (el usuario también puede editarlo manualmente)

  const selectCliente = (c: Cliente) => {
    setClienteId(c.id);
    setClienteLabel(`${c.nombres} ${c.apellidos} - ${c.cedula}`);
    setClienteSearch(`${c.nombres} ${c.apellidos} - ${c.cedula}`);
    setShowClienteDropdown(false);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setServerError('');
    try {
      const fondosDetalle = Object.entries(aportes)
        .filter(([, a]) => (Number(a.monto_aportado) || 0) > 0)
        .map(([fondoId, a]) => ({
          fondo: Number(fondoId),
          monto_aportado: a.monto_aportado,
          porcentaje_pi: a.porcentaje_pi,
        }));

      const prestamo = await prestamoService.create({
        cliente: clienteId!,
        monto_principal: montoPrincipal,
        tasa_interes: tasaInteres,
        plazo_meses: Number(plazoMeses),
        periodicidad,
        fecha_desembolso: fechaDesembolso,
        fecha_primer_corte: fechaPrimerCorte,
        fondos_detalle: fondosDetalle,
      });
      setCreatedPrestamo(prestamo);
      setShowConfirm(false);
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.fondos_detalle) {
        setServerError((data.fondos_detalle as string[]).map(String).join(' '));
      } else if (data?.detail) {
        setServerError(String(data.detail));
      } else if (data && typeof data === 'object') {
        const msgs = Object.entries(data).flatMap(([k, v]) =>
          Array.isArray(v) ? v.map(String) : [`${k}: ${String(v)}`]
        );
        setServerError(msgs.join(' ') || 'Error al crear el préstamo');
      } else {
        setServerError('Error al crear el préstamo');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setClienteId(null);
    setClienteLabel('');
    setClienteSearch('');
    setMontoPrincipal('');
    setTasaInteres('0.0250');
    setPlazoMeses('12');
    setPeriodicidad('MENSUAL');
    setFechaDesembolso('');
    setFechaPrimerCorte('');
    setAportes({});
    setServerError('');
    setCreatedPrestamo(null);
  };

  return (
    <Layout>
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 class="text-2xl font-bold text-gray-900">Solicitud de Crédito</h2>
          <span class="text-sm text-gray-500">Desembolso multifondo</span>
        </div>

        {createdPrestamo ? (
          <div class="bg-white shadow rounded-lg p-8 text-center">
            <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg class="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 class="mt-4 text-lg font-medium text-gray-900">Préstamo #{createdPrestamo.id} creado exitosamente</h3>
            <p class="mt-1 text-sm text-gray-500">
              {createdPrestamo.cliente_nombre} - {fmtMonto(createdPrestamo.monto_principal)}
            </p>
            <div class="mt-6 flex justify-center space-x-3">
              <button
                onClick={resetForm}
                class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Nuevo Préstamo
              </button>
            </div>
          </div>
        ) : (
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna izquierda: datos del préstamo */}
            <div class="lg:col-span-1 space-y-6">
              <div class="bg-white shadow rounded-lg p-6 space-y-4">
                <h3 class="text-lg font-medium text-gray-900">Datos del Cliente</h3>
                <div>
                  <label htmlFor="cliente-search" class="block text-sm font-medium text-gray-700">Cliente</label>
                  <div class="relative mt-1">
                    <input
                      id="cliente-search"
                      type="text"
                      value={clienteSearch}
                      onFocus={() => setShowClienteDropdown(true)}
                      onInput={(e) => {
                        setClienteSearch(e.currentTarget.value);
                        setClienteId(null);
                        setShowClienteDropdown(true);
                      }}
                      placeholder="Buscar por nombre o cédula..."
                      class="block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                    {showClienteDropdown && (
                      <div class="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
                        {clientes.length === 0 ? (
                          <div class="px-4 py-3 text-sm text-gray-500">Sin resultados</div>
                        ) : (
                          clientes.filter((c) => c.activo).map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => selectCliente(c)}
                              class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50"
                            >
                              <span class="font-medium">{c.nombres} {c.apellidos}</span>
                              <span class="block text-xs text-gray-500">{c.cedula}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {clienteId && (
                    <p class="mt-1 text-xs text-green-700">
                      ✓ Cliente seleccionado: {clienteLabel}
                    </p>
                  )}
                </div>
              </div>

              <div class="bg-white shadow rounded-lg p-6 space-y-4">
                <h3 class="text-lg font-medium text-gray-900">Condiciones del Préstamo</h3>
                <div>
                  <label htmlFor="monto_principal" class="block text-sm font-medium text-gray-700">Monto principal (C$)</label>
                  <input
                    id="monto_principal"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={montoPrincipal}
                    onInput={(e) => setMontoPrincipal(e.currentTarget.value)}
                    class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="tasa" class="block text-sm font-medium text-gray-700">Tasa mensual</label>
                    <input
                      id="tasa"
                      type="number"
                      step="0.0001"
                      min="0"
                      value={tasaInteres}
                      onInput={(e) => setTasaInteres(e.currentTarget.value)}
                      class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                    <p class="mt-1 text-xs text-gray-400">Decimal, ej: 0.0250</p>
                  </div>
                  <div>
                    <label htmlFor="plazo" class="block text-sm font-medium text-gray-700">Plazo (meses)</label>
                    <input
                      id="plazo"
                      type="number"
                      min="1"
                      value={plazoMeses}
                      onInput={(e) => setPlazoMeses(e.currentTarget.value)}
                      class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Periodicidad</label>
                  <select
                    value={periodicidad}
                    onChange={(e) => setPeriodicidad(e.currentTarget.value as 'MENSUAL' | 'QUINCENAL')}
                    class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white"
                  >
                    <option value="MENSUAL">Mensual</option>
                    <option value="QUINCENAL">Quincenal</option>
                  </select>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="fec_des" class="block text-sm font-medium text-gray-700">Fecha desembolso</label>
                    <input
                      id="fec_des"
                      type="date"
                      value={fechaDesembolso}
                      onInput={(e) => setFechaDesembolso(e.currentTarget.value)}
                      class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="fec_corte" class="block text-sm font-medium text-gray-700">Fecha primer corte</label>
                    <input
                      id="fec_corte"
                      type="date"
                      value={fechaPrimerCorte}
                      onInput={(e) => setFechaPrimerCorte(e.currentTarget.value)}
                      class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Columna derecha: selector de fondos */}
            <div class="lg:col-span-2 space-y-6">
              <div class="bg-white shadow rounded-lg">
                <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 class="text-lg font-medium text-gray-900">Distribución Multifondo</h3>
                  <div class="flex space-x-2">
                    <button
                      type="button"
                      onClick={distribuirAutomatico}
                      disabled={Object.keys(aportes).length === 0 || montoPrincipalNum <= 0}
                      class="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md disabled:opacity-50"
                    >
                      Distribuir automático
                    </button>
                  </div>
                </div>

                {fondosLoading ? (
                  <div class="p-8 text-center">
                    <div class="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mx-auto"></div>
                  </div>
                ) : fondos.length === 0 ? (
                  <div class="p-12 text-center text-gray-500">No hay fondos con saldo disponible</div>
                ) : (
                  <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                      <thead class="bg-gray-50">
                        <tr>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">Uso</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fondo</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo disponible</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monto aportado</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">% Pi</th>
                        </tr>
                      </thead>
                      <tbody class="bg-white divide-y divide-gray-200">
                        {fondos.map((fondo) => {
                          const activo = !!aportes[fondo.id];
                          const aporte = aportes[fondo.id];
                          const sobreSaldo = activo && Number(aporte.monto_aportado) > Number(fondo.saldo_disponible);
                          return (
                            <tr key={fondo.id} class={`hover:bg-gray-50 ${activo ? 'bg-blue-50/50' : ''}`}>
                              <td class="px-6 py-3">
                                <input
                                  type="checkbox"
                                  checked={activo}
                                  onChange={() => toggleFondo(fondo.id)}
                                  class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                              </td>
                              <td class="px-6 py-3">
                                <span class="text-sm font-medium text-gray-900">{fondo.nombre}</span>
                                <span class="block text-xs text-gray-500">{fondo.familiar}</span>
                              </td>
                              <td class="px-6 py-3 whitespace-nowrap text-sm text-gray-900">{fmtMonto(fondo.saldo_disponible)}</td>
                              <td class="px-6 py-3">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  disabled={!activo}
                                  value={activo ? aporte.monto_aportado : ''}
                                  onInput={(e) => handleMontoAportado(fondo.id, e.currentTarget.value)}
                                  placeholder="0.00"
                                  class={`block w-32 border rounded-md shadow-sm px-3 py-1.5 sm:text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400 ${
                                    sobreSaldo ? 'border-red-400 bg-red-50' : 'border-gray-300'
                                  }`}
                                />
                              </td>
                              <td class="px-6 py-3">
                                <input
                                  type="number"
                                  step="0.0001"
                                  min="0"
                                  max="1"
                                  disabled={!activo}
                                  value={activo ? aporte.porcentaje_pi : ''}
                                  onInput={(e) => handlePiChange(fondo.id, e.currentTarget.value)}
                                  placeholder="0.0000"
                                  class="block w-32 border border-gray-300 rounded-md shadow-sm px-3 py-1.5 sm:text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Resumen y validación */}
              <div class="bg-white shadow rounded-lg p-6">
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p class="text-sm text-gray-500">Monto principal</p>
                    <p class="text-lg font-semibold text-gray-900">{fmtMonto(montoPrincipalNum)}</p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-500">Total aportado</p>
                    <p class={`text-lg font-semibold ${Math.abs(faltante) <= 0.01 ? 'text-green-700' : 'text-orange-600'}`}>
                      {fmtMonto(totalAportado)}
                    </p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-500">Faltante/Excedente</p>
                    <p class={`text-lg font-semibold ${Math.abs(faltante) <= 0.01 ? 'text-green-700' : 'text-red-600'}`}>
                      {faltante >= 0 ? 'Falta ' : 'Excede '}
                      {fmtMonto(Math.abs(faltante))}
                    </p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-500">Σ Pi</p>
                    <p class={`text-lg font-semibold ${Math.abs(sumaPi - 1) <= 0.0001 ? 'text-green-700' : 'text-red-600'}`}>
                      {sumaPi.toFixed(4)}
                    </p>
                  </div>
                </div>

                {serverError && (
                  <div class="mt-4 rounded-md bg-red-50 border border-red-200 px-4 py-3">
                    <p class="text-sm text-red-700">{serverError}</p>
                  </div>
                )}

                {validaciones.length > 0 && (
                  <div class="mt-4 rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3">
                    <ul class="list-disc list-inside space-y-1">
                      {validaciones.map((err, i) => (
                        <li key={i} class="text-sm text-yellow-800">{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div class="mt-6 flex justify-end">
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={!canSubmit || submitting}
                    class="px-6 py-2.5 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Revisar y Crear Préstamo
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de confirmación */}
        {showConfirm && (
          <div class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex min-h-full items-center justify-center p-4">
              <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowConfirm(false)} />
              <div class="relative bg-white rounded-lg shadow-xl max-w-lg w-full">
                <div class="px-6 py-4 border-b border-gray-200">
                  <h3 class="text-lg font-medium text-gray-900">Confirmar Desembolso</h3>
                </div>
                <div class="px-6 py-4 space-y-4 max-h-96 overflow-y-auto">
                  <div class="rounded-md bg-gray-50 px-4 py-3 space-y-1 text-sm">
                    <div class="flex justify-between">
                      <span class="text-gray-600">Cliente</span>
                      <span class="font-medium text-gray-900">{clienteLabel}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-600">Monto principal</span>
                      <span class="font-medium text-gray-900">{fmtMonto(montoPrincipalNum)}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-600">Tasa / Plazo</span>
                      <span class="font-medium text-gray-900">{Number(tasaInteres).toFixed(4)} · {plazoMeses} meses</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-600">Desembolso</span>
                      <span class="font-medium text-gray-900">{fechaDesembolso}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-600">Primer corte</span>
                      <span class="font-medium text-gray-900">{fechaPrimerCorte}</span>
                    </div>
                  </div>

                  <div>
                    <p class="text-sm font-medium text-gray-700 mb-2">Débitos por fondo</p>
                    <table class="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-md">
                      <thead class="bg-gray-50">
                        <tr>
                          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fondo</th>
                          <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
                          <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Pi</th>
                        </tr>
                      </thead>
                      <tbody class="bg-white divide-y divide-gray-200">
                        {Object.entries(aportes)
                          .filter(([, a]) => (Number(a.monto_aportado) || 0) > 0)
                          .map(([fondoId, a]) => {
                            const fondo = fondos.find((f) => f.id === Number(fondoId));
                            return (
                              <tr key={fondoId}>
                                <td class="px-3 py-2 text-sm text-gray-900">{fondo?.nombre ?? fondoId}</td>
                                <td class="px-3 py-2 text-right text-sm font-medium text-gray-900">{fmtMonto(a.monto_aportado)}</td>
                                <td class="px-3 py-2 text-right text-sm text-gray-700">{Number(a.porcentaje_pi).toFixed(4)}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                  <button
                    onClick={() => setShowConfirm(false)}
                    class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    class="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting ? 'Creando...' : 'Confirmar Desembolso'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}