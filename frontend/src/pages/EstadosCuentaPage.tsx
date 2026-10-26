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
  KpiTile,
  Modal,
  Spinner,
  StatusBadge,
  useToast,
  type Columna,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { clienteService, prestamoService, pagoService } from '../services/api';
import { fmtMonto, fmtFecha, iniciales } from '../lib/format';
import { desglosarCedula, formatearCedula, formatearTelefono } from '../lib/cedula';
import type { Cliente, Prestamo, Pago, PeriodoCuota } from '../types';
import { BotonPagare } from '../components/BotonPagare';
import { PagoRecibo } from '../components/PagoRecibo';
import { useRouter } from '../lib/router';

export function EstadosCuentaPage() {
  const toast = useToast();
  const { navigate, queryParams } = useRouter();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSearch, setClienteSearch] = useState('');
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [prestamoActivo, setPrestamoActivo] = useState<Prestamo | null>(null);
  const [prestamosLoading, setPrestamosLoading] = useState(false);

  const [pagos, setPagos] = useState<Pago[]>([]);
  const [pagosLoading, setPagosLoading] = useState(false);
  const [reciboVerId, setReciboVerId] = useState<number | null>(null);

  const [cuotas, setCuotas] = useState<PeriodoCuota[]>([]);
  const [tabActiva, setTabActiva] = useState<'pagos' | 'cuotas' | 'finiquito'>('pagos');

  const { user } = useAuth();
  const [showModalCancelarContrato, setShowModalCancelarContrato] = useState(false);
  const [motivoCancelacionContrato, setMotivoCancelacionContrato] = useState('');
  const [cancelandoContrato, setCancelandoContrato] = useState(false);

  const cidParam = queryParams.get('cliente');

  // Auto-carga desde parámetros de URL (?cliente=ID&prestamo=ID)
  useEffect(() => {
    if (!cidParam) return;
    const numCid = Number(cidParam);
    if (!numCid || clienteSeleccionado?.id === numCid) return;

    clienteService
      .get(numCid)
      .then((c) => {
        if (c && c.id) {
          selectCliente(c);
        }
      })
      .catch(() => {});
  }, [cidParam]);

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

  // Carga de préstamos del cliente
  useEffect(() => {
    if (!clienteSeleccionado) {
      setPrestamos([]);
      setPrestamoActivo(null);
      setPagos([]);
      setCuotas([]);
      return;
    }
    const fetchPrestamos = async () => {
      setPrestamosLoading(true);
      try {
        const data = await prestamoService.list({ search: clienteSeleccionado.cedula });
        const results: Prestamo[] = data.results || [];
        const delCliente = results.filter((p) => p.cliente === clienteSeleccionado.id);
        const lista = delCliente.length > 0 ? delCliente : results;
        setPrestamos(lista);

        const targetPrestamoId = Number(queryParams.get('prestamo'));
        if (targetPrestamoId) {
          const match = lista.find((p) => p.id === targetPrestamoId);
          if (match) {
            setPrestamoActivo(match);
            return;
          }
        }

        if (lista.length > 0) {
          setPrestamoActivo(lista[0]);
        } else {
          setPrestamoActivo(null);
        }
      } catch {
        setPrestamos([]);
        setPrestamoActivo(null);
        toast.error('No se pudieron consultar los préstamos del cliente');
      } finally {
        setPrestamosLoading(false);
      }
    };
    fetchPrestamos();
  }, [clienteSeleccionado]);

  // Carga de pagos y amortización del crédito activo
  useEffect(() => {
    if (!prestamoActivo) {
      setPagos([]);
      setCuotas([]);
      return;
    }
    const fetchDetalles = async () => {
      setPagosLoading(true);
      try {
        const [pagosData, amortData] = await Promise.all([
          pagoService.list({ prestamo: prestamoActivo.id }),
          prestamoService.amortizacion(prestamoActivo.id).catch(() => null),
        ]);
        setPagos(pagosData.results || []);
        if (amortData && amortData.periodos) {
          setCuotas(amortData.periodos);
        } else {
          setCuotas([]);
        }
      } catch {
        setPagos([]);
        setCuotas([]);
        toast.error('No se pudieron cargar los movimientos del crédito');
      } finally {
        setPagosLoading(false);
      }
    };
    fetchDetalles();
  }, [prestamoActivo]);

  const selectCliente = (c: Cliente) => {
    setClienteSeleccionado(c);
    setClienteSearch(`${c.nombres} ${c.apellidos} - ${c.cedula}`);
    setShowClienteDropdown(false);
  };

  const deseleccionarCliente = () => {
    setClienteSeleccionado(null);
    setClienteSearch('');
    setShowClienteDropdown(false);
    setPrestamos([]);
    setPrestamoActivo(null);
  };

  const infoCedula = useMemo(() => {
    if (!clienteSeleccionado?.cedula) return null;
    return desglosarCedula(clienteSeleccionado.cedula);
  }, [clienteSeleccionado]);

  // Agregados financieros del crédito activo
  const totalCapitalAmortizado = useMemo(
    () => pagos.reduce((acc, p) => acc + (Number(p.aplicacion_capital) || 0), 0),
    [pagos]
  );
  const totalInteresPagado = useMemo(
    () => pagos.reduce((acc, p) => acc + (Number(p.aplicacion_interes) || 0), 0),
    [pagos]
  );
  const totalMoraPagada = useMemo(
    () => pagos.reduce((acc, p) => acc + (Number(p.aplicacion_mora) || 0), 0),
    [pagos]
  );
  const totalAbonadoHistorico = useMemo(
    () => pagos.reduce((acc, p) => acc + (Number(p.monto_total) || 0), 0),
    [pagos]
  );

  const saldoInsolutoRestante = prestamoActivo ? Number(prestamoActivo.saldo_insoluto) : 0;
  const montoOriginal = prestamoActivo ? Number(prestamoActivo.monto_principal) : 0;

  const fechaCreacionPrestamo = prestamoActivo?.creado_en ? new Date(prestamoActivo.creado_en) : null;
  const horasDesdeCreacion = fechaCreacionPrestamo
    ? (Date.now() - fechaCreacionPrestamo.getTime()) / (1000 * 60 * 60)
    : 0;
  const dentroTolerancia72h = horasDesdeCreacion <= 72;
  const tienePagosActivos = useMemo(
    () => pagos.some((p) => p.estado === 'VALIDO' || (!p.estado && Number(p.monto_total) > 0)),
    [pagos]
  );
  const esAdmin = user?.rol === 'ADMINISTRADOR' || user?.is_superuser;

  const handleCancelarContrato = async () => {
    if (!prestamoActivo || motivoCancelacionContrato.trim().length < 15) return;
    setCancelandoContrato(true);
    try {
      await prestamoService.cancelar(prestamoActivo.id, motivoCancelacionContrato.trim());
      toast.success('Contrato de préstamo cancelado y fondos restituidos exitosamente');
      setShowModalCancelarContrato(false);
      setPrestamoActivo({
        ...prestamoActivo,
        estado: 'CANCELADO',
        saldo_insoluto: '0.00',
      });
      setPrestamos((prev) =>
        prev.map((p) =>
          p.id === prestamoActivo.id ? { ...p, estado: 'CANCELADO', saldo_insoluto: '0.00' } : p
        )
      );
    } catch (err: any) {
      toast.error(err?.message || 'Error al rescindir el contrato de préstamo');
    } finally {
      setCancelandoContrato(false);
    }
  };

  const porcentajeAmortizado = useMemo(() => {
    if (montoOriginal <= 0) return 0;
    const pct = (totalCapitalAmortizado / montoOriginal) * 100;
    return Math.min(100, Math.max(0, Math.round(pct * 10) / 10));
  }, [montoOriginal, totalCapitalAmortizado]);

  const columnasPagos: Columna<Pago>[] = [
    {
      key: 'fecha',
      header: 'Fecha',
      render: (p) => <span class="tnum text-slate-700 font-medium">{fmtFecha(p.fecha_pago)}</span>,
    },
    {
      key: 'comprobante',
      header: 'Recibo',
      render: (p) => (
        <div>
          <span class="font-mono text-xs font-bold text-slate-900">{p.codigo_comprobante || `#${p.id}`}</span>
          <span class="block text-body-xs text-slate-500">{p.metodo_pago_display || p.metodo_pago}</span>
        </div>
      ),
    },
    {
      key: 'mora',
      header: 'Mora',
      align: 'right',
      render: (p) => (
        <span class={`tnum ${Number(p.aplicacion_mora) > 0 ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
          {fmtMonto(p.aplicacion_mora)}
        </span>
      ),
    },
    {
      key: 'interes',
      header: 'Interés',
      align: 'right',
      render: (p) => <span class="tnum text-slate-600">{fmtMonto(p.aplicacion_interes)}</span>,
    },
    {
      key: 'capital',
      header: 'Abono Capital',
      align: 'right',
      render: (p) => <span class="tnum font-semibold text-emerald-700">{fmtMonto(p.aplicacion_capital)}</span>,
    },
    {
      key: 'total',
      header: 'Total Cobrado',
      align: 'right',
      render: (p) => <span class="tnum font-extrabold text-slate-900">{fmtMonto(p.monto_total)}</span>,
    },
    {
      key: 'saldo',
      header: 'Saldo Insoluto',
      align: 'right',
      render: (p) => (
        <span class="tnum font-semibold text-slate-800">
          {p.saldo_insoluto_tras_pago ? fmtMonto(p.saldo_insoluto_tras_pago) : '—'}
        </span>
      ),
    },
    {
      key: 'acciones',
      header: 'Acción',
      align: 'right',
      render: (p) => (
        <Button
          size="sm"
          variant="ghost"
          icon="receipt"
          onClick={() => setReciboVerId(p.id)}
          title="Ver o imprimir recibo oficial"
        >
          Recibo
        </Button>
      ),
    },
  ];

  const columnasCuotas: Columna<PeriodoCuota>[] = [
    {
      key: 'periodo',
      header: '#',
      width: '50px',
      render: (c) => <span class="tnum font-bold text-slate-700">{c.periodo}</span>,
    },
    {
      key: 'vencimiento',
      header: 'Vencimiento',
      render: (c) => <span class="tnum text-slate-700 font-medium">{fmtFecha(c.fecha_vencimiento)}</span>,
    },
    {
      key: 'interes',
      header: 'Interés',
      align: 'right',
      render: (c) => <span class="tnum text-slate-600">{fmtMonto(c.interes)}</span>,
    },
    {
      key: 'capital',
      header: 'Capital',
      align: 'right',
      render: (c) => <span class="tnum text-slate-700">{fmtMonto(c.capital)}</span>,
    },
    {
      key: 'cuota',
      header: 'Cuota Programada',
      align: 'right',
      render: (c) => <span class="tnum font-bold text-slate-900">{fmtMonto(c.cuota)}</span>,
    },
    {
      key: 'saldo',
      header: 'Saldo Proyectado',
      align: 'right',
      render: (c) => <span class="tnum text-slate-600 font-medium">{fmtMonto(c.saldo_insoluto)}</span>,
    },
  ];

  const imprimirEstadoCuenta = () => {
    window.print();
  };

  return (
    <Layout titulo="Estados de Cuenta">
      {/* Pestañas de Navegación de Reportes */}
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 print:hidden">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-label-sm font-semibold text-white shadow-sm"
          >
            <Icon name="receipt_long" size={18} />
            Estados de Cuenta (Clientes)
          </button>
          <button
            type="button"
            onClick={() => (location.href = '/reportes/financiero')}
            class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-label-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Icon name="analytics" size={18} />
            Informes Financieros
          </button>
        </div>

        {clienteSeleccionado && (
          <div class="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon="badge"
              onClick={() => navigate(`/clientes?expediente=${clienteSeleccionado.id}`)}
              title="Abrir expediente completo del cliente en padrón"
            >
              Expediente Cliente
            </Button>
            {prestamoActivo && (
              <>
                <BotonPagare
                  prestamoId={prestamoActivo.id}
                  variant="secondary"
                  size="sm"
                  label="Ver / Imprimir Pagaré"
                  abrirVentana={true}
                  onError={toast.error}
                />
                {saldoInsolutoRestante > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="payments"
                    onClick={() => navigate('/cobros')}
                    title="Ir a registrar un abono a este crédito"
                  >
                    Cobrar
                  </Button>
                )}
                {esAdmin && prestamoActivo.estado !== 'CANCELADO' && (
                  <Button
                    variant="danger"
                    size="sm"
                    icon="cancel"
                    onClick={() => {
                      setMotivoCancelacionContrato('');
                      setShowModalCancelarContrato(true);
                    }}
                    title="Rescindir y cancelar contrato dentro de la ventana de tolerancia"
                  >
                    Cancelar Contrato
                  </Button>
                )}
              </>
            )}
            <Button icon="print" variant="primary" size="sm" onClick={imprimirEstadoCuenta}>
              Imprimir Estado de Cuenta
            </Button>
          </div>
        )}
      </div>

      <PageHeader
        titulo="Estado de Cuenta Oficial"
        descripcion="Extracto transaccional de créditos con desglose de mora, interés y abono a capital"
      />

      {/* Buscador de Prestatario (Oculto al imprimir) */}
      <div class="space-y-4 print:hidden">
        <Card title="Buscar Titular del Crédito" subtitle="Localice el cliente por nombre, apellidos o número de cédula">
          <div class="relative max-w-xl">
            <Input
              label="Cliente"
              value={clienteSearch}
              onInput={(valor) => {
                setClienteSearch(valor);
                if (clienteSeleccionado) {
                  setClienteSeleccionado(null);
                }
                setShowClienteDropdown(true);
              }}
              placeholder="Escriba el nombre o cédula..."
              hint={clienteSeleccionado ? `Titular activo: ${clienteSeleccionado.nombres} ${clienteSeleccionado.apellidos}` : 'Búsqueda en tiempo real'}
            />

            {showClienteDropdown && (
              <ul class="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5">
                {clientes.length === 0 ? (
                  <li class="px-4 py-3 text-body-md text-slate-500">
                    {clienteSearch ? 'No se encontraron clientes' : 'Escriba para buscar clientes...'}
                  </li>
                ) : (
                  clientes.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => selectCliente(c)}
                        class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
                      >
                        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-label-xs font-bold text-slate-700">
                          {iniciales(`${c.nombres} ${c.apellidos}`)}
                        </span>
                        <div class="min-w-0 flex-1">
                          <span class="block truncate text-body-md font-semibold text-slate-900">
                            {c.nombres} {c.apellidos}
                          </span>
                          <span class="tnum text-body-xs font-mono text-slate-500">{formatearCedula(c.cedula)}</span>
                        </div>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* Vista cuando NO hay cliente seleccionado */}
      {!clienteSeleccionado ? (
        <div class="mt-8 print:hidden">
          <EmptyState
            icon="person_search"
            title="Seleccione un cliente para ver su estado de cuenta"
            description="Utilice el buscador superior para cargar el historial de pagos, amortización y saldo adeudado."
          />
        </div>
      ) : (
        <div class="mt-6 space-y-6">
          {/* Ficha del Titular y Selector de Préstamo */}
          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
              <div class="flex items-center gap-3.5">
                <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-headline-sm shadow-xs">
                  {iniciales(`${clienteSeleccionado.nombres} ${clienteSeleccionado.apellidos}`)}
                </span>
                <div>
                  <h2 class="text-headline-sm font-bold text-slate-900">
                    {clienteSeleccionado.nombres} {clienteSeleccionado.apellidos}
                  </h2>
                  <p class="font-mono text-body-sm text-slate-600 font-semibold">
                    Cédula: <span>{formatearCedula(clienteSeleccionado.cedula)}</span>
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2 print:hidden">
                <Button variant="ghost" size="sm" icon="sync" onClick={deseleccionarCliente}>
                  Cambiar Cliente
                </Button>
              </div>
            </div>

            {/* Datos Personales y de Contacto */}
            <div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-body-sm text-slate-700">
              <div>
                <span class="block text-body-xs text-slate-500 font-medium">Teléfono:</span>
                <span class="font-semibold">
                  {clienteSeleccionado.telefono ? formatearTelefono(clienteSeleccionado.telefono) : 'No registrado'}
                </span>
              </div>
              <div>
                <span class="block text-body-xs text-slate-500 font-medium">Municipio / Dpto:</span>
                <span class="font-semibold">
                  {infoCedula?.departamento ? `${infoCedula.departamento} (${infoCedula.municipio})` : 'N/D'}
                </span>
              </div>
              <div class="col-span-2">
                <span class="block text-body-xs text-slate-500 font-medium">Dirección de Domicilio:</span>
                <span class="font-semibold truncate block" title={clienteSeleccionado.direccion}>
                  {clienteSeleccionado.direccion || 'No especificada'}
                </span>
              </div>
            </div>

            {/* Selector de Créditos del Cliente */}
            {prestamosLoading ? (
              <div class="py-4 text-center">
                <Spinner size={24} />
              </div>
            ) : prestamos.length > 0 ? (
              <div class="mt-5 border-t border-slate-100 pt-4">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <span class="text-label-sm font-semibold uppercase tracking-wider text-slate-500">
                    Expedientes de Crédito ({prestamos.length})
                  </span>
                  {prestamoActivo && (
                    <StatusBadge estado={prestamoActivo.estado} diasAtraso={prestamoActivo.dias_mora} />
                  )}
                </div>

                <div class="flex flex-wrap gap-2">
                  {prestamos.map((p) => {
                    const esActivo = prestamoActivo?.id === p.id;
                    const esCancelado = p.estado === 'CANCELADO' || Number(p.saldo_insoluto) === 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPrestamoActivo(p)}
                        class={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-left text-body-sm transition-all ${
                          esActivo
                            ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span class="font-bold">Préstamo #{p.id}</span>
                        <span class="opacity-80">· {fmtMonto(p.monto_principal)}</span>
                        <span class="text-xs opacity-60">
                          {esCancelado ? '(Saldado)' : `(${fmtFecha(p.fecha_desembolso)})`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p class="mt-4 text-body-sm text-slate-500 border-t border-slate-100 pt-3">
                Este cliente no cuenta con préstamos registrados en el sistema.
              </p>
            )}
          </div>

          {/* Información del Préstamo Seleccionado */}
          {prestamoActivo && (
            <>
              {/* KPIs de Estado de Cuenta */}
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <KpiTile
                  label="Otorgado"
                  value={fmtMonto(montoOriginal)}
                  icon="payments"
                  tono="neutro"
                  pie="Principal original"
                  compact
                />
                <KpiTile
                  label="Amortizado"
                  value={fmtMonto(totalCapitalAmortizado)}
                  icon="task_alt"
                  tono="esmeralda"
                  pie={`${porcentajeAmortizado}% liquidado`}
                  compact
                />
                <KpiTile
                  label="Saldo Insoluto"
                  value={fmtMonto(saldoInsolutoRestante)}
                  icon="account_balance_wallet"
                  tono={saldoInsolutoRestante > 0 ? 'ambar' : 'esmeralda'}
                  pie={saldoInsolutoRestante > 0 ? 'Capital pendiente' : 'Crédito liquidado'}
                  compact
                />
                <KpiTile
                  label="Interés Pagado"
                  value={fmtMonto(totalInteresPagado)}
                  icon="trending_up"
                  tono="neutro"
                  pie="Interés ordinario"
                  compact
                />
                <KpiTile
                  label="Mora Pagada"
                  value={fmtMonto(totalMoraPagada)}
                  icon="warning"
                  tono={totalMoraPagada > 0 ? 'rosa' : 'neutro'}
                  pie="Recargos cancelados"
                  compact
                />
                <KpiTile
                  label="Total Cobrado"
                  value={fmtMonto(totalAbonadoHistorico)}
                  icon="receipt_long"
                  tono="indigo"
                  pie="Histórico pagado"
                  compact
                />
              </div>

              {/* Barra de Progreso de Amortización */}
              <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div class="flex items-center justify-between text-label-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  <span>Progreso de Amortización del Crédito</span>
                  <span class="text-slate-900 font-bold">{porcentajeAmortizado}% amortizado</span>
                </div>
                <div class="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    class="h-full rounded-full bg-emerald-600 transition-all duration-500"
                    style={{ width: `${porcentajeAmortizado}%` }}
                  />
                </div>
              </div>

              {/* Parámetros del Crédito */}
              <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-body-xs text-slate-600 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span class="font-medium text-slate-500">Tasa Mensual:</span>{' '}
                  <span class="font-bold text-slate-900">{(Number(prestamoActivo.tasa_interes) * 100).toFixed(2)}%</span>
                </div>
                <div>
                  <span class="font-medium text-slate-500">Plazo / Frecuencia:</span>{' '}
                  <span class="font-bold text-slate-900">
                    {prestamoActivo.plazo_meses > 0 ? `${prestamoActivo.plazo_meses} meses` : 'Indefinido'} ({prestamoActivo.periodicidad.toLowerCase()})
                  </span>
                </div>
                <div>
                  <span class="font-medium text-slate-500">Desembolso:</span>{' '}
                  <span class="font-bold text-slate-900">{fmtFecha(prestamoActivo.fecha_desembolso)}</span>
                </div>
                <div>
                  <span class="font-medium text-slate-500">Primer Corte:</span>{' '}
                  <span class="font-bold text-slate-900">{fmtFecha(prestamoActivo.fecha_primer_corte)}</span>
                </div>
              </div>

              {/* Pestañas de Detalle Transaccional */}
              <div class="flex border-b border-slate-200 gap-1 print:hidden">
                <button
                  type="button"
                  onClick={() => setTabActiva('pagos')}
                  class={`flex items-center gap-2 px-4 py-2.5 text-body-sm font-semibold border-b-2 transition-all ${
                    tabActiva === 'pagos'
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon name="history" size={18} />
                  Historial de Abonos ({pagos.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTabActiva('cuotas')}
                  class={`flex items-center gap-2 px-4 py-2.5 text-body-sm font-semibold border-b-2 transition-all ${
                    tabActiva === 'cuotas'
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon name="calendar_month" size={18} />
                  Cronograma de Cuotas ({cuotas.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTabActiva('finiquito')}
                  class={`flex items-center gap-2 px-4 py-2.5 text-body-sm font-semibold border-b-2 transition-all ${
                    tabActiva === 'finiquito'
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon name="check_circle" size={18} />
                  Liquidación Anticipada
                </button>
              </div>

              {/* TAB 1: Historial Transaccional de Pagos */}
              {(tabActiva === 'pagos' || typeof window !== 'undefined') && (
                <div class={tabActiva !== 'pagos' ? 'hidden print:block' : ''}>
                  <Card
                    title="Historial de Abonos Realizados"
                    subtitle="Desglose transaccional de mora, interés corriente y abono a capital"
                    padded={false}
                  >
                    {pagosLoading ? (
                      <div class="flex justify-center py-10">
                        <Spinner size={32} />
                      </div>
                    ) : pagos.length === 0 ? (
                      <div class="p-8 text-center text-slate-500">
                        <p class="font-medium">No se han registrado abonos para este préstamo.</p>
                      </div>
                    ) : (
                      <DataTable
                        columns={columnasPagos}
                        rows={pagos}
                        getKey={(p) => p.id}
                        caption="Historial de pagos"
                      />
                    )}
                  </Card>
                </div>
              )}

              {/* TAB 2: Cronograma de Amortización */}
              {(tabActiva === 'cuotas' || typeof window !== 'undefined') && (
                <div class={tabActiva !== 'cuotas' ? 'hidden print:block' : ''}>
                  <Card
                    title="Cronograma de Cuotas Programadas"
                    subtitle="Amortización periódica con cálculo de interés sobre saldo insoluto"
                    padded={false}
                  >
                    {cuotas.length === 0 ? (
                      <div class="p-8 text-center text-slate-500">
                        <p class="font-medium">No hay cuotas programadas para este crédito.</p>
                      </div>
                    ) : (
                      <div class="max-h-96 overflow-y-auto">
                        <DataTable
                          columns={columnasCuotas}
                          rows={cuotas}
                          getKey={(c) => c.periodo}
                          caption="Plan de amortización"
                        />
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {/* TAB 3: Liquidación Anticipada */}
              {tabActiva === 'finiquito' && (
                <Card
                  title="Liquidación y Cancelación Anticipada del Crédito"
                  subtitle="Conforme a la Ley N.º 176, el deudor tiene derecho a cancelar el saldo anticipadamente sin intereses futuros"
                >
                  <div class="space-y-4">
                    <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <span class="block text-label-xs font-bold text-slate-500 uppercase">Saldo Capital Insoluto</span>
                          <span class="text-headline-sm font-bold text-slate-900">{fmtMonto(saldoInsolutoRestante)}</span>
                        </div>
                        <div>
                          <span class="block text-label-xs font-bold text-slate-500 uppercase">Mora Exigible</span>
                          <span class="text-headline-sm font-bold text-red-600">
                            {fmtMonto(prestamoActivo.dias_mora ? (Number(prestamoActivo.saldo_insoluto) * 0.0125).toFixed(2) : '0.00')}
                          </span>
                        </div>
                        <div>
                          <span class="block text-label-xs font-bold text-slate-500 uppercase">Monto Estimado para Finiquito</span>
                          <span class="text-headline-sm font-bold text-emerald-700">{fmtMonto(saldoInsolutoRestante)}</span>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center justify-between gap-3 pt-2">
                      <p class="text-body-sm text-slate-600">
                        Al saldar el capital restante, se emite automáticamente la carta de finiquito y se cancela la obligación legal.
                      </p>
                      {saldoInsolutoRestante > 0 && (
                        <Button
                          variant="primary"
                          icon="payments"
                          onClick={() => navigate('/cobros')}
                        >
                          Ir a Cancelar Préstamo
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* Modal oficial para visualizar, imprimir o cancelar el recibo */}
      {reciboVerId !== null && (
        <PagoRecibo
          pagoId={reciboVerId}
          onClose={() => setReciboVerId(null)}
          onAnulado={() => {
            setReciboVerId(null);
            if (prestamoActivo) {
              pagoService.list({ prestamo: prestamoActivo.id }).then((data) => {
                setPagos(Array.isArray(data) ? data : data?.results || []);
              });
            }
          }}
        />
      )}

      {/* Modal para rescisión de contrato de préstamo */}
      <Modal
        open={showModalCancelarContrato}
        onClose={() => !cancelandoContrato && setShowModalCancelarContrato(false)}
        title="Rescisión de Contrato de Préstamo"
        subtitle={`Contrato #${prestamoActivo?.id} · ${clienteSeleccionado?.nombres} ${clienteSeleccionado?.apellidos}`}
        icon="cancel"
        size="md"
      >
        <div class="space-y-4">
          <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 text-body-sm">
            <p class="font-bold">Advertencia Legal y Financiera:</p>
            <p class="mt-1">
              La cancelación del contrato de préstamo revierte de manera irrevocable el capital desembolsado ({fmtMonto(prestamoActivo?.monto_principal)}), restituyendo los fondos de inversión originales. El pagaré quedará nulo y sin efecto crediticio.
            </p>
            {tienePagosActivos && (
              <p class="mt-2 font-bold text-red-700">
                Atención: Existen recibos de pago activos asociados a este crédito. Debe anular previamente todos los recibos vigentes antes de poder rescindir el contrato.
              </p>
            )}
            {!dentroTolerancia72h && (
              <p class="mt-2 font-bold text-red-700">
                Atención: Han transcurrido más de 72 horas desde la emisión del crédito. La rescisión solo podrá proceder si el sistema tiene tolerancia extendida autorizada.
              </p>
            )}
          </div>

          <div>
            <label class="block text-body-sm font-semibold text-slate-700 mb-1">
              Motivo Circunstanciado de Cancelación (mínimo 15 caracteres):
            </label>
            <textarea
              rows={3}
              class="w-full rounded-xl border border-slate-300 p-3 text-body-sm focus:border-slate-900 focus:outline-none"
              placeholder="Describa de manera detallada la razón legal o administrativa de la rescisión..."
              value={motivoCancelacionContrato}
              onInput={(e) => setMotivoCancelacionContrato((e.target as HTMLTextAreaElement).value)}
              disabled={cancelandoContrato}
            />
            <span class="text-body-xs text-slate-500">
              {motivoCancelacionContrato.trim().length} / 15 caracteres mínimos
            </span>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setShowModalCancelarContrato(false)}
              disabled={cancelandoContrato}
            >
              Descartar
            </Button>
            <Button
              variant="danger"
              icon="check_circle"
              loading={cancelandoContrato}
              disabled={
                cancelandoContrato ||
                motivoCancelacionContrato.trim().length < 15 ||
                tienePagosActivos
              }
              onClick={handleCancelarContrato}
            >
              Confirmar Cancelación
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
