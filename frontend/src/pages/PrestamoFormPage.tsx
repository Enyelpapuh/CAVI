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
  StatusBadge,
  useToast,
  type Columna,
} from '../components/ui';
import { clienteService, fondoService, prestamoService } from '../services/api';
import { useRouter } from '../lib/router';
import { BotonPagare } from '../components/BotonPagare';
import { fmtMonto, fmtNumero, fmtFecha, iniciales } from '../lib/format';
import { desglosarCedula, formatearCedula, formatearTelefono } from '../lib/cedula';
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

const PRESETS_MONTOS = [10000, 25000, 50000, 100000];
const PRESETS_PLAZOS = [3, 6, 12, 18, 24];
const PRESETS_TASAS = [
  { label: '2.0% (0.0200)', value: '0.0200' },
  { label: '2.5% (0.0250)', value: '0.0250' },
  { label: '3.0% (0.0300)', value: '0.0300' },
  { label: '5.0% (0.0500)', value: '0.0500' },
  { label: '10.0% (0.1000) Histórica', value: '0.1000' },
];

export function PrestamoFormPage() {
  const toast = useToast();
  const { navigate } = useRouter();
  const [pasoActual, setPasoActual] = useState<1 | 2 | 3 | 4>(1);

  // Paso 1: Cliente
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSearch, setClienteSearch] = useState('');
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [clienteLabel, setClienteLabel] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [historialCliente, setHistorialCliente] = useState<Prestamo[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  // Paso 2: Condiciones
  const [montoPrincipal, setMontoPrincipal] = useState('');
  const [tasaInteres, setTasaInteres] = useState('0.0250');
  const [plazoMeses, setPlazoMeses] = useState('12');
  const [esPlazoIndefinido, setEsPlazoIndefinido] = useState(false);
  const [periodicidad, setPeriodicidad] = useState<'MENSUAL' | 'QUINCENAL'>('MENSUAL');
  const [fechaDesembolso, setFechaDesembolso] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaPrimerCorte, setFechaPrimerCorte] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });

  // Paso 3: Fondeo
  const [fondos, setFondos] = useState<Fondo[]>([]);
  const [fondosLoading, setFondosLoading] = useState(true);
  const [aportes, setAportes] = useState<FondoAportes>({});
  const [pctInput, setPctInput] = useState<Record<number, string>>({});

  // Simulación y Backend
  const [simulacion, setSimulacion] = useState<Proyeccion | null>(null);
  const [simulando, setSimulando] = useState(false);

  // Envío y estado final
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
  const coberturaPorcentaje =
    montoPrincipalNum > 0 ? Math.min(100, Math.max(0, (totalAportado / montoPrincipalNum) * 100)) : 0;

  // Validaciones por paso
  const paso1Valido = !!clienteId;


  const metricasHistorial = useMemo(() => {
    const activos = historialCliente.filter((p) => p.estado !== 'CANCELADO');
    const cancelados = historialCliente.filter((p) => p.estado === 'CANCELADO');
    const saldoTotal = activos.reduce(
      (acc, p) => acc + (Number(p.saldo_insoluto || (p as any).saldo_deudor) || 0),
      0
    );
    const enMora = activos.filter(
      (p) => p.estado === 'EN_MORA' || ((p as any).dias_mora ?? p.dias_atraso ?? 0) > 0
    );
    return {
      activos,
      cancelados,
      saldoTotal,
      enMora,
    };
  }, [historialCliente]);

  const paso2Valido =
    montoPrincipalNum > 0 &&
    (esPlazoIndefinido ? true : Number(plazoMeses) > 0) &&
    Number(tasaInteres) >= 0 &&
    !!fechaDesembolso &&
    !!fechaPrimerCorte &&
    (!fechaDesembolso || !fechaPrimerCorte || fechaPrimerCorte >= fechaDesembolso);

  const fondosSeleccionados = useMemo(
    () => Object.keys(aportes).filter((k) => (Number(aportes[Number(k)].monto_aportado) || 0) > 0),
    [aportes]
  );

  const fondosConSobreSaldo = useMemo(() => {
    return fondosSeleccionados.filter((k) => {
      const id = Number(k);
      const fondo = fondos.find((f) => f.id === id);
      return fondo && Number(aportes[id].monto_aportado) > Number(fondo.saldo_disponible);
    });
  }, [fondosSeleccionados, aportes, fondos]);

  const paso3Valido =
    fondosSeleccionados.length > 0 &&
    Math.abs(totalAportado - montoPrincipalNum) <= 0.01 &&
    Math.abs(sumaPi - 1) <= 0.0001 &&
    fondosConSobreSaldo.length === 0;

  const validaciones = useMemo(() => {
    const errors: string[] = [];
    if (!clienteId) errors.push('Seleccione un cliente titular');
    if (montoPrincipalNum <= 0) errors.push('El monto principal debe ser mayor a cero');
    if (!esPlazoIndefinido && !(Number(plazoMeses) > 0)) errors.push('El plazo debe ser mayor a cero');
    if (!(Number(tasaInteres) >= 0)) errors.push('La tasa de interés es inválida');
    if (!fechaDesembolso) errors.push('Indique la fecha de desembolso');
    if (!fechaPrimerCorte) errors.push('Indique la fecha del primer corte');
    if (fechaDesembolso && fechaPrimerCorte && fechaPrimerCorte < fechaDesembolso)
      errors.push('El primer corte no puede ser antes del desembolso');

    if (fondosSeleccionados.length === 0)
      errors.push('Seleccione al menos un fondo con monto aportado');
    if (Math.abs(totalAportado - montoPrincipalNum) > 0.01) {
      errors.push(
        `La suma de aportes (${fmtMonto(totalAportado)}) debe igualar el monto principal (${fmtMonto(montoPrincipalNum)})`
      );
    }
    if (Math.abs(sumaPi - 1) > 0.0001) {
      errors.push(`La distribución de participación (${(sumaPi * 100).toFixed(1)}%) debe sumar exactamente el 100%`);
    }
    for (const k of fondosConSobreSaldo) {
      const id = Number(k);
      const fondo = fondos.find((f) => f.id === id);
      if (fondo) {
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
    esPlazoIndefinido,
    tasaInteres,
    fechaDesembolso,
    fechaPrimerCorte,
    fondosSeleccionados,
    totalAportado,
    sumaPi,
    fondosConSobreSaldo,
    fondos,
  ]);

  const canSubmit = validaciones.length === 0;

  /** Cotizador: usa POST /api/prestamos/simular/ (no persiste nada). */
  useEffect(() => {
    const plazoValido = esPlazoIndefinido ? true : Number(plazoMeses) > 0;
    if (montoPrincipalNum <= 0 || !plazoValido || !(Number(tasaInteres) >= 0)) {
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
          plazo_meses: esPlazoIndefinido ? 0 : Number(plazoMeses),
          periodicidad,
          ...(fechaPrimerCorte ? { fecha_primer_corte: fechaPrimerCorte } : {}),
        })
        .then((data) => {
          if (vigente) setSimulacion(data);
        })
        .catch(() => {
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
  }, [montoPrincipal, tasaInteres, plazoMeses, esPlazoIndefinido, periodicidad, fechaPrimerCorte, montoPrincipalNum]);

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
    setPctInput((prev) => {
      const next = { ...prev };
      delete next[fondoId];
      return next;
    });
  };

  const handleMontoAportado = (fondoId: number, monto: string) => {
    const mNum = parseFloat(monto) || 0;
    let piStr = '';
    let pctStr = '';
    if (montoPrincipalNum > 0 && mNum > 0) {
      const ratio = mNum / montoPrincipalNum;
      piStr = ratio.toFixed(4);
      pctStr = (ratio * 100).toFixed(2);
    }
    setAportes((prev) => ({
      ...prev,
      [fondoId]: {
        ...prev[fondoId],
        monto_aportado: monto,
        porcentaje_pi: piStr,
      },
    }));
    setPctInput((prev) => ({
      ...prev,
      [fondoId]: pctStr,
    }));
  };

  const handlePorcentajeInput = (fondoId: number, pctStr: string) => {
    setPctInput((prev) => ({ ...prev, [fondoId]: pctStr }));
    const pNum = parseFloat(pctStr) || 0;
    let montoStr = '';
    let piStr = '';
    if (pNum > 0) {
      const ratio = pNum / 100;
      piStr = ratio.toFixed(4);
      if (montoPrincipalNum > 0) {
        montoStr = Math.round(ratio * montoPrincipalNum * 100 / 100).toFixed(2);
      }
    }
    setAportes((prev) => ({
      ...prev,
      [fondoId]: {
        ...prev[fondoId],
        monto_aportado: montoStr,
        porcentaje_pi: piStr,
      },
    }));
  };


  /** Reparte el monto en partes iguales y recalcula montos y porcentajes con ajuste de centavos. */
  const distribuirAutomatico = () => {
    const ids = Object.keys(aportes).map(Number);
    if (ids.length === 0 || montoPrincipalNum <= 0) return;
    const next: FondoAportes = {};
    const nextPct: Record<number, string> = {};
    let restante = montoPrincipalNum;
    ids.forEach((id, i) => {
      const esUltimo = i === ids.length - 1;
      const monto = esUltimo
        ? restante
        : Math.round(((montoPrincipalNum / ids.length) + Number.EPSILON) * 100) / 100;
      restante = Math.round((restante - monto) * 100) / 100;
      const pi = (monto / montoPrincipalNum).toFixed(4);
      next[id] = {
        monto_aportado: monto.toFixed(2),
        porcentaje_pi: pi,
      };
      nextPct[id] = (Number(pi) * 100).toFixed(2);
    });
    setAportes(next);
    setPctInput(nextPct);
  };

  const selectCliente = (c: Cliente) => {
    const etiqueta = `${c.nombres} ${c.apellidos} - ${c.cedula}`;
    setClienteId(c.id);
    setClienteSeleccionado(c);
    setClienteLabel(etiqueta);
    setClienteSearch(etiqueta);
    setShowClienteDropdown(false);
    setLoadingHistorial(true);
    if (typeof prestamoService.list === 'function') {
      prestamoService
        .list({ cliente: c.id })
        .then((data) => {
          setHistorialCliente(data.results || []);
        })
        .catch(() => {
          setHistorialCliente([]);
        })
        .finally(() => {
          setLoadingHistorial(false);
        });
    } else {
      setLoadingHistorial(false);
    }
  };

  const deseleccionarCliente = () => {
    setClienteId(null);
    setClienteSeleccionado(null);
    setClienteLabel('');
    setClienteSearch('');
    setShowClienteDropdown(false);
    setHistorialCliente([]);
  };

  const aplicarFechaHoy = () => {
    const hoy = new Date().toISOString().split('T')[0];
    setFechaDesembolso(hoy);
    const dias = periodicidad === 'QUINCENAL' ? 15 : 30;
    const corte = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setFechaPrimerCorte(corte);
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
        plazo_meses: esPlazoIndefinido ? 0 : Number(plazoMeses),
        periodicidad,
        fecha_desembolso: fechaDesembolso,
        fecha_primer_corte: fechaPrimerCorte,
        fondos_detalle: fondosDetalle,
      });
      setCreatedPrestamo(prestamo);
      setShowConfirm(false);
      toast.success('Crédito otorgado y registrado exitosamente');
    } catch (err: any) {
      const data = err.response?.data;
      let msg = 'Error al crear el préstamo';
      if (data?.fondos_detalle) {
        msg = (data.fondos_detalle as string[]).map(String).join(' ');
      } else if (data?.detail) {
        msg = String(data.detail);
      } else if (data && typeof data === 'object') {
        msg =
          Object.entries(data)
            .flatMap(([k, v]) => (Array.isArray(v) ? v.map(String) : [`${k}: ${String(v)}`]))
            .join(' ') || 'Error al crear el préstamo';
      }
      setServerError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setPasoActual(1);
    setClienteId(null);
    setClienteSeleccionado(null);
    setClienteLabel('');
    setClienteSearch('');
    setHistorialCliente([]);
    setMontoPrincipal('');
    setTasaInteres('0.0250');
    setPlazoMeses('12');
    setEsPlazoIndefinido(false);
    setPeriodicidad('MENSUAL');
    const hoy = new Date().toISOString().slice(0, 10);
    setFechaDesembolso(hoy);
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setFechaPrimerCorte(d.toISOString().slice(0, 10));
    setAportes({});
    setPctInput({});
    setServerError('');
    setSimulacion(null);
    setCreatedPrestamo(null);
  };

  const columnasSimulacion: Columna<PeriodoCuota>[] = [
    {
      key: 'periodo',
      header: '#',
      width: '60px',
      render: (periodo) => <span class="tnum text-slate-600 font-medium">{periodo.periodo}</span>,
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
        <span class="tnum font-bold text-slate-900">{fmtMonto(periodo.cuota)}</span>
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

  const infoCedulaCliente = useMemo(() => {
    if (!clienteSeleccionado?.cedula) return null;
    return desglosarCedula(clienteSeleccionado.cedula);
  }, [clienteSeleccionado]);

  const pasos = [
    {
      id: 1,
      titulo: '1. Cliente',
      descripcion: 'Titular del crédito',
      valido: paso1Valido,
      icono: 'person',
    },
    {
      id: 2,
      titulo: '2. Condiciones',
      descripcion: 'Monto, plazos y fechas',
      valido: paso2Valido,
      icono: 'payments',
    },
    {
      id: 3,
      titulo: '3. Fondeo',
      descripcion: 'Multifondo familiar',
      valido: paso3Valido,
      icono: 'savings',
    },
    {
      id: 4,
      titulo: '4. Revisión',
      descripcion: 'Amortización y desembolso',
      valido: canSubmit,
      icono: 'assignment_turned_in',
    },
  ];

  return (
    <Layout titulo="Nuevo Préstamo">
      <PageHeader
        titulo="Solicitud de Crédito"
        descripcion="Registro asistido de nuevo crédito con asignación de fondos"
      />

      {createdPrestamo ? (
        <Card class="text-center py-10 max-w-2xl mx-auto shadow-sm">
          <span class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50">
            <Icon name="check_circle" size={40} />
          </span>
          <h2 class="mt-5 text-headline-md font-bold text-slate-900">
            Préstamo #{createdPrestamo.id} creado exitosamente
          </h2>
          <p class="mt-2 text-body-md text-slate-600">
            <span class="font-semibold text-slate-800">{createdPrestamo.cliente_nombre}</span> · Desembolso de{' '}
            <span class="font-bold text-emerald-700">{fmtMonto(createdPrestamo.monto_principal)}</span>
          </p>
          <div class="mt-8 flex flex-wrap justify-center gap-3">
            <BotonPagare
              prestamoId={createdPrestamo.id}
              variant="primary"
              label="Ver / Imprimir Pagaré"
              abrirVentana={true}
              onError={setServerError}
            />
            <Button
              variant="secondary"
              icon="badge"
              onClick={() => navigate(`/clientes?expediente=${createdPrestamo.cliente}`)}
              title="Abrir el expediente y datos del prestatario"
            >
              Ver Expediente del Cliente
            </Button>
            <Button
              variant="secondary"
              icon="receipt_long"
              onClick={() =>
                navigate(
                  `/reportes/estados-cuenta?cliente=${createdPrestamo.cliente}&prestamo=${createdPrestamo.id}`
                )
              }
              title="Consultar el estado de cuenta oficial"
            >
              Estado de Cuenta
            </Button>
            <Button
              variant="secondary"
              icon="point_of_sale"
              onClick={() => navigate('/cobros')}
              title="Ir al panel de cobranza"
            >
              Ir a Cobranza
            </Button>
            <Button icon="add" onClick={resetForm}>
              Nuevo Préstamo
            </Button>
          </div>
          <p class="mt-5 text-body-xs text-slate-500">
            El crédito ha sido formalizado en el sistema. Puede entregar el pagaré firmado o consultar el expediente del cliente en cualquier momento.
          </p>
          {serverError && (
            <p class="mt-3 text-body-sm text-red-700 bg-red-50 p-2 rounded border border-red-200" role="alert">
              {serverError}
            </p>
          )}
        </Card>
      ) : (
        <div class="space-y-6">
          {/* Barra de Progreso y Stepper de Páginas */}
          <nav aria-label="Progreso del formulario de préstamo" class="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {pasos.map((p) => {
                const esActivo = pasoActual === p.id;
                const esCompletado = p.valido && pasoActual > p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPasoActual(p.id as 1 | 2 | 3 | 4)}
                    aria-current={esActivo ? 'step' : undefined}
                    class={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                      esActivo
                        ? 'bg-slate-900 text-white shadow-sm'
                        : esCompletado
                        ? 'bg-emerald-50/70 text-emerald-950 hover:bg-emerald-100/60'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span
                      class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                        esActivo
                          ? 'bg-white text-slate-900'
                          : esCompletado
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white text-slate-500 border border-slate-200'
                      }`}
                    >
                      {esCompletado ? <Icon name="check" size={16} /> : p.id}
                    </span>
                    <div class="min-w-0">
                      <p class="truncate text-label-sm font-semibold">{p.titulo}</p>
                      <p
                        class={`truncate text-body-xs ${
                          esActivo ? 'text-slate-300' : esCompletado ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {p.descripcion}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* ============================================================== */}
          {/* PÁGINA 1: CLIENTE */}
          {/* ============================================================== */}
          {pasoActual === 1 && (
            <div class="space-y-6">
              <Card
                title="Paso 1: Titular del Préstamo"
                subtitle="Seleccione o busque el prestatario titular en la base de clientes"
              >
                <div class="max-w-2xl space-y-4">
                  <div class="relative">
                    <Input
                      label="Cliente"
                      value={clienteSearch}
                      onInput={(valor) => {
                        setClienteSearch(valor);
                        setClienteId(null);
                        setClienteSeleccionado(null);
                        setShowClienteDropdown(true);
                      }}
                      placeholder="Escriba el nombre o número de cédula..."
                      hint={clienteId ? `✓ Cliente seleccionado: ${clienteLabel}` : 'Búsqueda en tiempo real por nombre, apellidos o número de cédula'}
                    />

                    {showClienteDropdown && (
                      <ul class="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5">
                        {clientes.filter((c) => c.activo).length === 0 ? (
                          <li class="px-4 py-3 text-body-md text-slate-500">
                            {clienteSearch ? 'No se encontraron clientes activos coincidentes' : 'Escriba para buscar clientes...'}
                          </li>
                        ) : (
                          clientes
                            .filter((c) => c.activo)
                            .map((c) => (
                              <li key={c.id}>
                                <button
                                  type="button"
                                  onClick={() => selectCliente(c)}
                                  class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
                                >
                                  <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-label-xs font-bold text-slate-700">
                                    {iniciales(`${c.nombres} ${c.apellidos}`)}
                                  </span>
                                  <div class="min-w-0 flex-1">
                                    <span class="block truncate text-body-md font-semibold text-slate-900">
                                      {c.nombres} {c.apellidos}
                                    </span>
                                    <div class="flex items-center gap-2 text-body-xs text-slate-500">
                                      <span class="tnum font-mono">{formatearCedula(c.cedula)}</span>
                                      {c.telefono && (
                                        <>
                                          <span>·</span>
                                          <span>Tel: {formatearTelefono(c.telefono)}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              </li>
                            ))
                        )}
                      </ul>
                    )}
                  </div>
                </div>

                {clienteSeleccionado ? (
                  <div class="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div class="flex items-center gap-3.5">
                        <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold text-headline-sm">
                          {iniciales(`${clienteSeleccionado.nombres} ${clienteSeleccionado.apellidos}`)}
                        </span>
                        <div>
                          <div class="flex items-center gap-2">
                            <h3 class="text-headline-sm font-bold text-slate-900">
                              {clienteSeleccionado.nombres} {clienteSeleccionado.apellidos}
                            </h3>
                            <StatusBadge status="COMPLETO" label="Activo" />
                          </div>
                          <p class="font-mono text-body-sm font-semibold text-emerald-800">
                            Cédula: {formatearCedula(clienteSeleccionado.cedula)}
                          </p>
                        </div>
                      </div>
                      <Button variant="secondary" size="sm" icon="sync" onClick={deseleccionarCliente}>
                        Cambiar Titular
                      </Button>
                    </div>

                    <div class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-emerald-200/60 pt-4 text-body-sm text-slate-700">
                      <div>
                        <span class="block text-body-xs font-medium text-slate-500">Teléfono:</span>
                        <span class="font-medium">
                          {clienteSeleccionado.telefono ? formatearTelefono(clienteSeleccionado.telefono) : 'No registrado'}
                        </span>
                      </div>
                      <div>
                        <span class="block text-body-xs font-medium text-slate-500">Origen / Emisión:</span>
                        <span class="font-medium">
                          {infoCedulaCliente?.departamento ? `${infoCedulaCliente.departamento} (${infoCedulaCliente.municipio})` : 'N/D'}
                        </span>
                      </div>
                      <div>
                        <span class="block text-body-xs font-medium text-slate-500">Dirección:</span>
                        <span class="font-medium truncate block" title={clienteSeleccionado.direccion}>
                          {clienteSeleccionado.direccion || 'No especificada'}
                        </span>
                      </div>
                    </div>

                    {/* Ficha de Historial Crediticio Interno con CAVI */}
                    <div class="mt-4 border-t border-emerald-200/60 pt-4">
                      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                        <div class="flex items-center gap-2">
                          <Icon name="history_edu" size={18} class="text-slate-700" />
                          <h4 class="text-label-sm font-bold uppercase tracking-wider text-slate-800">
                            Historial Crediticio con CAVI
                          </h4>
                        </div>
                        {loadingHistorial ? (
                          <span class="flex items-center gap-1 text-body-xs text-slate-500">
                            <Spinner size={12} /> Consultando registros...
                          </span>
                        ) : (
                          <span
                            class={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-label-xs font-bold ${
                              historialCliente.length === 0
                                ? 'bg-blue-100 text-blue-800'
                                : metricasHistorial.enMora.length > 0
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            <span
                              class={`h-1.5 w-1.5 rounded-full ${
                                historialCliente.length === 0
                                  ? 'bg-blue-600'
                                  : metricasHistorial.enMora.length > 0
                                  ? 'bg-rose-600'
                                  : 'bg-emerald-600'
                              }`}
                            />
                            {historialCliente.length === 0
                              ? 'Cliente Nuevo (Sin Historial Previo)'
                              : metricasHistorial.enMora.length > 0
                              ? `Atención: ${metricasHistorial.enMora.length} Crédito(s) en Mora`
                              : 'Historial al Día / Excelente'}
                          </span>
                        )}
                      </div>

                      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div class="rounded-lg bg-white/90 p-2.5 border border-emerald-100 text-center shadow-xs">
                          <span class="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Créditos</span>
                          <span class="text-body-md font-black text-slate-900">{historialCliente.length}</span>
                        </div>
                        <div class="rounded-lg bg-white/90 p-2.5 border border-emerald-100 text-center shadow-xs">
                          <span class="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Activos en Cobro</span>
                          <span class="text-body-md font-black text-emerald-700">{metricasHistorial.activos.length}</span>
                        </div>
                        <div class="rounded-lg bg-white/90 p-2.5 border border-emerald-100 text-center shadow-xs">
                          <span class="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Saldados / Cancelados</span>
                          <span class="text-body-md font-black text-slate-700">{metricasHistorial.cancelados.length}</span>
                        </div>
                        <div class="rounded-lg bg-white/90 p-2.5 border border-emerald-100 text-center shadow-xs">
                          <span class="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Deuda Vigente</span>
                          <span class="text-body-md font-black text-blue-900 tnum">{fmtMonto(metricasHistorial.saldoTotal)}</span>
                        </div>
                      </div>

                      {historialCliente.length > 0 && (
                        <div class="mt-3 overflow-hidden rounded-lg border border-emerald-200/80 bg-white shadow-xs">
                          <table class="w-full text-left text-body-xs">
                            <thead class="bg-slate-50/80 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                              <tr>
                                <th class="p-2">Crédito</th>
                                <th class="p-2 text-right">Monto</th>
                                <th class="p-2 text-right">Saldo Deudor</th>
                                <th class="p-2">Estado</th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                              {historialCliente.slice(0, 4).map((p) => (
                                <tr key={p.id} class="hover:bg-slate-50/50">
                                  <td class="p-2 font-medium">#{p.id} · {p.plazo_meses > 0 ? `${p.plazo_meses}m` : 'Indef.'}</td>
                                  <td class="p-2 text-right tnum">{fmtMonto(p.monto_principal)}</td>
                                  <td class="p-2 text-right tnum font-bold text-slate-800">
                                    {p.estado === 'CANCELADO' ? 'C$0.00' : fmtMonto(p.saldo_insoluto || (p as any).saldo_deudor)}
                                  </td>
                                  <td class="p-2">
                                    <span class={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      p.estado === 'CANCELADO'
                                        ? 'bg-slate-100 text-slate-700'
                                        : p.estado === 'EN_MORA'
                                        ? 'bg-rose-100 text-rose-700'
                                        : 'bg-emerald-100 text-emerald-700'
                                    }`}>
                                      {p.estado === 'CANCELADO' ? 'Cancelado' : p.estado === 'EN_MORA' ? 'Mora' : 'Activo'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div class="mt-6 rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
                    <span class="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <Icon name="person_search" size={24} />
                    </span>
                    <p class="font-medium text-slate-700">Ningún cliente seleccionado</p>
                    <p class="text-body-xs text-slate-500 mt-0.5">
                      Utilice la barra superior para buscar y vincular el prestatario de este crédito.
                    </p>
                  </div>
                )}
              </Card>

              {/* Pie de navegación de página 1 */}
              <div class="flex items-center justify-between pt-2">
                <div />
                <div class="flex items-center gap-3">
                  {!paso1Valido && (
                    <span class="text-body-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                      Seleccione un prestatario titular para continuar
                    </span>
                  )}
                  <Button
                    size="lg"
                    icon="arrow_forward"
                    disabled={!paso1Valido}
                    onClick={() => setPasoActual(2)}
                  >
                    Siguiente: Condiciones Financieras
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* PÁGINA 2: CONDICIONES FINANCIERAS */}
          {/* ============================================================== */}
          {pasoActual === 2 && (
            <div class="space-y-6">
              <div class="grid gap-6 lg:grid-cols-3">
                <div class="lg:col-span-2 space-y-6">
                  <Card
                    title="Paso 2: Condiciones del Préstamo"
                    subtitle="Establezca el capital, tasa mensual, plazo y fechas de corte"
                  >
                    <div class="space-y-5">
                      <div>
                        <Input
                          label="Monto principal (C$)"
                          value={montoPrincipal}
                          onInput={setMontoPrincipal}
                          type="number"
                          step="0.01"
                          min="0.01"
                          prefix="C$"
                          required
                          placeholder="Ej: 50000.00"
                        />
                        <div class="mt-2 flex flex-wrap items-center gap-1.5">
                          <span class="text-body-xs text-slate-400 mr-1">Montos rápidos:</span>
                          {PRESETS_MONTOS.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setMontoPrincipal(String(m))}
                              class="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-body-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-100 transition-colors"
                            >
                              C${m.toLocaleString('es-NI')}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div class="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Input
                            label="Tasa mensual"
                            value={tasaInteres}
                            onInput={setTasaInteres}
                            type="number"
                            step="0.0001"
                            min="0"
                            hint="Decimal mensual, ej: 0.0250 para 2.50%"
                          />
                          <div class="mt-2 flex flex-wrap items-center gap-1">
                            {PRESETS_TASAS.map((t) => (
                              <button
                                key={t.value}
                                type="button"
                                onClick={() => setTasaInteres(t.value)}
                                class={`rounded-md border px-2 py-0.5 text-body-xs font-medium transition-colors ${
                                  tasaInteres === t.value
                                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {t.label.split(' ')[0]}
                              </button>
                            ))}
                          </div>
                          {Number(tasaInteres) > 0.0300 && (
                            <div class="mt-2 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-center gap-1.5">
                              <Icon name="info" size={14} />
                              Tasa especial: superior al 3.00% mensual
                            </div>
                          )}
                        </div>

                        <div>
                          <div class="flex items-center justify-between mb-1">
                            <label class="block text-label-sm font-semibold text-slate-700">
                              Plazo {esPlazoIndefinido ? '(Indefinido)' : '(meses)'}
                            </label>
                            <label class="inline-flex items-center gap-1.5 cursor-pointer text-body-xs font-semibold text-indigo-700">
                              <input
                                type="checkbox"
                                checked={esPlazoIndefinido}
                                onChange={(e) => {
                                  const checked = (e.target as HTMLInputElement).checked;
                                  setEsPlazoIndefinido(checked);
                                  setPlazoMeses(checked ? '0' : '12');
                                }}
                                class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              Plazo Indefinido
                            </label>
                          </div>

                          {esPlazoIndefinido ? (
                            <div class="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-body-xs text-indigo-900 space-y-1">
                              <div class="font-bold flex items-center gap-1.5 text-indigo-800">
                                <Icon name="info" size={14} />
                                Crédito de Periodo Indefinido
                              </div>
                              <p class="text-[12px] leading-relaxed">
                                La cuota mensual es exactamente el <strong>100% del interés sobre el saldo restante de capital</strong> (ej: {(Number(tasaInteres) * 100).toFixed(1)}%). Todo abono mayor reduce capital directamente.
                              </p>
                            </div>
                          ) : (
                            <>
                              <Input
                                label="Plazo (meses)"
                                value={plazoMeses}
                                onInput={setPlazoMeses}
                                type="number"
                                min="1"
                                placeholder="Ej: 12"
                              />
                              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                                <span class="text-body-xs text-slate-400 mr-1">Plazos:</span>
                                {PRESETS_PLAZOS.map((plazo) => (
                                  <button
                                    key={plazo}
                                    type="button"
                                    onClick={() => setPlazoMeses(String(plazo))}
                                    class={`rounded-md border px-2 py-0.5 text-body-xs font-medium transition-colors ${
                                      plazoMeses === String(plazo)
                                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                    }`}
                                  >
                                    {plazo}m
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div>
                        <Select
                          label="Periodicidad"
                          value={periodicidad}
                          onChange={(valor) => setPeriodicidad(valor as 'MENSUAL' | 'QUINCENAL')}
                          options={PERIODICIDADES}
                        />
                      </div>

                      <div class="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                        <div class="flex items-center justify-between">
                          <span class="text-label-sm font-semibold text-slate-700">Cronograma de fechas</span>
                          <button
                            type="button"
                            onClick={aplicarFechaHoy}
                            class="text-body-xs font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
                          >
                            Establecer hoy y +1 ciclo
                          </button>
                        </div>
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
                    </div>
                  </Card>
                </div>

                {/* Panel lateral: Pre-visualización de cuota */}
                <div class="space-y-4">
                  <Card
                    title="Simulación de Cuota"
                    subtitle="Cálculo proyectado de cuotas"
                    action={
                      simulando ? (
                        <span class="flex items-center gap-1 text-body-xs text-slate-500">
                          <Spinner size={14} /> Calculando
                        </span>
                      ) : null
                    }
                  >
                    {simulacion ? (
                      <div class="space-y-4">
                        <div class="rounded-xl bg-slate-900 p-4 text-white">
                          <p class="text-label-xs uppercase tracking-wider text-slate-400">Cuota estimada por periodo</p>
                          <p class="tnum mt-1 text-headline-lg font-extrabold text-emerald-400">
                            {fmtMonto(simulacion.periodos[0]?.cuota)}
                          </p>
                          <p class="mt-1 text-body-xs text-slate-400">
                            Frecuencia {periodicidad.toLowerCase()} ({simulacion.total_periodos} pagos en total)
                          </p>
                        </div>

                        <div class="grid grid-cols-2 gap-2 text-body-sm">
                          <div class="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                            <span class="block text-body-xs text-slate-500">Total a pagar:</span>
                            <span class="tnum font-bold text-slate-900">{fmtMonto(simulacion.total_cuotas)}</span>
                          </div>
                          <div class="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                            <span class="block text-body-xs text-slate-500">Interés total:</span>
                            <span class="tnum font-bold text-amber-600">{fmtMonto(simulacion.total_interes)}</span>
                          </div>
                        </div>

                        <p class="text-body-xs text-slate-500">
                          Tasa periódica aplicada:{' '}
                          <span class="font-medium text-slate-700">
                            {fmtNumero(Number(simulacion.tasa_periodica) * 100)}%
                          </span>{' '}
                          (interés simple sobre saldo deudor).
                        </p>
                      </div>
                    ) : (
                      <div class="py-6 text-center text-slate-400">
                        <Icon name="query_stats" size={32} class="mx-auto mb-2 text-slate-300" />
                        <p class="text-body-sm font-medium text-slate-600">Sin simulación</p>
                        <p class="text-body-xs text-slate-400 mt-1">
                          Ingrese monto, tasa y plazo para ver el cálculo proyectado.
                        </p>
                      </div>
                    )}
                  </Card>
                </div>
              </div>

              {/* Pie de navegación de página 2 */}
              <div class="flex items-center justify-between pt-2">
                <Button variant="secondary" icon="arrow_back" onClick={() => setPasoActual(1)}>
                  Anterior: Cliente
                </Button>
                <div class="flex items-center gap-3">
                  {!paso2Valido && (
                    <span class="text-body-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                      {montoPrincipalNum <= 0
                        ? 'Ingrese el monto del préstamo'
                        : !fechaDesembolso || !fechaPrimerCorte
                        ? 'Indique las fechas de desembolso y corte'
                        : fechaPrimerCorte < fechaDesembolso
                        ? 'El corte no puede ser anterior al desembolso'
                        : !esPlazoIndefinido && !(Number(plazoMeses) > 0)
                        ? 'Indique el plazo en meses'
                        : 'Complete los datos requeridos'}
                    </span>
                  )}
                  <Button
                    size="lg"
                    icon="arrow_forward"
                    disabled={!paso2Valido}
                    onClick={() => setPasoActual(3)}
                  >
                    Siguiente: Fondeo Multifondo
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* PÁGINA 3: FONDEO MULTIFONDO */}
          {/* ============================================================== */}
          {pasoActual === 3 && (
            <div class="space-y-6">
              {/* Barra de Cobertura de Capital */}
              <Card class="bg-gradient-to-r from-slate-900 to-slate-800 text-white border-0 shadow-md">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <span class="text-label-xs uppercase tracking-wider text-slate-400">Monto total a fondear</span>
                    <p class="tnum text-headline-lg font-black text-white">{fmtMonto(montoPrincipalNum)}</p>
                  </div>
                  <div class="grid grid-cols-3 gap-4 text-left sm:text-right">
                    <div>
                      <span class="block text-body-xs text-slate-400">Asignado:</span>
                      <span class="tnum font-bold text-emerald-400">{fmtMonto(totalAportado)}</span>
                    </div>
                    <div>
                      <span class="block text-body-xs text-slate-400">Diferencia:</span>
                      <span
                        class={`tnum font-bold ${
                          Math.abs(faltante) <= 0.01 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {faltante > 0 ? `Falta ${fmtMonto(faltante)}` : faltante < 0 ? `Excede ${fmtMonto(Math.abs(faltante))}` : 'Exacto'}
                      </span>
                    </div>
                    <div>
                      <span class="block text-body-xs text-slate-400">Participación:</span>
                      <span
                        class={`tnum font-bold ${
                          Math.abs(sumaPi - 1) <= 0.0001 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {(sumaPi * 100).toFixed(1)}% <span class="text-xs text-slate-400 font-normal">1.0000</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Barra de progreso visual */}
                <div class="mt-4">
                  <div class="h-2 w-full overflow-hidden rounded-full bg-slate-700">
                    <div
                      class={`h-full transition-all duration-300 ${
                        Math.abs(faltante) <= 0.01 && Math.abs(sumaPi - 1) <= 0.0001 ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                      style={{ width: `${coberturaPorcentaje}%` }}
                    />
                  </div>
                </div>
              </Card>

              {/* Tabla de Fondos */}
              <Card
                title="Paso 3: Distribución Multifondo"
                subtitle="Seleccione las bolsas de capital y defina el monto aportado por cada familiar"
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
                  <div class="flex justify-center py-12">
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
                        <tr class="h-10 border-b border-slate-200 bg-slate-50/80">
                          <th scope="col" class="w-12 px-4" />
                          <th scope="col" class="px-4 text-left text-label-xs font-semibold uppercase text-slate-500">
                            Fondo Familiar
                          </th>
                          <th scope="col" class="px-4 text-right text-label-xs font-semibold uppercase text-slate-500">
                            Saldo Disponible
                          </th>
                          <th scope="col" class="px-4 text-left text-label-xs font-semibold uppercase text-slate-500">
                            Monto a Debitar (C$)
                          </th>
                          <th scope="col" class="px-4 text-left text-label-xs font-semibold uppercase text-slate-500">
                            % Participación
                          </th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100">
                        {fondos.map((fondo) => {
                          const activo = !!aportes[fondo.id];
                          const aporte = aportes[fondo.id];
                          const sobreSaldo =
                            activo && Number(aporte.monto_aportado) > Number(fondo.saldo_disponible);
                          return (
                            <tr
                              key={fondo.id}
                              class={`transition-colors ${
                                activo ? 'bg-emerald-50/30' : 'hover:bg-slate-50/50'
                              }`}
                            >
                              <td class="px-4 py-3">
                                <input
                                  type="checkbox"
                                  aria-label={`Usar fondo ${fondo.nombre}`}
                                  checked={activo}
                                  onChange={() => toggleFondo(fondo.id)}
                                  class="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                />
                              </td>
                              <td class="px-4 py-3">
                                <span class="block font-semibold text-slate-900">{fondo.nombre}</span>
                                <span class="block text-body-xs text-slate-500">Titular: {fondo.familiar}</span>
                              </td>
                              <td class="tnum px-4 py-3 text-right font-medium text-slate-700">
                                {fmtMonto(fondo.saldo_disponible)}
                              </td>
                              <td class="px-4 py-3">
                                <div class="relative w-36">
                                  <span class="pointer-events-none absolute left-2.5 top-1.5 text-body-xs font-semibold text-slate-400">
                                    C$
                                  </span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    aria-label={`Monto aportado ${fondo.nombre}`}
                                    disabled={!activo}
                                    value={activo ? aporte.monto_aportado : ''}
                                    onInput={(e) => handleMontoAportado(fondo.id, e.currentTarget.value)}
                                    placeholder="0.00"
                                    class={`tnum w-full rounded-md border py-1.5 pl-8 pr-2.5 outline-none transition-colors focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 font-semibold text-slate-900 ${
                                      sobreSaldo ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300'
                                    }`}
                                  />
                                </div>
                              </td>
                              <td class="px-4 py-3">
                                <div class="relative w-32">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    aria-label={`% Pi / % Participación ${fondo.nombre}`}
                                    disabled={!activo}
                                    value={
                                      activo
                                        ? pctInput[fondo.id] !== undefined
                                          ? pctInput[fondo.id]
                                          : aporte.porcentaje_pi
                                          ? String(Number((Number(aporte.porcentaje_pi) * 100).toFixed(2)))
                                          : ''
                                        : ''
                                    }
                                    onInput={(e) => handlePorcentajeInput(fondo.id, e.currentTarget.value)}
                                    placeholder="0"
                                    class="tnum w-full rounded-md border border-slate-300 py-1.5 pl-3 pr-7 outline-none transition-colors focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 font-semibold text-slate-900"
                                  />
                                  <span class="pointer-events-none absolute right-2.5 top-1.5 text-body-xs font-semibold text-slate-400">
                                    %
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* Mensajes de validación de fondeo */}
              {fondosConSobreSaldo.length > 0 && (
                <div class="rounded-xl border border-red-200 bg-red-50 p-4 text-body-sm text-red-800 flex items-start gap-2">
                  <Icon name="warning" size={18} class="shrink-0 mt-0.5 text-red-600" />
                  <div>
                    <span class="font-bold">Fondos con saldo insuficiente:</span> Uno o más fondos seleccionados
                    exceden el dinero disponible en caja.
                  </div>
                </div>
              )}

              {/* Pie de navegación de página 3 */}
              <div class="flex items-center justify-between pt-2">
                <Button variant="secondary" icon="arrow_back" onClick={() => setPasoActual(2)}>
                  Anterior: Condiciones
                </Button>
                <div class="flex items-center gap-3">
                  {!paso3Valido && (
                    <span class="text-body-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                      {fondosSeleccionados.length === 0
                        ? 'Seleccione al menos un fondo'
                        : fondosConSobreSaldo.length > 0
                        ? 'Uno o más fondos superan su saldo en caja'
                        : `Falta asignar ${fmtMonto(Math.abs(faltante))} para completar el 100%`}
                    </span>
                  )}
                  <Button
                    size="lg"
                    icon="arrow_forward"
                    disabled={!paso3Valido}
                    onClick={() => setPasoActual(4)}
                  >
                    Siguiente: Revisión y Desembolso
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* PÁGINA 4: REVISIÓN Y PROYECCIÓN */}
          {/* ============================================================== */}
          {pasoActual === 4 && (
            <div class="space-y-6">
              <Card
                title="Paso 4: Expediente y Amortización Proyectada"
                subtitle="Revise detalladamente la ficha del crédito antes de autorizar el desembolso"
              >
                {/* Cuadrícula de Resumen */}
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {/* Titular */}
                  <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div class="flex items-center gap-2 mb-2 text-label-xs font-semibold uppercase text-slate-500">
                      <Icon name="person" size={16} />
                      Prestatario Titular
                    </div>
                    <p class="font-bold text-slate-900 text-body-lg">{clienteLabel || 'Sin cliente'}</p>
                    {clienteSeleccionado && (
                      <p class="mt-1 text-body-xs text-slate-600">
                        {clienteSeleccionado.telefono ? `Tel: ${formatearTelefono(clienteSeleccionado.telefono)}` : 'Sin teléfono'} ·{' '}
                        {clienteSeleccionado.direccion || 'Sin dirección'}
                      </p>
                    )}
                  </div>

                  {/* Términos */}
                  <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div class="flex items-center gap-2 mb-2 text-label-xs font-semibold uppercase text-slate-500">
                      <Icon name="tune" size={16} />
                      Términos Financieros
                    </div>
                    <p class="font-bold text-slate-900 text-body-lg">
                      {fmtMonto(montoPrincipalNum)}
                    </p>
                    <p class="mt-1 text-body-xs text-slate-600">
                      Plazo: {esPlazoIndefinido ? 'Periodo Indefinido (cuota abierta)' : `${plazoMeses} meses`} ({periodicidad.toLowerCase()}) · Tasa: {(Number(tasaInteres) * 100).toFixed(2)}% m.
                    </p>
                    <p class="text-body-xs text-slate-500 mt-0.5">
                      Desembolso: {fechaDesembolso || 'N/D'} · 1er Corte: {fechaPrimerCorte || 'N/D'}
                    </p>
                  </div>

                  {/* Fondeo */}
                  <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div class="flex items-center gap-2 mb-2 text-label-xs font-semibold uppercase text-slate-500">
                      <Icon name="savings" size={16} />
                      Distribución de Fondos
                    </div>
                    <div class="space-y-1">
                      {filasAporte.map((f) => (
                        <div key={f.fondo.id} class="flex justify-between text-body-xs">
                          <span class="text-slate-600">{f.fondo.nombre}:</span>
                          <span class="tnum font-semibold text-slate-900">
                            {fmtMonto(f.aporte?.monto_aportado ?? 0)} ({(Number(f.aporte?.porcentaje_pi) * 100).toFixed(1)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Proyección Financiera */}
                {simulacion ? (
                  <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 border-y border-slate-200 py-4">
                      <div>
                        <p class="text-label-xs uppercase text-slate-500">Cuota periódica</p>
                        <p class="tnum text-headline-md font-bold text-slate-900">
                          {fmtMonto(simulacion.periodos[0]?.cuota)}
                        </p>
                      </div>
                      <div>
                        <p class="text-label-xs uppercase text-slate-500">Total de pagos</p>
                        <p class="tnum text-headline-md font-bold text-slate-900">
                          {simulacion.total_periodos} cuotas
                        </p>
                      </div>
                      <div>
                        <p class="text-label-xs uppercase text-slate-500">Monto total devuelto</p>
                        <p class="tnum text-headline-md font-bold text-slate-900">
                          {fmtMonto(simulacion.total_cuotas)}
                        </p>
                      </div>
                      <div>
                        <p class="text-label-xs uppercase text-slate-500">Rendimiento (Interés)</p>
                        <p class="tnum text-headline-md font-bold text-amber-600">
                          {fmtMonto(simulacion.total_interes)}
                        </p>
                      </div>
                    </div>

                    <div class="mt-4 max-h-80 overflow-y-auto rounded-xl border border-slate-200">
                      <DataTable
                        columns={columnasSimulacion}
                        rows={simulacion.periodos}
                        getKey={(periodo) => periodo.periodo}
                        caption="Proyección de cuotas"
                      />
                    </div>
                  </div>
                ) : (
                  <div class="p-6 text-center text-slate-400">
                    <p class="text-body-sm">Sin simulación disponible</p>
                  </div>
                )}

                {/* Alertas y Validaciones */}
                {validaciones.length > 0 && (
                  <ul class="mt-6 space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    {validaciones.map((mensaje) => (
                      <li key={mensaje} class="flex items-start gap-2 text-body-sm text-amber-800">
                        <Icon name="warning" size={16} class="mt-0.5 shrink-0" />
                        {mensaje}
                      </li>
                    ))}
                  </ul>
                )}

                {serverError && (
                  <p class="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-body-sm text-red-700">
                    <Icon name="warning" size={18} class="mt-0.5 shrink-0" />
                    {serverError}
                  </p>
                )}
              </Card>

              {/* Pie de navegación y Confirmación */}
              <div class="flex items-center justify-between pt-2">
                <Button variant="secondary" icon="arrow_back" onClick={() => setPasoActual(3)}>
                  Anterior: Fondeo
                </Button>
                <Button
                  size="lg"
                  icon="assignment_turned_in"
                  disabled={!canSubmit || submitting}
                  onClick={() => setShowConfirm(true)}
                >
                  Revisar y Crear Préstamo
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de confirmación final */}
      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirmar Formalización y Desembolso"
        subtitle="Verifique el resumen contractual y el fondeo antes de emitir el pagaré oficial"
        icon="assignment_turned_in"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowConfirm(false)} disabled={submitting}>
              Volver a Revisar
            </Button>
            <Button onClick={handleSubmit} loading={submitting} icon="check_circle">
              Confirmar Desembolso
            </Button>
          </>
        }
      >
        <div class="space-y-4">
          <div class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-body-xs text-emerald-900 flex items-start gap-2.5">
            <Icon name="verified_user" size={18} class="shrink-0 text-emerald-700 mt-0.5" />
            <div>
              <p class="font-bold text-emerald-950">Formalización Oficial CAVI</p>
              <p class="mt-0.5 text-emerald-800">
                Se debitarán los saldos de cada bolsa familiar de forma atómica y se generará el documento legal de Pagaré Notarial con numeración única para su firma.
              </p>
            </div>
          </div>

          <dl class="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl bg-slate-50 p-4 border border-slate-200 text-body-sm">
            {[
              ['Cliente Titular', clienteLabel],
              ['Monto Principal', fmtMonto(montoPrincipalNum)],
              ['Tasa Pactada', `${(Number(tasaInteres) * 100).toFixed(2)}% mensual`],
              ['Plazo y Frecuencia', esPlazoIndefinido ? `Periodo Indefinido (${periodicidad.toLowerCase()})` : `${plazoMeses} meses (${periodicidad.toLowerCase()})`],
              ['Fecha Desembolso', fechaDesembolso],
              ['Primer Corte', fechaPrimerCorte],
              ['Cuota Estimada', simulacion?.periodos[0]?.cuota ? fmtMonto(simulacion.periodos[0].cuota) : 'Según interés'],
              ['Total a Pagar', simulacion?.total_cuotas ? fmtMonto(simulacion.total_cuotas) : 'Según ciclos'],
            ].map(([label, valor]) => (
              <div key={label} class="flex justify-between gap-2 border-b border-slate-100 py-1">
                <dt class="text-slate-500 font-medium">{label}:</dt>
                <dd class="font-bold text-slate-900 tnum">{valor}</dd>
              </div>
            ))}
          </dl>

          <div>
            <p class="mb-2 text-label-sm font-semibold uppercase tracking-wider text-slate-700">Débitos por Bolsa Familiar</p>
            <div class="overflow-hidden rounded-xl border border-slate-200">
              <DataTable
                columns={[
                  {
                    key: 'fondo',
                    header: 'Fondo',
                    render: (fila) => <span class="font-semibold text-slate-900">{fila.fondo.nombre}</span>,
                  },
                  {
                    key: 'monto',
                    header: 'Monto debitado',
                    align: 'right',
                    render: (fila) => (
                      <span class="tnum font-bold text-slate-900">
                        {fmtMonto(fila.aporte?.monto_aportado ?? 0)}
                      </span>
                    ),
                  },
                  {
                    key: 'pi',
                    header: 'Participación (%)',
                    align: 'right',
                    render: (fila) => (
                      <span class="tnum font-medium text-slate-800">
                        {((Number(fila.aporte?.porcentaje_pi) || 0) * 100).toFixed(1)}%
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
