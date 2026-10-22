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
  RETIRO: 'border-orange-200 bg-orange-50 text-orange-700 font-semibold',
  DESEMBOLSO: 'border-blue-200 bg-blue-50 text-blue-700 font-semibold',
  GANANCIA: 'border-amber-200 bg-amber-50 text-amber-700 font-semibold',
};

const SIGNO: Record<string, string> = {
  INYECCION: '+',
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

  const [createForm, setCreateForm] = useState({ nombre: '', familiar: '', capital_inicial: '' });
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
    if (!createForm.nombre || !createForm.familiar || !createForm.capital_inicial) {
      setError('Todos los campos son obligatorios');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await fondoService.create(createForm);
      toast.success('Fondo creado');
      setModal({ type: 'none' });
      setCreateForm({ nombre: '', familiar: '', capital_inicial: '' });
      fetchFondos();
    } catch (err: any) {
      const data = err.response?.data;
      if (data && typeof data === 'object') {
        setError(Object.values(data).flat().map(String).join(' ') || 'Error al crear el fondo');
      } else {
        setError('Error al crear el fondo');
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

  const cerrar = () => {
    setModal({ type: 'none' });
    setError('');
  };

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
          <Button
            icon="add"
            onClick={() => {
              setError('');
              setModal({ type: 'create' });
            }}
          >
            Nuevo Fondo
          </Button>
        }
      />

      {/* Resumen Consolidado Global de Capital */}
      <div class="space-y-3">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiTile
            label="Dinero Disponible"
            value={fmtMonto(saldoDisponible)}
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
            return (
              <Card key={fondo.id} padded={false} class="flex flex-col overflow-hidden border border-slate-200 hover:shadow-md transition-shadow">
                {/* Cabecera de la Bolsa */}
                <div class="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
                  <div class="flex items-center gap-3 min-w-0">
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-label-md">
                      {iniciales(fondo.nombre)}
                    </span>
                    <div class="min-w-0">
                      <h3 class="truncate text-headline-sm font-bold text-slate-900">{fondo.nombre}</h3>
                      <p class="truncate text-body-xs text-slate-500">
                        Titular: <span class="font-medium text-slate-700">{fondo.familiar}</span>
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
                <div class="flex-1 space-y-4 px-5 py-4">
                  {/* Destacado: Dinero Disponible */}
                  <div class="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3.5">
                    <span class="block text-label-xs font-semibold uppercase tracking-wider text-emerald-800">
                      Dinero Disponible (en caja)
                    </span>
                    <p class="tnum mt-1 text-headline-lg font-black text-emerald-700">
                      {fmtMonto(fondo.saldo_disponible)}
                    </p>
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

      {/* Modal: Nuevo Fondo */}
      <Modal
        open={modal.type === 'create'}
        onClose={cerrar}
        title="Nuevo Fondo"
        subtitle="Bolsa de inversión familiar"
        icon="savings"
        footer={
          <>
            <Button variant="ghost" onClick={cerrar} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" form="form-fondo" loading={submitting}>
              Crear Fondo
            </Button>
          </>
        }
      >
        <form id="form-fondo" onSubmit={handleCreate} class="space-y-4">
          <Input
            label="Nombre"
            value={createForm.nombre}
            onInput={(valor) => setCreateForm({ ...createForm, nombre: valor })}
            required
            placeholder="Ej: Fondo Principal"
          />
          <Input
            label="Familiar"
            value={createForm.familiar}
            onInput={(valor) => setCreateForm({ ...createForm, familiar: valor })}
            required
            placeholder="Ej: Familia Morales"
          />
          <Input
            label="Capital inicial"
            value={createForm.capital_inicial}
            onInput={(valor) => setCreateForm({ ...createForm, capital_inicial: valor })}
            type="number"
            step="0.01"
            min="0.01"
            prefix="C$"
            required
            hint="El fondo inicia con este capital disponible en caja."
          />
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
