import { useState, useEffect } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, KpiTile, Button, Icon, Spinner, EmptyState, StatusBadge } from '../components/ui';
import { dashboardService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fmtMonto, fmtCantidad, fmtPorcentaje, fmtNumero, fmtFecha, iniciales, normalizar } from '../lib/format';
import type { Dashboard, CarteraFila } from '../types';
import { DIAS_GRACIA } from '../lib/estadoPrestamo';

type FiltroCartera = 'TODOS' | 'EN_MORA' | 'EN_GRACIA' | 'AL_DIA';

const FILTROS: { valor: FiltroCartera; label: string }[] = [
  { valor: 'TODOS', label: 'Todos' },
  { valor: 'EN_MORA', label: 'En Mora' },
  { valor: 'EN_GRACIA', label: 'En Gracia' },
  { valor: 'AL_DIA', label: 'Al Dia' },
];

const SEMAFORO_TONO = {
  al_dia: 'bg-emerald-500',
  en_gracia: 'bg-amber-400',
  en_mora: 'bg-red-500',
} as const;

function semaforoTotal(semaforo?: Dashboard['cartera_semaforo']): number {
  if (!semaforo) return 0;
  return semaforo.al_dia + semaforo.en_gracia + semaforo.en_mora;
}

/** Fila de cartera como tarjeta: en movil se lee mejor que una tabla. */
function CarteraCard({ fila }: { fila: CarteraFila }) {
  const mora = Number(fila.mora_pendiente || 0);
  const interes = Number(fila.interes_vencido || 0);
  return (
    <li class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex items-start gap-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-label-md font-bold text-slate-600">
          {iniciales(fila.cliente_nombre)}
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-body-md font-semibold text-slate-900">{fila.cliente_nombre}</p>
          <p class="truncate text-body-sm text-slate-500">
            {fila.cliente_telefono || 'Sin telefono'} · {fila.cliente_direccion || 'Sin direccion'}
          </p>
        </div>
        <StatusBadge estado={fila.estado} diasAtraso={fila.dias_atraso} />
      </div>
      <dl class="mt-3 grid grid-cols-2 gap-2 text-body-sm sm:grid-cols-4">
        <div>
          <dt class="text-slate-500">Deuda</dt>
          <dd class="tnum font-semibold text-slate-900">{fmtMonto(fila.saldo_deudor)}</dd>
        </div>
        <div>
          <dt class="text-slate-500">Cuota</dt>
          <dd class="tnum font-semibold text-slate-900">{fmtMonto(fila.cuota)}</dd>
        </div>
        <div>
          <dt class="text-slate-500">Vence</dt>
          <dd class="tnum text-slate-700">{fmtFecha(fila.cuota_fecha)}</dd>
        </div>
        <div>
          <dt class="text-slate-500">Periodo</dt>
          <dd class="tnum text-slate-700">
            {fila.cuota_periodo ?? '-'} / {fila.total_periodos}
          </dd>
        </div>
      </dl>
      {(mora > 0 || interes > 0) && (
        <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-body-sm">
          {mora > 0 && (
            <span class="tnum inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-label-xs font-medium text-red-700">
              Mora {fmtMonto(fila.mora_pendiente)} · {fila.dias_mora} dias
            </span>
          )}
          {interes > 0 && (
            <span class="tnum inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-label-xs font-medium text-amber-700">
              Interes vencido {fmtMonto(fila.interes_vencido)}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'ADMINISTRADOR';

  const [datos, setDatos] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroCartera>('TODOS');

  useEffect(() => {
    if (!esAdmin) {
      setLoading(false);
      return;
    }
    let vigente = true;
    setLoading(true);
    dashboardService
      .resumen()
      .then((data) => {
        if (vigente) {
          setDatos(data);
          setError('');
        }
      })
      .catch((err: any) => {
        if (vigente) setError(err?.response?.data?.detail || 'No se pudo cargar el panel de control');
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [esAdmin]);

  if (!esAdmin) {
    return (
      <Layout titulo="Panel de Control">
        <EmptyState
          icon="lock"
          title="Acceso restringido"
          description="El panel de control es exclusivo de administracion. Tu ruta de cobranza esta en Cobranza."
        />
      </Layout>
    );
  }

  const cartera = (datos?.cartera ?? []).filter((fila) => {
    if (filtro !== 'TODOS' && fila.estado_efectivo !== filtro) return false;
    if (!busqueda.trim()) return true;
    const texto = normalizar(`${fila.cliente_nombre} ${fila.cliente_direccion}`);
    return texto.includes(normalizar(busqueda));
  });

  return (
    <Layout titulo="Panel de Control">
      <PageHeader
        titulo="Panel de Control"
        descripcion={
          datos
            ? `Resumen financiero y cartera al ${fmtFecha(datos.fecha)}`
            : 'Resumen financiero y cartera vigente'
        }
        actions={
          <Button variant="secondary" icon="sync" onClick={() => location.reload()} loading={loading}>
            Actualizar
          </Button>
        }
      />

      {error && (
        <div class="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-body-md text-red-700">
          <Icon name="warning" size={20} />
          {error}
        </div>
      )}

      {loading && !datos ? (
        <div class="flex justify-center py-16">
          <Spinner size={40} />
        </div>
      ) : (
        <>
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile
              label="Clientes Activos"
              value={fmtCantidad(datos?.clientes_activos)}
              icon="groups"
              tono="ambar"
            />
            <KpiTile
              label="Bolsas de Fondo"
              value={fmtCantidad(datos?.bolsas.cantidad)}
              icon="savings"
              tono="indigo"
              pie={`${fmtMonto(datos?.bolsas.capital_en_calle)} en calle`}
            />
            <KpiTile
              label="Creditos Vigentes"
              value={fmtCantidad(datos?.creditos_vigentes.cantidad)}
              icon="account_balance_wallet"
              tono="esmeralda"
              pie={`${fmtPorcentaje(datos?.creditos_vigentes.porcentaje_sano, 0)} sano`}
            />
            <KpiTile
              label="Abonos del Dia"
              value={fmtMonto(datos?.abonos_del_dia.monto)}
              icon="payments"
              tono="neutro"
              pie={`${fmtCantidad(datos?.abonos_del_dia.cantidad)} recibos`}
            />
          </div>

          <div class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Cartera Total', valor: fmtMonto(datos?.creditos_vigentes.saldo_total), icono: 'query_stats' as const },
              { label: 'Al Dia', valor: fmtCantidad(datos?.creditos_vigentes.al_dia), icono: 'task_alt' as const },
              { label: 'En Gracia', valor: fmtCantidad(datos?.creditos_vigentes.en_gracia), icono: 'schedule' as const },
              { label: 'En Mora', valor: fmtCantidad(datos?.creditos_vigentes.en_mora), icono: 'priority_high' as const },
            ].map((item) => (
              <Card key={item.label} class="flex items-center gap-3">
                <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <Icon name={item.icono} size={22} />
                </span>
                <div class="min-w-0">
                  <p class="text-label-sm uppercase text-slate-500">{item.label}</p>
                  <p class="tnum truncate text-headline-sm font-bold text-slate-900">{item.valor}</p>
                </div>
              </Card>
            ))}
          </div>

          <Card class="mt-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-label-sm uppercase text-slate-500">Semaforo de cobranza</p>
                <p class="tnum text-headline-sm font-bold text-slate-900">
                  {fmtPorcentaje(datos?.creditos_vigentes.porcentaje_sano, 1)} de la cartera esta al dia
                </p>
              </div>
              <div class="flex flex-wrap gap-2 text-label-sm">
                <span class="tnum rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                  {fmtCantidad(datos?.cartera_semaforo?.al_dia)} al dia
                </span>
                <span class="tnum rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                  {fmtCantidad(datos?.cartera_semaforo?.en_gracia)} en gracia (
                  {datos?.cartera_semaforo?.dias_gracia ?? DIAS_GRACIA} dias)
                </span>
                <span class="tnum rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">
                  {fmtCantidad(datos?.cartera_semaforo?.en_mora)} en mora
                </span>
              </div>
            </div>
            <div class="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100">
              {(['al_dia', 'en_gracia', 'en_mora'] as const).map((clave) => {
                const total = semaforoTotal(datos?.cartera_semaforo);
                const valor = datos?.cartera_semaforo?.[clave] ?? 0;
                const porcentaje = total > 0 ? (valor / total) * 100 : 0;
                return (
                  <span
                    key={clave}
                    class={SEMAFORO_TONO[clave]}
                    style={{ width: `${porcentaje}%` }}
                    aria-hidden="true"
                  />
                );
              })}
            </div>
            <dl class="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 text-body-sm sm:grid-cols-3">
              <div>
                <dt class="text-slate-500">Saldo en mora</dt>
                <dd class="tnum font-semibold text-red-700">
                  {fmtMonto(datos?.cartera_semaforo?.saldo_en_mora)}
                </dd>
              </div>
              <div>
                <dt class="text-slate-500">Mora por recuperar</dt>
                <dd class="tnum font-semibold text-red-700">
                  {fmtMonto(datos?.cartera_semaforo?.mora_total)}
                </dd>
              </div>
              <div>
                <dt class="text-slate-500">Interes vencido</dt>
                <dd class="tnum font-semibold text-amber-700">
                  {fmtMonto(datos?.creditos_vigentes.interes_vencido_total)}
                </dd>
              </div>
            </dl>
          </Card>

          <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex flex-wrap gap-2">
              {FILTROS.map((item) => (
                <button
                  key={item.valor}
                  type="button"
                  onClick={() => setFiltro(item.valor)}
                  class={`rounded-full border px-3 py-1.5 text-label-md font-medium transition-colors ${
                    filtro === item.valor
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div class="relative sm:w-72">
              <Icon
                name="search"
                size={20}
                class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={busqueda}
                onInput={(e) => setBusqueda((e.target as HTMLInputElement).value)}
                placeholder="Buscar por nombre o direccion"
                aria-label="Buscar en cartera"
                class="w-full rounded-full border border-slate-200 bg-white py-2 pl-10 pr-4 text-body-md text-slate-800 outline-none transition-shadow focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
          </div>

          <div class="mt-4">
            {cartera.length === 0 ? (
              <EmptyState
                icon="point_of_sale"
                title="Sin creditos en este filtro"
                description="Ajusta el filtro o la busqueda para ver otros creditos de la cartera."
              />
            ) : (
              <>
                <ul class="grid gap-3 md:hidden">
                  {cartera.map((fila) => (
                    <CarteraCard key={fila.id} fila={fila} />
                  ))}
                </ul>
                <div class="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card md:block">
                  <table class="w-full text-left text-body-md">
                    <thead class="border-b border-slate-200 bg-slate-50 text-label-sm uppercase text-slate-500">
                      <tr>
                        <th scope="col" class="px-4 py-3 font-semibold">Cliente</th>
                        <th scope="col" class="px-4 py-3 font-semibold">Estado</th>
                        <th scope="col" class="px-4 py-3 text-right font-semibold">Deuda</th>
                        <th scope="col" class="px-4 py-3 text-right font-semibold">Mora</th>
                        <th scope="col" class="px-4 py-3 text-right font-semibold">Cuota</th>
                        <th scope="col" class="px-4 py-3 font-semibold">Vence</th>
                        <th scope="col" class="px-4 py-3 font-semibold">Periodo</th>
                        <th scope="col" class="px-4 py-3 font-semibold">Bolsas (Pi)</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                      {cartera.map((fila) => (
                        <tr key={fila.id} class="transition-colors hover:bg-slate-50">
                          <td class="px-4 py-3">
                            <p class="font-semibold text-slate-900">{fila.cliente_nombre}</p>
                            <p class="text-body-sm text-slate-500">{fila.cliente_direccion || 'Sin direccion'}</p>
                          </td>
                          <td class="px-4 py-3">
                            <StatusBadge estado={fila.estado} diasAtraso={fila.dias_atraso} />
                          </td>
                          <td class="tnum px-4 py-3 text-right font-semibold text-slate-900">
                            {fmtMonto(fila.saldo_deudor)}
                          </td>
                          <td class="tnum px-4 py-3 text-right">
                            {Number(fila.mora_pendiente) > 0 ? (
                              <>
                                <span class="font-semibold text-red-700">
                                  {fmtMonto(fila.mora_pendiente)}
                                </span>
                                <span class="block text-body-sm text-slate-500">
                                  {fila.dias_mora} dias
                                </span>
                              </>
                            ) : (
                              <span class="text-slate-400">-</span>
                            )}
                          </td>
                          <td class="tnum px-4 py-3 text-right text-slate-700">{fmtMonto(fila.cuota)}</td>
                          <td class="tnum px-4 py-3 text-slate-700">{fmtFecha(fila.cuota_fecha)}</td>
                          <td class="tnum px-4 py-3 text-slate-700">
                            {fila.cuota_periodo ?? '-'} / {fila.total_periodos}
                          </td>
                          <td class="px-4 py-3 text-body-sm text-slate-600">
                            {fila.bolsas.length === 0
                              ? '-'
                              : fila.bolsas
                                  .map((bolsa) => `${bolsa.nombre} (${fmtNumero(bolsa.porcentaje_pi)}%)`)
                                  .join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p class="mt-2 text-body-sm text-slate-500">
                  {fmtCantidad(cartera.length)} de {fmtCantidad(datos?.creditos_vigentes.cantidad)} creditos
                  · capital en calle {fmtMonto(datos?.bolsas.capital_en_calle)}
                </p>
              </>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
