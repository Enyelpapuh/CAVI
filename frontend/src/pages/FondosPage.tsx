import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
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
  useToast,
  type Columna,
} from '../components/ui';
import { fondoService } from '../services/api';
import { fmtMonto, fmtCantidad, fmtFechaHora, iniciales } from '../lib/format';
import type { Fondo, MovimientoFondo } from '../types';

const POR_PAGINA = 20;

const ESTILO_MOVIMIENTO: Record<string, string> = {
  INYECCION: 'border-green-200 bg-green-50 text-green-700 font-semibold',
  REINTEGRO: 'border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold',
  RETIRO: 'border-orange-200 bg-orange-50 text-orange-700 font-semibold',
  DESEMBOLSO: 'border-blue-200 bg-blue-50 text-blue-700 font-semibold',
  GANANCIA: 'border-amber-200 bg-amber-50 text-amber-700 font-semibold',
};

const SIGNO: Record<string, string> = {
  INYECCION: '+',
  REINTEGRO: '+',
  GANANCIA: '+',
  RETIRO: '-',
  DESEMBOLSO: '-',
};

type ModalState =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'inyeccion'; fondo: Fondo }
  | { type: 'retiro'; fondo: Fondo }
  | { type: 'movimientos'; fondo: Fondo };

type FiltroLiquidez = 'TODOS' | 'CON_SALDO' | 'SIN_SALDO';

export function FondosPage() {
  const [fondos, setFondos] = useState<Fondo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroLiquidez, setFiltroLiquidez] = useState<FiltroLiquidez>('TODOS');
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  // Estados de privacidad de saldos y expansión de información
  const [saldosOcultos, setSaldosOcultos] = useState<boolean>(() => {
    try {
      return localStorage.getItem('cavi_fondos_ocultar_saldos') === 'true';
    } catch {
      return false;
    }
  });
  const [tarjetasVisibles, setTarjetasVisibles] = useState<Record<number, boolean>>({});
  const [fondosExpandidos, setFondosExpandidos] = useState<Record<number, boolean>>({});

  const toggleSaldosOcultos = () => {
    setSaldosOcultos((prev) => {
      const nuevo = !prev;
      try {
        localStorage.setItem('cavi_fondos_ocultar_saldos', String(nuevo));
      } catch {}
      setTarjetasVisibles({});
      return nuevo;
    });
  };

  const toggleTarjetaVisible = (id: number) => {
    setTarjetasVisibles((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleExpandido = (id: number) => {
    setFondosExpandidos((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const [createForm, setCreateForm] = useState({
    nombre: '',
    familiar: '',
    tipo_persona: 'NATURAL' as 'NATURAL' | 'JURIDICA',
    identificacion: '',
    nombres_titular: '',
    apellidos_titular: '',
    razon_social: '',
    ruc: '',
    representante_legal: '',
    cedula_representante: '',
    telefono_contacto: '',
    direccion_legal: '',
    parentesco_relacion: '',
    capital_inicial: '',
  });
  const [montoForm, setMontoForm] = useState({ monto: '', descripcion: '' });

  const [movimientos, setMovimientos] = useState<MovimientoFondo[]>([]);
  const [movLoading, setMovLoading] = useState(false);
  const [movPage, setMovPage] = useState(1);
  const [movTotal, setMovTotal] = useState(0);

  const fetchFondos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fondoService.list({ search });
      setFondos(data.results);
    } catch {
      toast.error('No se pudieron cargar los fondos');
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => {
    fetchFondos();
  }, [fetchFondos]);

  const loadMovimientos = useCallback(async (fondoId: number, page: number) => {
    setMovLoading(true);
    try {
      const data = await fondoService.movimientos(fondoId, { page });
      setMovimientos(data.results);
      setMovTotal(data.count);
    } catch {
      toast.error('No se pudieron cargar los movimientos');
    } finally {
      setMovLoading(false);
    }
  }, [toast]);

  const handleCreate = async (e: Event) => {
    e.preventDefault();
    if (!createForm.nombre || !createForm.capital_inicial) {
      setError('El nombre de la bolsa y el capital inicial son obligatorios.');
      return;
    }
    if (Number(createForm.capital_inicial) <= 0) {
      setError('El capital inicial debe ser mayor a cero.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const familiarCalculado =
        createForm.familiar.trim() ||
        (createForm.tipo_persona === 'NATURAL'
          ? `${createForm.nombres_titular} ${createForm.apellidos_titular}`.trim() || createForm.nombre
          : createForm.razon_social.trim() || createForm.nombre);

      const payload = {
        ...createForm,
        familiar: familiarCalculado,
      };

      await fondoService.create(payload);
      toast.success('Bolsa de capital registrada exitosamente con respaldo legal');
      setModal({ type: 'none' });
      setCreateForm({
        nombre: '',
        familiar: '',
        tipo_persona: 'NATURAL',
        identificacion: '',
        nombres_titular: '',
        apellidos_titular: '',
        razon_social: '',
        ruc: '',
        representante_legal: '',
        cedula_representante: '',
        telefono_contacto: '',
        direccion_legal: '',
        parentesco_relacion: '',
        capital_inicial: '',
      });
      fetchFondos();
    } catch (err: any) {
      const data = err.response?.data;
      if (data && typeof data === 'object') {
        setError(Object.values(data).flat().map(String).join(' ') || 'Error al crear la bolsa');
      } else {
        setError('Error al crear la bolsa de capital');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleMovimiento = async (e: Event) => {
    e.preventDefault();
    if (!montoForm.monto || Number(montoForm.monto) <= 0) {
      setError('Ingrese un monto válido mayor a cero');
      return;
    }
    if (modal.type !== 'inyeccion' && modal.type !== 'retiro') return;
    setSubmitting(true);
    setError('');
    const esInyeccion = modal.type === 'inyeccion';
    const nombre = modal.fondo.nombre;
    try {
      if (esInyeccion) await fondoService.inyeccion(modal.fondo.id, montoForm);
      else await fondoService.retiro(modal.fondo.id, montoForm);
      toast.success(`${esInyeccion ? 'Inyección' : 'Retiro'} registrado en ${nombre}`);
      setModal({ type: 'none' });
      setMontoForm({ monto: '', descripcion: '' });
      fetchFondos();
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.error) setError(String(data.error));
      else if (data?.monto) setError((data.monto as string[]).join(' '));
      else setError('Error al procesar la operación');
    } finally {
      setSubmitting(false);
    }
  };

  const openMovimientos = (fondo: Fondo) => {
    setModal({ type: 'movimientos', fondo });
    setMovimientos([]);
    setMovPage(1);
    setMovTotal(0);
    loadMovimientos(fondo.id, 1);
  };

  const cerrar = useCallback(() => {
    setModal({ type: 'none' });
    setError('');
  }, []);

  // Métricas Consolidadas Globales de Capital
  const capitalEnCalle = useMemo(
    () => fondos.reduce((total, fondo) => total + (Number(fondo.capital_colocado) || 0), 0),
    [fondos]
  );

  const saldoDisponible = useMemo(
    () => fondos.reduce((total, fondo) => total + (Number(fondo.saldo_disponible) || 0), 0),
    [fondos]
  );

  const capitalTotalConsolidado = saldoDisponible + capitalEnCalle;
  const ratioColocado =
    capitalTotalConsolidado > 0 ? (capitalEnCalle / capitalTotalConsolidado) * 100 : 0;
  const ratioDisponible = 100 - ratioColocado;

  // Filtros de visualización
  const fondosFiltrados = useMemo(() => {
    return fondos.filter((f) => {
      const saldo = Number(f.saldo_disponible) || 0;
      if (filtroLiquidez === 'CON_SALDO') return saldo > 0;
      if (filtroLiquidez === 'SIN_SALDO') return saldo <= 0;
      return true;
    });
  }, [fondos, filtroLiquidez]);

  const fondosConSaldo = useMemo(
    () => fondos.filter((f) => (Number(f.saldo_disponible) || 0) > 0).length,
    [fondos]
  );
  const fondosSinSaldo = fondos.length - fondosConSaldo;

  const columnasMovimiento: Columna<MovimientoFondo>[] = [
    {
      key: 'tipo',
      header: 'Tipo',
      width: '150px',
      render: (mov) => (
        <span
          class={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-label-xs uppercase ${
            ESTILO_MOVIMIENTO[mov.tipo] ?? 'border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          {SIGNO[mov.tipo] ?? ''}
          {mov.tipo_display}
        </span>
      ),
    },
    {
      key: 'monto',
      header: 'Monto',
      align: 'right',
      render: (mov) => (
        <span
          class={`tnum font-bold ${
            mov.tipo === 'INYECCION' || mov.tipo === 'GANANCIA' ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {fmtMonto(mov.monto)}
        </span>
      ),
    },
    {
      key: 'anterior',
      header: 'Saldo anterior',
      align: 'right',
      className: 'text-slate-500',
      render: (mov) => <span class="tnum">{fmtMonto(mov.saldo_anterior)}</span>,
    },
    {
      key: 'posterior',
      header: 'Saldo posterior',
      align: 'right',
      render: (mov) => <span class="tnum font-medium text-slate-800">{fmtMonto(mov.saldo_posterior)}</span>,
    },
    {
      key: 'fecha',
      header: 'Fecha',
      render: (mov) => (
        <div class="min-w-0">
          <p class="tnum text-slate-700">{fmtFechaHora(mov.creado_en)}</p>
          {mov.descripcion && <p class="truncate text-body-xs text-slate-500">{mov.descripcion}</p>}
        </div>
      ),
    },
  ];

  const fondoActivo = modal.type !== 'none' && 'fondo' in modal ? modal.fondo : null;
  const paginasMovimientos = Math.max(1, Math.ceil(movTotal / POR_PAGINA));

  return (
    <Layout titulo="Bolsas de Capital">
      <PageHeader
        titulo="Bolsas de Capital"
        descripcion={`Control de liquidez en caja y capital regado por fondo familiar (${fmtCantidad(fondos.length)} bolsa${fondos.length === 1 ? '' : 's'})`}
        actions={
          <div class="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={saldosOcultos ? 'visibility' : 'visibility_off'}
              onClick={toggleSaldosOcultos}
              title={saldosOcultos ? 'Mostrar todos los saldos de caja' : 'Ocultar saldos por privacidad'}
            >
              {saldosOcultos ? 'Mostrar Saldos' : 'Ocultar Saldos'}
            </Button>
            <Button
              icon="add"
              onClick={() => {
                setError('');
                setModal({ type: 'create' });
              }}
            >
              Nuevo Fondo
            </Button>
          </div>
        }
      />

      {/* Resumen Consolidado Global de Capital */}
      <div class="space-y-3">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiTile
            label="Dinero Disponible"
            value={saldosOcultos ? 'C$ ••••••' : fmtMonto(saldoDisponible)}
            icon="savings"
            tono="esmeralda"
            pie="Líquido en caja para prestar"
          />
          <KpiTile
            label="Capital Regado"
            value={fmtMonto(capitalEnCalle)}
            icon="point_of_sale"
            tono="indigo"
            pie="En calle en créditos activos"
          />
          <KpiTile
            label="Capital Total"
            value={fmtMonto(capitalTotalConsolidado)}
            icon="account_balance"
            tono="neutro"
            pie="Patrimonio global administrado"
          />
        </div>

        {/* Barra de Distribución de Liquidez vs. Colocación */}
        {capitalTotalConsolidado > 0 && (
          <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div class="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between text-body-xs">
              <div class="flex items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span class="font-medium text-slate-700">
                  Líquido en caja: <span class="font-bold text-slate-900">{fmtMonto(saldoDisponible)}</span> ({ratioDisponible.toFixed(1)}%)
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-full bg-indigo-500 shrink-0" />
                <span class="font-medium text-slate-700">
                  Capital regado en calle: <span class="font-bold text-slate-900">{fmtMonto(capitalEnCalle)}</span> ({ratioColocado.toFixed(1)}%)
                </span>
              </div>
            </div>
            <div class="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 flex">
              <div
                class="bg-indigo-500 transition-all duration-300"
                style={{ width: `${ratioColocado}%` }}
                title={`Capital Regado: ${fmtMonto(capitalEnCalle)}`}
              />
              <div
                class="bg-emerald-500 transition-all duration-300"
                style={{ width: `${ratioDisponible}%` }}
                title={`Dinero Disponible: ${fmtMonto(saldoDisponible)}`}
              />
            </div>
          </div>
        )}
      </div>

      {/* Buscador y Filtros de Liquidez */}
      <div class="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="relative flex-1 sm:max-w-md">
          <Icon
            name="search"
            size={20}
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={search}
            onInput={(e) => setSearch((e.currentTarget as HTMLInputElement).value)}
            placeholder="Buscar por nombre o familiar..."
            aria-label="Buscar fondos"
            class="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-body-md text-slate-800 outline-none transition-shadow focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 shadow-sm"
          />
        </div>

        <div class="flex items-center gap-1.5 overflow-x-auto">
          {(['TODOS', 'CON_SALDO', 'SIN_SALDO'] as const).map((filtro) => {
            const activo = filtroLiquidez === filtro;
            return (
              <button
                key={filtro}
                type="button"
                onClick={() => setFiltroLiquidez(filtro)}
                class={`rounded-lg px-3 py-1.5 text-body-xs font-semibold transition-colors ${
                  activo
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {filtro === 'TODOS'
                  ? `Todas (${fondos.length})`
                  : filtro === 'CON_SALDO'
                  ? `Con Saldo (${fondosConSaldo})`
                  : `Sin Saldo (${fondosSinSaldo})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cuadrícula de Tarjetas de Cada Bolsa Familiar */}
      {loading ? (
        <div class="flex justify-center py-16">
          <Spinner size={40} />
        </div>
      ) : fondosFiltrados.length === 0 ? (
        <EmptyState
          icon="savings"
          title={search || filtroLiquidez !== 'TODOS' ? 'Sin resultados para este filtro' : 'No se encontraron fondos'}
          description={
            search || filtroLiquidez !== 'TODOS'
              ? 'Pruebe cambiando el término de búsqueda o seleccionando otro filtro de liquidez.'
              : 'Cree la primera bolsa familiar para empezar a colocar créditos.'
          }
        />
      ) : (
        <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {fondosFiltrados.map((fondo) => {
            const capitalTotalFondo =
              (Number(fondo.saldo_disponible) || 0) + (Number(fondo.capital_colocado) || 0);
            const ratioColocadoFondo =
              capitalTotalFondo > 0
                ? ((Number(fondo.capital_colocado) || 0) / capitalTotalFondo) * 100
                : 0;
            const ratioDisponibleFondo = 100 - ratioColocadoFondo;
            const estaExpandido = !!fondosExpandidos[fondo.id];
            const oculto = saldosOcultos && !tarjetasVisibles[fondo.id];

            return (
              <Card key={fondo.id} padded={false} class="flex flex-col overflow-hidden border border-slate-200 hover:shadow-md transition-shadow">
                {/* Cabecera de la Bolsa */}
                <div class="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
                  <div class="flex items-center gap-3 min-w-0">
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-label-md">
                      {iniciales(fondo.nombre)}
                    </span>
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="truncate text-headline-sm font-bold text-slate-900">{fondo.nombre}</h3>
                        <span
                          class={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            fondo.tipo_persona === 'JURIDICA'
                              ? 'border border-indigo-200 bg-indigo-50 text-indigo-700'
                              : 'border border-slate-200 bg-slate-100 text-slate-700'
                          }`}
                        >
                          {fondo.tipo_persona === 'JURIDICA' ? 'Persona Jurídica' : 'Persona Natural'}
                        </span>
                      </div>
                      <p class="truncate text-body-xs text-slate-500">
                        {fondo.tipo_persona === 'JURIDICA'
                          ? `RUC: ${fondo.ruc || 'N/D'} · ${fondo.familiar}`
                          : `Titular: ${fondo.familiar}${fondo.identificacion ? ` (${fondo.identificacion})` : ''}`}
                      </p>
                    </div>
                  </div>
                  <span
                    class={`shrink-0 rounded-full px-2.5 py-0.5 text-label-xs font-semibold uppercase ${
                      fondo.activo
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border border-slate-200 bg-slate-100 text-slate-500'
                    }`}
                  >
                    {fondo.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                {/* Cuerpo: Métricas Clave de Liquidez y Capital */}
                <div class="flex-1 space-y-3 px-5 py-4">
                  {/* Destacado: Dinero Disponible con botón de privacidad */}
                  <div class="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3.5 transition-all">
                    <div class="flex items-center justify-between">
                      <span class="block text-label-xs font-semibold uppercase tracking-wider text-emerald-800">
                        Dinero Disponible (en caja)
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleTarjetaVisible(fondo.id)}
                        aria-label={oculto ? `Mostrar saldo de ${fondo.nombre}` : `Ocultar saldo de ${fondo.nombre}`}
                        class="rounded-md p-1 text-emerald-700/70 hover:bg-emerald-100/70 hover:text-emerald-900 transition-colors"
                        title={oculto ? 'Mostrar saldo' : 'Ocultar saldo por privacidad'}
                      >
                        <Icon name={oculto ? 'visibility' : 'visibility_off'} size={16} />
                      </button>
                    </div>

                    <div class="mt-1 flex items-baseline gap-2">
                      <p class="tnum text-headline-lg font-black text-emerald-700">
                        {oculto ? 'C$ ••••••' : fmtMonto(fondo.saldo_disponible)}
                      </p>
                      {oculto && (
                        <span class="rounded bg-emerald-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                          Oculto
                        </span>
                      )}
                    </div>
                    <span class="text-body-xs text-emerald-600/80">Líquido disponible para desembolsos</span>
                  </div>

                  {/* Resumen Homogéneo de Capital */}
                  <dl class="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-body-xs border border-slate-100">
                    <div>
                      <dt class="text-slate-500 font-medium truncate">Capital Regado</dt>
                      <dd class="tnum font-bold text-slate-900 mt-0.5">
                        {fmtMonto(fondo.capital_colocado ?? 0)}
                      </dd>
                      <span class="text-[10px] text-slate-400">En calle</span>
                    </div>
                    <div>
                      <dt class="text-slate-500 font-medium truncate">Capital Total</dt>
                      <dd class="tnum font-bold text-slate-900 mt-0.5">
                        {fmtMonto(capitalTotalFondo)}
                      </dd>
                      <span class="text-[10px] text-slate-400">Patrimonio</span>
                    </div>
                    <div>
                      <dt class="text-slate-500 font-medium truncate">Capital Inicial</dt>
                      <dd class="tnum font-bold text-slate-700 mt-0.5">
                        {fmtMonto(fondo.capital_inicial)}
                      </dd>
                      <span class="text-[10px] text-slate-400">Registrado</span>
                    </div>
                  </dl>

                  {/* Botón Ver Más Información */}
                  <button
                    type="button"
                    onClick={() => toggleExpandido(fondo.id)}
                    class="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-body-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
                  >
                    <span class="flex items-center gap-1.5">
                      <Icon name={estaExpandido ? 'expand_less' : 'expand_more'} size={18} class="text-slate-500" />
                      {estaExpandido ? 'Ver menos detalles' : 'Ver más información y rendimiento'}
                    </span>
                    <span class="text-[11px] font-mono text-slate-400">
                      {estaExpandido ? 'Colapsar' : 'Detalles'}
                    </span>
                  </button>

                  {/* Panel Extendido Desplegable */}
                  {estaExpandido && (
                    <div class="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3 text-body-xs animate-in fade-in duration-150">
                      <div class="flex items-center justify-between border-b border-slate-200/80 pb-2">
                        <span class="font-bold text-slate-800">Rendimiento Acumulado</span>
                        <div class="text-right">
                          <span class="font-extrabold text-emerald-700 tnum">
                            {fmtMonto(fondo.ganancias_acumuladas ?? 0)}
                          </span>
                          <span class="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800">
                            {fondo.rentabilidad ? `${fondo.rentabilidad}%` : '0.00%'}
                          </span>
                        </div>
                      </div>

                      {/* Ratio Colocación vs. Liquidez individual */}
                      {capitalTotalFondo > 0 && (
                        <div>
                          <div class="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                            <span>Colocado: {ratioColocadoFondo.toFixed(1)}%</span>
                            <span>En Caja: {ratioDisponibleFondo.toFixed(1)}%</span>
                          </div>
                          <div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 flex">
                            <div class="bg-indigo-500" style={{ width: `${ratioColocadoFondo}%` }} />
                            <div class="bg-emerald-500" style={{ width: `${ratioDisponibleFondo}%` }} />
                          </div>
                        </div>
                      )}

                      {/* Ficha de Cumplimiento Legal */}
                      <div class="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5 text-[11px] text-slate-700">
                        <div class="font-bold text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between">
                          <span>Información Legal de la Bolsa</span>
                          <span class="font-mono text-slate-500 font-semibold">
                            {fondo.tipo_persona_display || (fondo.tipo_persona === 'JURIDICA' ? 'Persona Jurídica' : 'Persona Natural')}
                          </span>
                        </div>
                        {fondo.tipo_persona === 'JURIDICA' ? (
                          <>
                            <div class="grid grid-cols-2 gap-1">
                              <div><span class="text-slate-400">Razón Social:</span> <span class="font-semibold">{fondo.razon_social || fondo.familiar}</span></div>
                              <div><span class="text-slate-400">RUC:</span> <span class="font-mono font-semibold">{fondo.ruc || 'No registrado'}</span></div>
                            </div>
                            <div class="grid grid-cols-2 gap-1">
                              <div><span class="text-slate-400">Representante Legal:</span> <span class="font-semibold">{fondo.representante_legal || 'No registrado'}</span></div>
                              <div><span class="text-slate-400">Cédula Representante:</span> <span class="font-mono">{fondo.cedula_representante || 'N/D'}</span></div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div class="grid grid-cols-2 gap-1">
                              <div><span class="text-slate-400">Titular:</span> <span class="font-semibold">{fondo.familiar}</span></div>
                              <div><span class="text-slate-400">Cédula:</span> <span class="font-mono font-semibold">{fondo.identificacion || 'No registrada'}</span></div>
                            </div>
                            {fondo.parentesco_relacion && (
                              <div><span class="text-slate-400">Parentesco / Relación:</span> <span class="font-semibold">{fondo.parentesco_relacion}</span></div>
                            )}
                          </>
                        )}
                        <div class="grid grid-cols-2 gap-1 pt-1 border-t border-slate-100 text-slate-600">
                          <div><span class="text-slate-400">Teléfono:</span> <span>{fondo.telefono_contacto || 'No registrado'}</span></div>
                          <div><span class="text-slate-400">Domicilio:</span> <span class="truncate block" title={fondo.direccion_legal || ''}>{fondo.direccion_legal || 'No especificado'}</span></div>
                        </div>
                      </div>

                      <div class="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1">
                        <div>
                          <span class="text-slate-400 block">Registrado el:</span>
                          <span class="font-medium text-slate-800">{fmtFechaHora(fondo.creado_en)}</span>
                        </div>
                        <div>
                          <span class="text-slate-400 block">Última operación:</span>
                          <span class="font-medium text-slate-800">{fmtFechaHora(fondo.actualizado_en)}</span>
                        </div>
                      </div>

                      <div class="pt-1">
                        <a
                          href="/reportes/bolsas"
                          class="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          <Icon name="analytics" size={14} />
                          Ver informe financiero mensual de bolsas &rarr;
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {/* Acciones Operativas de la Bolsa */}
                <div class="flex items-center gap-2 border-t border-slate-100 bg-slate-50/40 px-5 py-3">
                  <Button
                    size="sm"
                    icon="add"
                    class="flex-1"
                    onClick={() => {
                      setError('');
                      setMontoForm({ monto: '', descripcion: '' });
                      setModal({ type: 'inyeccion', fondo });
                    }}
                  >
                    Inyección
                  </Button>
                  <Button
                    size="sm"
                    icon="upload"
                    variant="secondary"
                    class="flex-1"
                    onClick={() => {
                      setError('');
                      setMontoForm({ monto: '', descripcion: '' });
                      setModal({ type: 'retiro', fondo });
                    }}
                  >
                    Retiro
                  </Button>
                  <Button
                    size="sm"
                    icon="receipt_long"
                    variant="ghost"
                    onClick={() => openMovimientos(fondo)}
                  >
                    Movimientos
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: Crear Bolsa de Capital con Datos Legales */}
      <Modal
        open={modal.type === 'create'}
        onClose={cerrar}
        title="Crear Bolsa de Capital"
        subtitle="Constituya una nueva bolsa independiente con respaldo e información legal"
        icon="savings"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={cerrar} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" form="form-fondo" loading={submitting}>
              Crear Bolsa
            </Button>
          </>
        }
      >
        <form id="form-fondo" onSubmit={handleCreate} class="space-y-4">
          {/* Selector de Clasificación Legal */}
          <div>
            <label class="block text-label-sm font-semibold text-slate-700 mb-1.5">
              Tipo de Persona Titular / Aportante de la Bolsa
            </label>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCreateForm({ ...createForm, tipo_persona: 'NATURAL' })}
                class={`flex items-center justify-center gap-2 rounded-xl border p-3 text-body-sm font-semibold transition-all ${
                  createForm.tipo_persona === 'NATURAL'
                    ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon name="person" size={18} />
                Persona Natural (Titular Individual)
              </button>
              <button
                type="button"
                onClick={() => setCreateForm({ ...createForm, tipo_persona: 'JURIDICA' })}
                class={`flex items-center justify-center gap-2 rounded-xl border p-3 text-body-sm font-semibold transition-all ${
                  createForm.tipo_persona === 'JURIDICA'
                    ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon name="account_balance" size={18} />
                Persona Jurídica (Empresa / Sociedad)
              </button>
            </div>
            <p class="mt-1 text-body-xs text-slate-500">
              {createForm.tipo_persona === 'NATURAL'
                ? 'Identificación mediante Cédula de Identidad Ciudadana de Nicaragua.'
                : 'Identificación institucional mediante Cédula RUC y Representante Legal debidamente facultado.'}
            </p>
          </div>

          {/* Datos Generales de la Bolsa */}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Nombre Descriptivo de la Bolsa"
              value={createForm.nombre}
              onInput={(valor) => setCreateForm({ ...createForm, nombre: valor })}
              required
              placeholder="Ej: Bolsa Morales C$, Fondo San Juan"
            />
            <Input
              label="Capital Inicial (C$)"
              value={createForm.capital_inicial}
              onInput={(valor) => setCreateForm({ ...createForm, capital_inicial: valor })}
              type="number"
              step="0.01"
              min="0.01"
              prefix="C$"
              required
              hint="El fondo inicia con este saldo disponible en caja."
            />
          </div>

          {/* Formulario Dinámico según Tipo de Persona */}
          {createForm.tipo_persona === 'NATURAL' ? (
            <div class="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div class="flex items-center gap-2 text-label-xs font-bold uppercase tracking-wider text-slate-700">
                <Icon name="badge" size={16} />
                Datos Legales del Titular (Persona Natural)
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Cédula de Identidad"
                  value={createForm.identificacion}
                  onInput={(valor) => setCreateForm({ ...createForm, identificacion: valor })}
                  placeholder="001-XXXXXX-XXXXX"
                  hint="Cédula nicaragüense del aportante"
                />
                <Input
                  label="Nombres del Titular"
                  value={createForm.nombres_titular}
                  onInput={(valor) => setCreateForm({ ...createForm, nombres_titular: valor })}
                  placeholder="Nombres de pila"
                />
                <Input
                  label="Apellidos del Titular"
                  value={createForm.apellidos_titular}
                  onInput={(valor) => setCreateForm({ ...createForm, apellidos_titular: valor })}
                  placeholder="Apellidos"
                />
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Parentesco / Relación con Administración"
                  value={createForm.parentesco_relacion}
                  onInput={(valor) => setCreateForm({ ...createForm, parentesco_relacion: valor })}
                  placeholder="Ej: Hermano, Cónyuge, Inversionista Externo"
                />
                <Input
                  label="Teléfono de Contacto"
                  value={createForm.telefono_contacto}
                  onInput={(valor) => setCreateForm({ ...createForm, telefono_contacto: valor })}
                  placeholder="8888-0000"
                />
              </div>
              <Input
                label="Dirección Domiciliar Legal"
                value={createForm.direccion_legal}
                onInput={(valor) => setCreateForm({ ...createForm, direccion_legal: valor })}
                placeholder="Dirección exacta de residencia del titular..."
              />
            </div>
          ) : (
            <div class="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div class="flex items-center gap-2 text-label-xs font-bold uppercase tracking-wider text-slate-700">
                <Icon name="account_balance" size={16} />
                Datos Legales de la Empresa (Persona Jurídica)
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Razón Social / Denominación Legal"
                  value={createForm.razon_social}
                  onInput={(valor) => setCreateForm({ ...createForm, razon_social: valor })}
                  placeholder="Ej: Inversiones del Valle S.A."
                />
                <Input
                  label="Número RUC"
                  value={createForm.ruc}
                  onInput={(valor) => setCreateForm({ ...createForm, ruc: valor })}
                  placeholder="J0310000000000"
                  hint="Registro Único del Contribuyente (14 dígitos)"
                />
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Nombre del Representante Legal"
                  value={createForm.representante_legal}
                  onInput={(valor) => setCreateForm({ ...createForm, representante_legal: valor })}
                  placeholder="Nombre y apellidos del apoderado"
                />
                <Input
                  label="Cédula del Representante Legal"
                  value={createForm.cedula_representante}
                  onInput={(valor) => setCreateForm({ ...createForm, cedula_representante: valor })}
                  placeholder="001-XXXXXX-XXXXX"
                />
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Teléfono Institucional"
                  value={createForm.telefono_contacto}
                  onInput={(valor) => setCreateForm({ ...createForm, telefono_contacto: valor })}
                  placeholder="2200-0000 / 8888-0000"
                />
                <Input
                  label="Domicilio Fiscal / Dirección Legal"
                  value={createForm.direccion_legal}
                  onInput={(valor) => setCreateForm({ ...createForm, direccion_legal: valor })}
                  placeholder="Dirección legal o sede comercial..."
                />
              </div>
            </div>
          )}

          {error && (
            <p class="flex items-start gap-2 text-body-sm text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
              <Icon name="warning" size={16} class="mt-0.5 shrink-0" />
              {error}
            </p>
          )}
        </form>
      </Modal>

      {/* Modal: Inyección / Retiro de Capital */}
      <Modal
        open={modal.type === 'inyeccion' || modal.type === 'retiro'}
        onClose={cerrar}
        title={modal.type === 'retiro' ? 'Retiro de Capital' : 'Inyección de Capital'}
        subtitle={fondoActivo ? `${fondoActivo.nombre} · ${fondoActivo.familiar}` : undefined}
        icon={modal.type === 'retiro' ? 'upload' : 'add'}
        footer={
          <>
            <Button variant="ghost" onClick={cerrar} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-movimiento"
              loading={submitting}
              variant={modal.type === 'retiro' ? 'destructive' : 'primary'}
            >
              {modal.type === 'retiro' ? 'Retirar' : 'Inyectar'}
            </Button>
          </>
        }
      >
        {fondoActivo && (
          <form id="form-movimiento" onSubmit={handleMovimiento} class="space-y-4">
            <div class="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 border border-slate-200">
              <span class="text-body-md text-slate-600 font-medium">Saldo disponible actual</span>
              <span class="tnum font-bold text-slate-900 text-body-lg">{fmtMonto(fondoActivo.saldo_disponible)}</span>
            </div>
            <Input
              label="Monto"
              value={montoForm.monto}
              onInput={(valor) => setMontoForm({ ...montoForm, monto: valor })}
              type="number"
              step="0.01"
              min="0.01"
              prefix="C$"
              required
              hint={
                modal.type === 'retiro'
                  ? `No puede superar ${fmtMonto(fondoActivo.saldo_disponible)}.`
                  : undefined
              }
            />
            <Input
              label="Descripción"
              value={montoForm.descripcion}
              onInput={(valor) => setMontoForm({ ...montoForm, descripcion: valor })}
              placeholder={modal.type === 'inyeccion' ? 'Inyección de capital' : 'Retiro de capital'}
            />
            {error && (
              <p class="flex items-start gap-2 text-body-sm text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
                <Icon name="warning" size={16} class="mt-0.5 shrink-0" />
                {error}
              </p>
            )}
          </form>
        )}
      </Modal>

      {/* Modal: Historial de Movimientos */}
      <Modal
        open={modal.type === 'movimientos'}
        onClose={cerrar}
        title="Historial de Movimientos"
        subtitle={fondoActivo ? `${fondoActivo.nombre} · ${fondoActivo.familiar}` : undefined}
        icon="receipt_long"
        size="xl"
        footer={
          <>
            <span class="mr-auto text-body-sm text-slate-500">
              Página {movPage} de {paginasMovimientos} · {fmtCantidad(movTotal)} movimientos
            </span>
            <Button
              variant="secondary"
              size="sm"
              icon="arrow_back"
              disabled={movPage === 1}
              onClick={() => {
                setMovPage(movPage - 1);
                if (fondoActivo) loadMovimientos(fondoActivo.id, movPage - 1);
              }}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              size="sm"
              iconRight="arrow_forward"
              disabled={movPage >= paginasMovimientos}
              onClick={() => {
                setMovPage(movPage + 1);
                if (fondoActivo) loadMovimientos(fondoActivo.id, movPage + 1);
              }}
            >
              Siguiente
            </Button>
          </>
        }
      >
        <DataTable
          columns={columnasMovimiento}
          rows={movimientos}
          getKey={(mov) => mov.id}
          caption="Historial de movimientos del fondo"
          loading={movLoading}
          emptyTitle="Sin movimientos registrados"
          emptyDescription="Las inyecciones, retiros y desembolsos aparecerán aquí."
        />
      </Modal>
    </Layout>
  );
}
