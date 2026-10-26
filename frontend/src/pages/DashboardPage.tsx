import { useState, useEffect, useMemo } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, KpiTile, Button, Icon, Spinner, EmptyState } from '../components/ui';
import { dashboardService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../lib/router';
import { fmtMonto, fmtCantidad, fmtFecha, iniciales } from '../lib/format';
import type { Dashboard, CarteraFila } from '../types';

type FiltroEstadoCobro = 'TODOS' | 'AL_DIA' | 'EN_GRACIA' | 'EN_MORA';

export function DashboardPage() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'ADMINISTRADOR';
  const { navigate } = useRouter();

  const [datos, setDatos] = useState<Dashboard | null>(null);
  const [carteraFilas, setCarteraFilas] = useState<CarteraFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtros de la lista operativa de cartera
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstadoCobro>('TODOS');
  const [busquedaCliente, setBusquedaCliente] = useState<string>('');

  useEffect(() => {
    let vigente = true;
    setLoading(true);

    Promise.all([
      dashboardService.resumen().catch(() => null),
      dashboardService.agenda().catch(() => null),
    ])
      .then(([resumenData, agendaData]) => {
        if (!vigente) return;
        if (resumenData) {
          setDatos(resumenData);
        }
        // Combinar filas de cartera con prioridad a la agenda completa
        const filas = (agendaData?.filas && agendaData.filas.length > 0)
          ? agendaData.filas
          : (resumenData?.cartera ?? []);
        setCarteraFilas(filas);
        setError('');
      })
      .catch((err: any) => {
        if (vigente) setError(err?.response?.data?.detail || 'No se pudo cargar el centro operativo');
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });

    return () => {
      vigente = false;
    };
  }, []);

  const ACCIONES_ADMIN = [
    { label: 'Registrar Pago', icon: 'payments', color: 'bg-emerald-600', path: '/cobros' },
    { label: 'Nuevo Préstamo', icon: 'post_add', color: 'bg-indigo-600', path: '/prestamos/nuevo' },
    { label: 'Nuevo Cliente', icon: 'person_add', color: 'bg-blue-600', path: '/clientes' },
    { label: 'Arqueo de Caja', icon: 'point_of_sale', color: 'bg-amber-500', path: '/reportes/arqueo' },
  ];

  const ACCIONES_COBRANZA = [
    { label: 'Cobrar en Ruta', icon: 'payments', color: 'bg-emerald-600', path: '/cobros' },
    { label: 'Nuevo Cliente', icon: 'person_add', color: 'bg-blue-600', path: '/clientes' },
    { label: 'Nuevo Préstamo', icon: 'post_add', color: 'bg-indigo-600', path: '/prestamos/nuevo' },
    { label: 'Mi Arqueo del Día', icon: 'point_of_sale', color: 'bg-amber-500', path: '/reportes/arqueo' },
  ];

  const acciones = esAdmin ? ACCIONES_ADMIN : ACCIONES_COBRANZA;

  // Totales de cartera por estado para los bloques y semáforo
  const totalesCartera = useMemo(() => {
    let alDia = 0;
    let enGracia = 0;
    let enMora = 0;
    let montoAlDia = 0;
    let montoGracia = 0;
    let montoMora = 0;
    let saldoTotal = 0;

    for (const f of carteraFilas) {
      const cuotaMonto = Number(f.cuota || 0);
      saldoTotal += Number(f.saldo_deudor || f.saldo_insoluto || 0);
      if (f.estado_efectivo === 'EN_MORA' || f.dias_atraso > (f.dias_gracia || 4)) {
        enMora++;
        montoMora += cuotaMonto;
      } else if (f.estado_efectivo === 'EN_GRACIA' || f.dias_atraso > 0) {
        enGracia++;
        montoGracia += cuotaMonto;
      } else {
        alDia++;
        montoAlDia += cuotaMonto;
      }
    }

    return {
      alDia: datos?.cartera_semaforo?.al_dia ?? alDia,
      enGracia: datos?.cartera_semaforo?.en_gracia ?? enGracia,
      enMora: datos?.cartera_semaforo?.en_mora ?? enMora,
      total: carteraFilas.length || (datos?.creditos_vigentes?.cantidad ?? 0),
      saldoTotal: datos?.creditos_vigentes?.saldo_total ?? String(saldoTotal),
      moraTotal: datos?.cartera_semaforo?.mora_total ?? '0.00',
    };
  }, [carteraFilas, datos]);

  // Lista de cuotas filtradas para la tabla operativa
  const cuotasFiltradas = useMemo(() => {
    let lista = carteraFilas;

    // Filtrado por estado del semáforo
    if (filtroEstado === 'AL_DIA') {
      lista = lista.filter((f) => f.estado_efectivo === 'AL_DIA' && f.dias_atraso <= 0);
    } else if (filtroEstado === 'EN_GRACIA') {
      lista = lista.filter((f) => f.estado_efectivo === 'EN_GRACIA' || (f.dias_atraso > 0 && f.dias_atraso <= (f.dias_gracia || 4)));
    } else if (filtroEstado === 'EN_MORA') {
      lista = lista.filter((f) => f.estado_efectivo === 'EN_MORA' || f.dias_atraso > (f.dias_gracia || 4));
    }

    // Filtrado por búsqueda de cliente
    if (busquedaCliente.trim()) {
      const q = busquedaCliente.toLowerCase().trim();
      lista = lista.filter(
        (f) =>
          f.cliente_nombre?.toLowerCase().includes(q) ||
          String(f.id).includes(q) ||
          f.cliente_telefono?.includes(q)
      );
    }

    // Ordenar: primero mora, luego gracia, luego por fecha más próxima
    return [...lista].sort((a, b) => {
      const pesoEstado = (f: CarteraFila) => {
        if (f.estado_efectivo === 'EN_MORA' || f.dias_atraso > (f.dias_gracia || 4)) return 3;
        if (f.estado_efectivo === 'EN_GRACIA' || f.dias_atraso > 0) return 2;
        return 1;
      };
      const diff = pesoEstado(b) - pesoEstado(a);
      if (diff !== 0) return diff;
      return String(a.cuota_fecha || '').localeCompare(String(b.cuota_fecha || ''));
    });
  }, [carteraFilas, filtroEstado, busquedaCliente]);

  return (
    <Layout titulo="Inicio">
      <PageHeader
        titulo={`Hola, ${user?.nombre_completo.split(' ')[0] || 'Usuario'}`}
        descripcion={`Centro Operativo y Resumen General · ${datos ? fmtFecha(datos.fecha) : 'Gestión de créditos y cobranza'}`}
        actions={
          <Button variant="secondary" icon="sync" onClick={() => location.reload()} loading={loading}>
            Actualizar
          </Button>
        }
      />

      {/* Acciones Rápidas Operativas */}
      <div class="mb-6">
        <h2 class="mb-3 text-label-sm font-semibold uppercase tracking-wider text-slate-500">
          Acciones Rápidas Operativas
        </h2>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {acciones.map((accion) => (
            <button
              key={accion.label}
              onClick={() => navigate(accion.path)}
              class="group flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-95 text-left"
            >
              <div
                class={`flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-inner transition-transform group-hover:scale-105 ${accion.color}`}
              >
                <Icon name={accion.icon} size={22} />
              </div>
              <span class="text-center text-body-sm font-semibold text-slate-700 group-hover:text-slate-900">
                {accion.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div class="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-body-sm text-red-700">
          <Icon name="warning" size={18} />
          {error}
        </div>
      )}

      {loading && !datos ? (
        <div class="flex justify-center py-16">
          <Spinner size={40} />
        </div>
      ) : datos ? (
        <div class="space-y-6">
          {/* ALERTA OPERATIVA INMEDIATA: RECIBOS ANULADOS EN LAS ÚLTIMAS 24 HORAS */}
          {esAdmin && datos.alertas_anulaciones && datos.alertas_anulaciones.length > 0 && (
            <div class="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 shadow-sm">
              <div class="flex items-start gap-3">
                <div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-sm">
                  <Icon name="warning" size={20} />
                </div>
                <div class="flex-1">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <h3 class="text-body-md font-bold text-rose-950">
                      Alerta Operativa: Recibos Cancelados Recientemente ({datos.alertas_anulaciones.length})
                    </h3>
                    <button
                      onClick={() => navigate('/auditoria')}
                      class="text-xs font-semibold text-rose-700 hover:text-rose-900 underline flex items-center gap-1"
                    >
                      Ver en Auditoría <Icon name="arrow_forward" size={14} />
                    </button>
                  </div>
                  <p class="mt-1 text-body-sm text-rose-800">
                    Se registraron anulaciones de comprobantes en las últimas 24 horas que revirtieron dinero en cartera:
                  </p>
                  <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {datos.alertas_anulaciones.map((alerta) => (
                      <div key={alerta.id} class="rounded-xl border border-rose-200 bg-white p-3 shadow-xs">
                        <div class="flex items-center justify-between">
                          <span class="font-mono font-bold text-slate-900 text-xs">{alerta.codigo}</span>
                          <span class="font-bold text-rose-700 text-xs">{fmtMonto(alerta.monto)}</span>
                        </div>
                        <p class="text-xs text-slate-600 truncate mt-0.5">Cliente: {alerta.cliente}</p>
                        <p class="text-xs text-rose-900 italic font-medium truncate mt-0.5">"{alerta.motivo}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* BLOQUES DE DATOS GENERALES Y OPERACIÓN DE HOY */}
          <div>
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-label-sm font-semibold uppercase tracking-wider text-slate-500">
                Operación y Cobros de Hoy
              </h2>
              {esAdmin ? (
                <span class="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 border border-purple-200">
                  <Icon name="shield" size={12} />
                  Panel Administrador
                </span>
              ) : (
                <span class="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                  <Icon name="assignment_ind" size={12} />
                  Cobranza
                </span>
              )}
            </div>

            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {/* 1. Clientes Activos */}
              <KpiTile
                label="Clientes Activos"
                value={fmtCantidad(datos.clientes_activos || 0)}
                icon="people"
                tono="indigo"
                pie="Padrón activo registrado"
                onClick={() => navigate('/clientes')}
              />

              {/* 2. Créditos Activos */}
              <KpiTile
                label="Créditos Activos"
                value={fmtCantidad(datos.creditos_vigentes?.cantidad ?? totalesCartera.total)}
                icon="credit_card"
                tono="indigo"
                pie="Préstamos en cartera"
                onClick={() => navigate('/cobros')}
              />

              {/* 3. Saldo en Cartera (Capital Colocado) */}
              <KpiTile
                label="Saldo en Cartera"
                value={fmtMonto(datos.creditos_vigentes?.saldo_total || totalesCartera.saldoTotal)}
                icon="account_balance"
                tono="esmeralda"
                pie="Capital colocado en calle"
              />

              {/* 4. Recaudación de Hoy */}
              <KpiTile
                label="Recaudación Hoy"
                value={fmtMonto(datos.abonos_del_dia?.monto || '0.00')}
                icon="payments"
                tono="esmeralda"
                pie={`${fmtCantidad(datos.abonos_del_dia?.cantidad || 0)} recibos cobrados`}
                onClick={() => navigate('/cobros')}
              />
            </div>
          </div>

          {/* SEMÁFORO Y ESTADO OPERATIVO DE CARTERA */}
          <div>
            <h2 class="mb-3 text-label-sm font-semibold uppercase tracking-wider text-slate-500">
              Estado de Cobro de Cartera
            </h2>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                type="button"
                onClick={() => setFiltroEstado('TODOS')}
                class={`flex items-center justify-between rounded-xl p-3.5 border text-left transition-all ${
                  filtroEstado === 'TODOS'
                    ? 'border-slate-800 bg-slate-900 text-white shadow-sm ring-1 ring-slate-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-xs'
                }`}
              >
                <div>
                  <span class="block text-label-xs font-bold uppercase tracking-wider opacity-80">
                    Todos los Créditos
                  </span>
                  <span class="text-body-lg font-black">{totalesCartera.total}</span>
                </div>
                <Icon name="receipt_long" size={22} class="opacity-80" />
              </button>

              <button
                type="button"
                onClick={() => setFiltroEstado('AL_DIA')}
                class={`flex items-center justify-between rounded-xl p-3.5 border text-left transition-all ${
                  filtroEstado === 'AL_DIA'
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-600'
                    : 'border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/70 shadow-xs'
                }`}
              >
                <div>
                  <span class="block text-label-xs font-bold uppercase tracking-wider opacity-80">
                    En Fecha (Al Día)
                  </span>
                  <span class="text-body-lg font-black">{totalesCartera.alDia}</span>
                </div>
                <Icon name="task_alt" size={22} class="opacity-80" />
              </button>

              <button
                type="button"
                onClick={() => setFiltroEstado('EN_GRACIA')}
                class={`flex items-center justify-between rounded-xl p-3.5 border text-left transition-all ${
                  filtroEstado === 'EN_GRACIA'
                    ? 'border-amber-600 bg-amber-600 text-white shadow-sm ring-1 ring-amber-600'
                    : 'border-amber-200 bg-amber-50/70 text-amber-800 hover:bg-amber-100/70 shadow-xs'
                }`}
              >
                <div>
                  <span class="block text-label-xs font-bold uppercase tracking-wider opacity-80">
                    Límites de Día (Gracia)
                  </span>
                  <span class="text-body-lg font-black">{totalesCartera.enGracia}</span>
                </div>
                <Icon name="schedule" size={22} class="opacity-80" />
              </button>

              <button
                type="button"
                onClick={() => setFiltroEstado('EN_MORA')}
                class={`flex items-center justify-between rounded-xl p-3.5 border text-left transition-all ${
                  filtroEstado === 'EN_MORA'
                    ? 'border-rose-600 bg-rose-600 text-white shadow-sm ring-1 ring-rose-600'
                    : 'border-rose-200 bg-rose-50/70 text-rose-800 hover:bg-rose-100/70 shadow-xs'
                }`}
              >
                <div>
                  <span class="block text-label-xs font-bold uppercase tracking-wider opacity-80">
                    En Mora (Vencidos)
                  </span>
                  <span class="text-body-lg font-black">{totalesCartera.enMora}</span>
                </div>
                <Icon name="warning" size={22} class="opacity-80" />
              </button>
            </div>
          </div>

          {/* TABLA PRINCIPAL DE AGENDA Y COBROS PENDIENTES */}
          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Icon name="format_list_bulleted" size={22} />
                </div>
                <div>
                  <h3 class="text-body-md font-bold text-slate-900">
                    Agenda y Cartera de Cobros
                  </h3>
                  <p class="text-body-sm text-slate-500">
                    Créditos activos organizados por prioridad de vencimiento y semáforo
                  </p>
                </div>
              </div>

              {/* Buscador de clientes */}
              <div class="relative w-full sm:w-72">
                <Icon
                  name="search"
                  size={16}
                  class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={busquedaCliente}
                  onInput={(e) => setBusquedaCliente((e.currentTarget as HTMLInputElement).value)}
                  placeholder="Buscar por cliente, cédula o teléfono..."
                  class="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-7 text-xs text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-green-600 focus:bg-white focus:ring-1 focus:ring-green-600"
                />
                {busquedaCliente && (
                  <button
                    type="button"
                    onClick={() => setBusquedaCliente('')}
                    class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Listado de cuotas y créditos exigibles */}
            {cuotasFiltradas.length === 0 ? (
              <div class="py-10">
                <EmptyState
                  icon="task_alt"
                  title="No hay créditos con el filtro seleccionado"
                  description="No se registran compromisos de pago pendientes para este criterio de búsqueda."
                  action={
                    filtroEstado !== 'TODOS' || busquedaCliente ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setFiltroEstado('TODOS');
                          setBusquedaCliente('');
                        }}
                      >
                        Ver todos los créditos
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div class="overflow-x-auto rounded-xl border border-slate-200">
                <table class="w-full text-left border-collapse text-body-sm">
                  <thead>
                    <tr class="border-b border-slate-200 bg-slate-50/80 text-label-xs font-bold uppercase tracking-wider text-slate-500">
                      <th class="py-2.5 px-3">Cliente / Prestatario</th>
                      <th class="py-2.5 px-3">Fecha de Cuota</th>
                      <th class="py-2.5 px-3">Semáforo de Cobro</th>
                      <th class="py-2.5 px-3 text-right">Cuota Exigible</th>
                      <th class="py-2.5 px-3 text-right">Saldo Deudor</th>
                      <th class="py-2.5 px-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    {cuotasFiltradas.map((f) => {
                      const inits = iniciales(f.cliente_nombre);
                      const esMora = f.estado_efectivo === 'EN_MORA' || f.dias_atraso > (f.dias_gracia || 4);
                      const esGracia = f.estado_efectivo === 'EN_GRACIA' || (f.dias_atraso > 0 && !esMora);

                      return (
                        <tr key={f.id} class="hover:bg-slate-50/80 transition-colors group">
                          {/* Cliente */}
                          <td class="py-2.5 px-3">
                            <div class="flex items-center gap-2.5">
                              <div
                                class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs ${
                                  esMora ? 'bg-rose-600' : esGracia ? 'bg-amber-600' : 'bg-slate-800'
                                }`}
                              >
                                {inits}
                              </div>
                              <div>
                                <span class="font-bold text-slate-900 group-hover:text-green-700 transition-colors block">
                                  {f.cliente_nombre}
                                </span>
                                <div class="flex items-center gap-2 text-[11px] text-slate-400">
                                  <span>Préstamo #{f.id}</span>
                                  {f.cuota_periodo && (
                                    <span>· Cuota {f.cuota_periodo} de {f.total_periodos}</span>
                                  )}
                                  {f.cliente_telefono && (
                                    <span>· Tel: {f.cliente_telefono}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Fecha de Cuota */}
                          <td class="py-2.5 px-3">
                            <span class="font-mono text-xs font-bold text-slate-800 block">
                              {f.cuota_fecha ? fmtFecha(f.cuota_fecha) : 'Sin corte'}
                            </span>
                            {f.dias_atraso > 0 && (
                              <span class="text-[10px] text-rose-600 font-semibold block">
                                {f.dias_atraso} día(s) de atraso
                              </span>
                            )}
                          </td>

                          {/* Semáforo de Cobro */}
                          <td class="py-2.5 px-3">
                            {esMora ? (
                              <span class="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
                                <span class="h-1.5 w-1.5 rounded-full bg-rose-600" />
                                En Mora ({f.dias_mora}d mora · C${fmtMonto(f.mora_pendiente)})
                              </span>
                            ) : esGracia ? (
                              <span class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                                <span class="h-1.5 w-1.5 rounded-full bg-amber-600" />
                                Límite de Día ({f.dias_atraso}d en gracia)
                              </span>
                            ) : (
                              <span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                                <span class="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                                Al Día (En Fecha)
                              </span>
                            )}
                          </td>

                          {/* Cuota Exigible */}
                          <td class="py-2.5 px-3 text-right">
                            <span class="font-bold text-slate-900 block tnum">
                              {fmtMonto(f.cuota)}
                            </span>
                            {Number(f.interes_vencido) > 0 && (
                              <span class="text-[10px] text-slate-500 block">
                                Int. vencido: {fmtMonto(f.interes_vencido)}
                              </span>
                            )}
                          </td>

                          {/* Saldo Deudor */}
                          <td class="py-2.5 px-3 text-right">
                            <span class="font-medium text-slate-700 block tnum">
                              {fmtMonto(f.saldo_deudor)}
                            </span>
                          </td>

                          {/* Acciones */}
                          <td class="py-2.5 px-3 text-right">
                            <div class="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                icon="visibility"
                                onClick={() => navigate(`/clientes?search=${encodeURIComponent(f.cliente_nombre)}`)}
                                title="Ver expediente del cliente"
                              >
                                Ficha
                              </Button>

                              <Button
                                size="sm"
                                variant={esMora ? 'primary' : 'secondary'}
                                icon="payments"
                                onClick={() => navigate('/cobros')}
                                title="Asentar pago en la terminal de cobranza"
                              >
                                Cobrar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Tarjeta de Acceso a la Jornada de Cobro */}
          <Card class="flex flex-col items-center justify-between gap-4 p-5 sm:flex-row border border-slate-200">
            <div class="flex items-center gap-4">
              <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                <Icon name="credit_card" size={26} />
              </div>
              <div>
                <h3 class="text-body-md font-bold text-slate-900">Terminal de Abonos y Cobranza</h3>
                <p class="text-body-sm text-slate-500">
                  Consulte clientes con cuotas en fecha vs. pasados, busque prestatarios y registre pagos en efectivo o transferencia.
                </p>
              </div>
            </div>
            <Button iconRight="arrow_forward" onClick={() => navigate('/cobros')}>
              Abrir Cobranza
            </Button>
          </Card>
        </div>
      ) : (
        <div class="mt-4">
          <EmptyState
            icon="task_alt"
            title="¡Todo listo para hoy!"
            description="Usa las acciones rápidas arriba para registrar los abonos o consultar la cartera de clientes."
          />
        </div>
      )}
    </Layout>
  );
}
