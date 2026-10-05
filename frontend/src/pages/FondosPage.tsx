import { useState, useEffect, useCallback } from 'preact/hooks';
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
import { fmtMonto, fmtCantidad, fmtPorcentaje, fmtFechaHora } from '../lib/format';
import type { Fondo, MovimientoFondo } from '../types';

const POR_PAGINA = 20;

const ESTILO_MOVIMIENTO: Record<string, string> = {
  INYECCION: 'border-green-200 bg-green-50 text-green-600',
  RETIRO: 'border-orange-200 bg-orange-50 text-orange-700',
  DESEMBOLSO: 'border-blue-200 bg-blue-50 text-blue-700',
  GANANCIA: 'border-amber-200 bg-amber-50 text-amber-700',
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

export function FondosPage() {
  const [fondos, setFondos] = useState<Fondo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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

  const capitalEnCalle = fondos.reduce(
    (total, fondo) => total + (Number(fondo.capital_colocado) || 0),
    0
  );
  const saldoDisponible = fondos.reduce(
    (total, fondo) => total + (Number(fondo.saldo_disponible) || 0),
    0
  );
  const ganancias = fondos.reduce(
    (total, fondo) => total + (Number(fondo.ganancias_acumuladas) || 0),
    0
  );
  const rentabilidad = fondos.length
    ? fondos.reduce((total, fondo) => total + (Number(fondo.rentabilidad) || 0), 0) / fondos.length
    : 0;

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
          class={`tnum font-semibold ${
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
          {mov.descripcion && <p class="truncate text-body-sm text-slate-500">{mov.descripcion}</p>}
        </div>
      ),
    },
  ];

  const fondoActivo = modal.type !== 'none' && 'fondo' in modal ? modal.fondo : null;
  const paginasMovimientos = Math.max(1, Math.ceil(movTotal / POR_PAGINA));

  return (
    <Layout titulo="Fondos">
      <PageHeader
        titulo="Bolsas de Fondo"
        descripcion={`${fmtCantidad(fondos.length)} fondo${fondos.length === 1 ? '' : 's'} familiar${fondos.length === 1 ? '' : 'es'}`}
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

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="En Calle" value={fmtMonto(capitalEnCalle)} icon="point_of_sale" tono="indigo" pie="Capital colocado" />
        <KpiTile label="Disponible" value={fmtMonto(saldoDisponible)} icon="savings" tono="esmeralda" pie="Para desembolsos" />
        <KpiTile label="Ganancias" value={fmtMonto(ganancias)} icon="trending_up" tono="ambar" pie="Acumuladas 50%" />
        <KpiTile label="Rentabilidad" value={fmtPorcentaje(rentabilidad)} icon="query_stats" tono="neutro" pie="Promedio simple" />
      </div>

      <div class="relative mt-4 sm:max-w-md">
        <Icon
          name="search"
          size={20}
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          value={search}
          onInput={(e) => setSearch((e.currentTarget as HTMLInputElement).value)}
          placeholder="Buscar por nombre o familiar"
          aria-label="Buscar fondos"
          class="w-full rounded-full border border-slate-200 bg-white py-2 pl-10 pr-4 text-body-md text-slate-800 outline-none transition-shadow focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
        />
      </div>

      {loading ? (
        <div class="flex justify-center py-16">
          <Spinner size={40} />
        </div>
      ) : fondos.length === 0 ? (
        <EmptyState
          icon="savings"
          title="No se encontraron fondos"
          description="Cree la primera bolsa familiar para empezar a colocar créditos."
        />
      ) : (
        <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {fondos.map((fondo) => (
            <Card key={fondo.id} padded={false} class="flex flex-col overflow-hidden">
              <div class="flex items-start justify-between gap-2 bg-gradient-to-r from-indigo-600 to-indigo-700 px-5 py-4">
                <div class="min-w-0">
                  <h2 class="truncate text-headline-sm text-white">{fondo.nombre}</h2>
                  <p class="truncate text-body-sm text-indigo-200">Familiar: {fondo.familiar}</p>
                </div>
                <span
                  class={`shrink-0 rounded-full px-2.5 py-0.5 text-label-xs uppercase ${
                    fondo.activo ? 'bg-white/20 text-white' : 'bg-slate-900/30 text-slate-200'
                  }`}
                >
                  {fondo.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              <div class="flex-1 space-y-4 px-5 py-4">
                <div>
                  <p class="text-label-sm uppercase text-slate-500">Saldo disponible</p>
                  <p class="tnum text-headline-lg font-extrabold text-slate-900">
                    {fmtMonto(fondo.saldo_disponible)}
                  </p>
                </div>
                <dl class="grid grid-cols-2 gap-3 text-body-sm">
                  <div>
                    <dt class="text-slate-500">Capital inicial</dt>
                    <dd class="tnum font-medium text-slate-900">{fmtMonto(fondo.capital_inicial)}</dd>
                  </div>
                  <div>
                    <dt class="text-slate-500">Capital colocado</dt>
                    <dd class="tnum font-medium text-slate-900">{fmtMonto(fondo.capital_colocado ?? 0)}</dd>
                  </div>
                  <div>
                    <dt class="text-slate-500">Ganancias acumuladas</dt>
                    <dd class="tnum font-medium text-green-600">{fmtMonto(fondo.ganancias_acumuladas)}</dd>
                  </div>
                  <div>
                    <dt class="text-slate-500">Rentabilidad</dt>
                    <dd class="tnum font-medium text-slate-900">{fmtPorcentaje(fondo.rentabilidad ?? 0)}</dd>
                  </div>
                </dl>
              </div>

              <div class="flex items-center gap-2 border-t border-slate-200 px-5 py-3">
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
          ))}
        </div>
      )}

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
          />
          <Input
            label="Familiar"
            value={createForm.familiar}
            onInput={(valor) => setCreateForm({ ...createForm, familiar: valor })}
            required
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
            hint="El fondo inicia con este capital disponible."
          />
          {error && (
            <p class="flex items-start gap-2 text-body-sm text-red-600">
              <Icon name="warning" size={16} class="mt-0.5 shrink-0" />
              {error}
            </p>
          )}
        </form>
      </Modal>

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
            <div class="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <span class="text-body-md text-slate-600">Saldo disponible</span>
              <span class="tnum font-bold text-slate-900">{fmtMonto(fondoActivo.saldo_disponible)}</span>
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
              <p class="flex items-start gap-2 text-body-sm text-red-600">
                <Icon name="warning" size={16} class="mt-0.5 shrink-0" />
                {error}
              </p>
            )}
          </form>
        )}
      </Modal>

      <Modal
        open={modal.type === 'movimientos'}
        onClose={cerrar}
        title="Movimientos"
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
