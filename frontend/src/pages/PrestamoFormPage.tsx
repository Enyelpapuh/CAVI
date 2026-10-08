import { useState, useEffect, useMemo } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  Icon,
  Input,
  Modal,
  Select,
  Spinner,
  type Columna,
} from '../components/ui';
import { clienteService, fondoService, prestamoService } from '../services/api';
import { BotonPagare } from '../components/BotonPagare';
import { fmtMonto, fmtNumero, fmtFecha, iniciales } from '../lib/format';
import type { Cliente, Fondo, PeriodoCuota, Prestamo, Proyeccion } from '../types';

interface FondoAporte {
  monto_aportado: string;
  porcentaje_pi: string;
}

type FondoAportes = Record<number, FondoAporte>;

const PERIODICIDADES = [
  { value: 'MENSUAL', label: 'Mensual' },
  { value: 'QUINCENAL', label: 'Quincenal' },
];

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

  const [simulacion, setSimulacion] = useState<Proyeccion | null>(null);
  const [simulando, setSimulando] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [createdPrestamo, setCreatedPrestamo] = useState<Prestamo | null>(null);

  useEffect(() => {
    const fetchFondos = async () => {
      setFondosLoading(true);
      try {
        const data = await fondoService.list();
        setFondos(data.results.filter((f: Fondo) => Number(f.saldo_disponible) > 0));
      } catch {
        setServerError('No se pudieron cargar los fondos disponibles');
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
      } catch {
        setClientes([]);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [clienteSearch, showClienteDropdown]);

  const totalAportado = useMemo(
    () => Object.values(aportes).reduce((acc, a) => acc + (Number(a.monto_aportado) || 0), 0),
    [aportes]
  );

  const sumaPi = useMemo(
    () => Object.values(aportes).reduce((acc, a) => acc + (Number(a.porcentaje_pi) || 0), 0),
    [aportes]
  );

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

    const fondosSeleccionados = Object.keys(aportes).filter(
      (k) => (Number(aportes[Number(k)].monto_aportado) || 0) > 0
    );
    if (fondosSeleccionados.length === 0) errors.push('Seleccione al menos un fondo con monto aportado');
    if (Math.abs(totalAportado - montoPrincipalNum) > 0.01) {
      errors.push(
        `La suma de aportes (${totalAportado.toFixed(2)}) debe igualar el monto principal (${montoPrincipalNum.toFixed(2)})`
      );
    }
    if (Math.abs(sumaPi - 1) > 0.0001) {
      errors.push(`La suma de Pi (${sumaPi.toFixed(4)}) debe ser 1.0000 (100%)`);
    }
    for (const k of fondosSeleccionados) {
      const id = Number(k);
      const fondo = fondos.find((f) => f.id === id);
      if (fondo && Number(aportes[id].monto_aportado) > Number(fondo.saldo_disponible)) {
        errors.push(
          `El fondo '${fondo.nombre}' no tiene saldo suficiente (${fmtMonto(fondo.saldo_disponible)})`
        );
      }
    }
    return errors;
  }, [
    clienteId,
    montoPrincipalNum,
    plazoMeses,
    tasaInteres,
    fechaDesembolso,
    fechaPrimerCorte,
    aportes,
    totalAportado,
    sumaPi,
    fondos,
  ]);

  const canSubmit = validaciones.length === 0;

  /** Cotizador: usa POST /api/prestamos/simular/ (no persiste nada). */
  useEffect(() => {
    if (montoPrincipalNum <= 0 || !(Number(plazoMeses) > 0) || !(Number(tasaInteres) >= 0)) {
      setSimulacion(null);
      return;
    }
    let vigente = true;
    setSimulando(true);
    const temporizador = setTimeout(() => {
      prestamoService
        .simular({
          monto_principal: montoPrincipal,
          tasa_interes: tasaInteres,
          plazo_meses: Number(plazoMeses),
          periodicidad,
          ...(fechaPrimerCorte ? { fecha_primer_corte: fechaPrimerCorte } : {}),
        })
        .then((data) => {
          if (vigente) setSimulacion(data);
        })
        .catch(() => {
          // Tasa de usura u otro rechazo: el backend lo valida al crear también.
          if (vigente) setSimulacion(null);
        })
        .finally(() => {
          if (vigente) setSimulando(false);
        });
    }, 400);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [montoPrincipal, tasaInteres, plazoMeses, periodicidad, fechaPrimerCorte, montoPrincipalNum]);

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
    setAportes((prev) => ({ ...prev, [fondoId]: { ...prev[fondoId], monto_aportado: monto } }));
  };

  const handlePiChange = (fondoId: number, pi: string) => {
    setAportes((prev) => ({ ...prev, [fondoId]: { ...prev[fondoId], porcentaje_pi: pi } }));
  };

  /** Reparte el monto en partes iguales y recalcula Pi con el último ajuste de centavos. */
  const distribuirAutomatico = () => {
    const ids = Object.keys(aportes).map(Number);
    if (ids.length === 0 || montoPrincipalNum <= 0) return;
    const next: FondoAportes = {};
    let restante = montoPrincipalNum;
    ids.forEach((id, i) => {
      const esUltimo = i === ids.length - 1;
      const monto = esUltimo
        ? restante
        : Math.round(((montoPrincipalNum / ids.length) + Number.EPSILON) * 100) / 100;
      restante = Math.round((restante - monto) * 100) / 100;
      next[id] = {
        monto_aportado: monto.toFixed(2),
        porcentaje_pi: (monto / montoPrincipalNum).toFixed(4),
      };
    });
    setAportes(next);
  };

  const selectCliente = (c: Cliente) => {
    const etiqueta = `${c.nombres} ${c.apellidos} - ${c.cedula}`;
    setClienteId(c.id);
    setClienteLabel(etiqueta);
    setClienteSearch(etiqueta);
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
        setServerError(
          Object.entries(data)
            .flatMap(([k, v]) => (Array.isArray(v) ? v.map(String) : [`${k}: ${String(v)}`]))
            .join(' ') || 'Error al crear el préstamo'
        );
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
    setSimulacion(null);
    setCreatedPrestamo(null);
  };

  const columnasSimulacion: Columna<PeriodoCuota>[] = [
    {
      key: 'periodo',
      header: '#',
      width: '60px',
      render: (periodo) => <span class="tnum text-slate-600">{periodo.periodo}</span>,
    },
    {
      key: 'vencimiento',
      header: 'Vencimiento',
      render: (periodo) => (
        <span class="tnum text-slate-700">{fmtFecha(periodo.fecha_vencimiento)}</span>
      ),
    },
    {
      key: 'interes',
      header: 'Interés',
      align: 'right',
      render: (periodo) => <span class="tnum text-slate-600">{fmtMonto(periodo.interes)}</span>,
    },
    {
      key: 'capital',
      header: 'Capital',
      align: 'right',
      render: (periodo) => <span class="tnum text-slate-700">{fmtMonto(periodo.capital)}</span>,
    },
    {
      key: 'cuota',
      header: 'Cuota',
      align: 'right',
      render: (periodo) => (
        <span class="tnum font-semibold text-slate-900">{fmtMonto(periodo.cuota)}</span>
      ),
    },
    {
      key: 'saldo',
      header: 'Saldo insoluto',
      align: 'right',
      render: (periodo) => <span class="tnum text-slate-600">{fmtMonto(periodo.saldo_insoluto)}</span>,
    },
  ];

  const filasAporte = useMemo(
    () =>
      fondos
        .filter((fondo) => (Number(aportes[fondo.id]?.monto_aportado) || 0) > 0)
        .map((fondo) => ({ fondo, aporte: aportes[fondo.id] })),
    [fondos, aportes]
  );

  return (
    <Layout titulo="Nuevo Préstamo">
      <PageHeader
        titulo="Solicitud de Crédito"
        descripcion="Desembolso multifondo con interés sobre saldo insoluto (Ley 176, sin anatocismo)"
      />

      {createdPrestamo ? (
        <Card class="text-center">
          <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
            <Icon name="check_circle" size={32} />
          </span>
          <h2 class="mt-4 text-headline-md text-slate-900">
            Préstamo #{createdPrestamo.id} creado exitosamente
          </h2>
          <p class="mt-1 text-body-md text-slate-500">
            {createdPrestamo.cliente_nombre} · {fmtMonto(createdPrestamo.monto_principal)}
          </p>
          <div class="mt-6 flex flex-wrap justify-center gap-3">
            <BotonPagare
              prestamoId={createdPrestamo.id}
              variant="primary"
              label="Descargar Pagaré"
              onError={setServerError}
            />
            <Button icon="add" onClick={resetForm}>
              Nuevo Préstamo
            </Button>
            <Button variant="secondary" icon="point_of_sale" onClick={() => (location.href = '/cobros')}>
              Ir a Cobranza
            </Button>
          </div>
          <p class="mt-3 text-body-sm text-slate-500">
            Entregue el pagaré firmado al cliente: es el título valor del crédito (CAVI-TK25).
          </p>
          {serverError && (
            <p class="mt-2 text-body-sm text-red-700" role="alert">
              {serverError}
            </p>
          )}
        </Card>
      ) : (
        <div class="grid gap-4 lg:grid-cols-3">
          <div class="space-y-4">
            <Card title="Datos del Cliente">
              <Input
                label="Cliente"
                value={clienteSearch}
                onInput={(valor) => {
                  setClienteSearch(valor);
                  setClienteId(null);
                  setShowClienteDropdown(true);
                }}
                placeholder="Buscar por nombre o cédula..."
                hint={clienteId ? `✓ Cliente seleccionado: ${clienteLabel}` : undefined}
              />
              {showClienteDropdown && (
                <ul class="mt-2 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-popover">
                  {clientes.filter((c) => c.activo).length === 0 ? (
                    <li class="px-4 py-3 text-body-md text-slate-500">Sin resultados</li>
                  ) : (
                    clientes
                      .filter((c) => c.activo)
                      .map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => selectCliente(c)}
                            class="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-slate-50"
                          >
                            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-label-xs font-bold text-slate-600">
                              {iniciales(`${c.nombres} ${c.apellidos}`)}
                            </span>
                            <span class="min-w-0">
                              <span class="block truncate text-body-md font-medium text-slate-800">
                                {c.nombres} {c.apellidos}
                              </span>
                              <span class="tnum block text-body-sm text-slate-500">{c.cedula}</span>
                            </span>
                          </button>
                        </li>
                      ))
                  )}
                </ul>
              )}
            </Card>

            <Card title="Condiciones del Préstamo">
              <div class="space-y-4">
                <Input
                  label="Monto principal (C$)"
                  value={montoPrincipal}
                  onInput={setMontoPrincipal}
                  type="number"
                  step="0.01"
                  min="0.01"
                  prefix="C$"
                  required
                />
                <div class="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Tasa mensual"
                    value={tasaInteres}
                    onInput={setTasaInteres}
                    type="number"
                    step="0.0001"
                    min="0"
                    hint="Decimal, ej: 0.0250"
                  />
                  <Input
                    label="Plazo (meses)"
                    value={plazoMeses}
                    onInput={setPlazoMeses}
                    type="number"
                    min="1"
                  />
                </div>
                <Select
                  label="Periodicidad"
                  value={periodicidad}
                  onChange={(valor) => setPeriodicidad(valor as 'MENSUAL' | 'QUINCENAL')}
                  options={PERIODICIDADES}
                />
                <div class="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Fecha desembolso"
                    value={fechaDesembolso}
                    onInput={setFechaDesembolso}
                    type="date"
                  />
                  <Input
                    label="Fecha primer corte"
                    value={fechaPrimerCorte}
                    onInput={setFechaPrimerCorte}
                    type="date"
                  />
                </div>
              </div>
            </Card>
          </div>

          <div class="space-y-4 lg:col-span-2">
            <Card
              title="Distribución Multifondo"
              subtitle="Los aportes deben sumar el monto principal y Σ Pi = 1.0000"
              action={
                <Button
                  size="sm"
                  icon="auto_awesome"
                  variant="secondary"
                  onClick={distribuirAutomatico}
                  disabled={Object.keys(aportes).length === 0 || montoPrincipalNum <= 0}
                >
                  Distribuir automático
                </Button>
              }
              padded={false}
            >
              {fondosLoading ? (
                <div class="flex justify-center py-10">
                  <Spinner size={32} />
                </div>
              ) : fondos.length === 0 ? (
                <EmptyState
                  icon="savings"
                  title="No hay fondos con saldo disponible"
                  description="Cree o inyecte capital en una bolsa antes de otorgar un crédito."
                />
              ) : (
                <div class="overflow-x-auto">
                  <table class="w-full border-collapse text-body-md">
                    <thead>
                      <tr class="h-9 border-b border-slate-200 bg-slate-50">
                        <th scope="col" class="w-10 px-3" />
                        <th scope="col" class="px-3 text-left text-label-xs font-semibold uppercase text-slate-500">
                          Fondo
                        </th>
                        <th scope="col" class="px-3 text-right text-label-xs font-semibold uppercase text-slate-500">
                          Saldo disponible
                        </th>
                        <th scope="col" class="px-3 text-left text-label-xs font-semibold uppercase text-slate-500">
                          Monto aportado
                        </th>
                        <th scope="col" class="px-3 text-left text-label-xs font-semibold uppercase text-slate-500">
                          % Pi
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {fondos.map((fondo) => {
                        const activo = !!aportes[fondo.id];
                        const aporte = aportes[fondo.id];
                        const sobreSaldo =
                          activo && Number(aporte.monto_aportado) > Number(fondo.saldo_disponible);
                        return (
                          <tr
                            key={fondo.id}
                            class={`border-b border-slate-100 last:border-0 ${activo ? 'bg-indigo-50/40' : ''}`}
                          >
                            <td class="px-3 py-2">
                              <input
                                type="checkbox"
                                aria-label={`Usar fondo ${fondo.nombre}`}
                                checked={activo}
                                onChange={() => toggleFondo(fondo.id)}
                                class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </td>
                            <td class="px-3 py-2">
                              <span class="block font-medium text-slate-900">{fondo.nombre}</span>
                              <span class="block text-body-sm text-slate-500">{fondo.familiar}</span>
                            </td>
                            <td class="tnum px-3 py-2 text-right text-slate-700">
                              {fmtMonto(fondo.saldo_disponible)}
                            </td>
                            <td class="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                aria-label={`Monto aportado ${fondo.nombre}`}
                                disabled={!activo}
                                value={activo ? aporte.monto_aportado : ''}
                                onInput={(e) => handleMontoAportado(fondo.id, e.currentTarget.value)}
                                placeholder="0.00"
                                class={`tnum w-32 rounded-md border px-3 py-1.5 outline-none transition-colors focus:border-green-600 focus:ring-1 focus:ring-green-600 disabled:bg-slate-50 disabled:text-slate-400 ${
                                  sobreSaldo ? 'border-red-400 bg-red-50' : 'border-slate-300'
                                }`}
                              />
                            </td>
                            <td class="px-3 py-2">
                              <input
                                type="number"
                                step="0.0001"
                                min="0"
                                max="1"
                                aria-label={`% Pi ${fondo.nombre}`}
                                disabled={!activo}
                                value={activo ? aporte.porcentaje_pi : ''}
                                onInput={(e) => handlePiChange(fondo.id, e.currentTarget.value)}
                                placeholder="0.0000"
                                class="tnum w-32 rounded-md border border-slate-300 px-3 py-1.5 outline-none transition-colors focus:border-green-600 focus:ring-1 focus:ring-green-600 disabled:bg-slate-50 disabled:text-slate-400"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card
              title="Simulación de cuota"
              subtitle="Cálculo real del backend (Ley 176). No se persiste nada."
              action={
                simulando ? (
                  <span class="flex items-center gap-2 text-body-sm text-slate-500">
                    <Spinner size={16} /> Calculando
                  </span>
                ) : null
              }
            >
              {simulacion ? (
                <>
                  <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <p class="text-label-sm uppercase text-slate-500">Cuota estimada</p>
                      <p class="tnum text-headline-lg font-extrabold text-slate-900">
                        {fmtMonto(simulacion.periodos[0]?.cuota)}
                      </p>
                    </div>
                    <div>
                      <p class="text-label-sm uppercase text-slate-500">Periodos</p>
                      <p class="tnum text-headline-sm font-bold text-slate-900">
                        {simulacion.total_periodos}
                      </p>
                    </div>
                    <div>
                      <p class="text-label-sm uppercase text-slate-500">Total a pagar</p>
                      <p class="tnum text-headline-sm font-bold text-slate-900">
                        {fmtMonto(simulacion.total_cuotas)}
                      </p>
                    </div>
                    <div>
                      <p class="text-label-sm uppercase text-slate-500">Interés total</p>
                      <p class="tnum text-headline-sm font-bold text-amber-600">
                        {fmtMonto(simulacion.total_interes)}
                      </p>
                    </div>
                  </div>

                  <div class="mt-4 max-h-72 overflow-y-auto rounded-md border border-slate-200">
                    <DataTable
                      columns={columnasSimulacion}
                      rows={simulacion.periodos}
                      getKey={(periodo) => periodo.periodo}
                      caption="Proyección de cuotas"
                    />
                  </div>
                  <p class="mt-2 text-body-sm text-slate-500">
                    Tasa periódica aplicada: {fmtNumero(Number(simulacion.tasa_periodica) * 100)}%{' '}
                    {periodicidad === 'MENSUAL' ? 'mensual' : 'quincenal'}.
                  </p>
                </>
              ) : (
                <EmptyState
                  icon="query_stats"
                  title="Sin simulación"
                  description="Ingrese monto, tasa y plazo para ver la tabla de amortización."
                />
              )}
            </Card>

            <Card title="Resumen del desembolso">
              <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <dt class="text-body-sm text-slate-500">Monto principal</dt>
                  <dd class="tnum text-headline-sm font-bold text-slate-900">
                    {fmtMonto(montoPrincipalNum)}
                  </dd>
                </div>
                <div>
                  <dt class="text-body-sm text-slate-500">Total aportado</dt>
                  <dd
                    class={`tnum text-headline-sm font-bold ${
                      Math.abs(faltante) <= 0.01 ? 'text-green-600' : 'text-amber-600'
                    }`}
                  >
                    {fmtMonto(totalAportado)}
                  </dd>
                </div>
                <div>
                  <dt class="text-body-sm text-slate-500">Faltante/Excedente</dt>
                  <dd
                    class={`tnum text-headline-sm font-bold ${
                      Math.abs(faltante) <= 0.01 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {faltante >= 0 ? 'Falta ' : 'Excede '}
                    {fmtMonto(Math.abs(faltante))}
                  </dd>
                </div>
                <div>
                  <dt class="text-body-sm text-slate-500">Σ Pi</dt>
                  <dd
                    class={`tnum text-headline-sm font-bold ${
                      Math.abs(sumaPi - 1) <= 0.0001 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {sumaPi.toFixed(4)}
                  </dd>
                </div>
              </dl>

              {serverError && (
                <p class="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-body-sm text-red-700">
                  <Icon name="warning" size={18} class="mt-0.5 shrink-0" />
                  {serverError}
                </p>
              )}

              {validaciones.length > 0 && (
                <ul class="mt-4 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  {validaciones.map((mensaje) => (
                    <li key={mensaje} class="flex items-start gap-2 text-body-sm text-amber-800">
                      <Icon name="warning" size={16} class="mt-0.5 shrink-0" />
                      {mensaje}
                    </li>
                  ))}
                </ul>
              )}

              <div class="mt-5 flex justify-end">
                <Button
                  size="lg"
                  icon="assignment_turned_in"
                  disabled={!canSubmit || submitting}
                  onClick={() => setShowConfirm(true)}
                >
                  Revisar y Crear Préstamo
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirmar Desembolso"
        subtitle="Se descontará el saldo de cada fondo de forma atómica"
        icon="assignment_turned_in"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowConfirm(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} loading={submitting}>
              Confirmar Desembolso
            </Button>
          </>
        }
      >
        <div class="space-y-4">
          <dl class="space-y-1.5 rounded-lg bg-slate-50 px-4 py-3">
            {[
              ['Cliente', clienteLabel],
              ['Monto principal', fmtMonto(montoPrincipalNum)],
              ['Tasa / Plazo', `${Number(tasaInteres).toFixed(4)} · ${plazoMeses} meses`],
              ['Periodicidad', periodicidad === 'MENSUAL' ? 'Mensual' : 'Quincenal'],
              ['Desembolso', fechaDesembolso],
              ['Primer corte', fechaPrimerCorte],
            ].map(([label, valor]) => (
              <div key={label} class="flex justify-between gap-4 text-body-md">
                <dt class="text-slate-600">{label}</dt>
                <dd class="font-medium text-slate-900">{valor}</dd>
              </div>
            ))}
          </dl>

          <div>
            <p class="mb-2 text-label-md text-slate-700">Débitos por fondo</p>
            <div class="overflow-hidden rounded-md border border-slate-200">
              <DataTable
                columns={[
                  {
                    key: 'fondo',
                    header: 'Fondo',
                    render: (fila) => <span class="font-medium text-slate-900">{fila.fondo.nombre}</span>,
                  },
                  {
                    key: 'monto',
                    header: 'Monto',
                    align: 'right',
                    render: (fila) => (
                      <span class="tnum font-semibold text-slate-900">
                        {fmtMonto(fila.aporte?.monto_aportado ?? 0)}
                      </span>
                    ),
                  },
                  {
                    key: 'pi',
                    header: 'Pi',
                    align: 'right',
                    render: (fila) => (
                      <span class="tnum text-slate-700">
                        {(Number(fila.aporte?.porcentaje_pi) || 0).toFixed(4)}
                      </span>
                    ),
                  },
                ]}
                rows={filasAporte}
                getKey={(fila) => fila.fondo.id}
                caption="Débitos por fondo"
                emptyTitle="Sin aportes registrados"
              />
            </div>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
