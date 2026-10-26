import { useState, useEffect, useCallback } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { KpiTile, Button, Icon, Modal, Spinner, EmptyState, useToast } from '../components/ui';
import { auditoriaService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fmtMonto, fmtCantidad } from '../lib/format';
import type { BitacoraActividad, AuditoriaResumen } from '../types';

type RangoFecha = 'HOY' | 'SEMANA' | 'MES' | 'TODO';
type SeveridadFiltro = 'TODAS' | 'CRITICO' | 'ADVERTENCIA' | 'INFORMATIVO';
type ModuloFiltro = 'TODOS' | 'COBRANZA' | 'CLIENTES' | 'SEGURIDAD' | 'FONDOS' | 'CAJA' | 'PRESTAMOS' | 'SISTEMA';

export function AuditoriaPage() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'ADMINISTRADOR';
  const toast = useToast();

  const [resumen, setResumen] = useState<AuditoriaResumen | null>(null);
  const [eventos, setEventos] = useState<BitacoraActividad[]>([]);
  const [totalRegistros, setTotalRegistros] = useState<number>(0);
  const [pagina, setPagina] = useState<number>(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [rangoFecha, setRangoFecha] = useState<RangoFecha>('MES');
  const [severidad, setSeveridad] = useState<SeveridadFiltro>('TODAS');
  const [modulo, setModulo] = useState<ModuloFiltro>('TODOS');
  const [busqueda, setBusqueda] = useState('');

  // Modal Detalle Forense / Diff
  const [eventoSeleccionado, setEventoSeleccionado] = useState<BitacoraActividad | null>(null);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const toLocalISODate = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      const hoy = new Date();
      let fechaDesde: string | undefined = undefined;

      if (rangoFecha === 'HOY') {
        fechaDesde = toLocalISODate(hoy);
      } else if (rangoFecha === 'SEMANA') {
        const hace7Dias = new Date();
        hace7Dias.setDate(hoy.getDate() - 7);
        fechaDesde = toLocalISODate(hace7Dias);
      } else if (rangoFecha === 'MES') {
        const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        fechaDesde = toLocalISODate(primerDiaMes);
      }

      const params: any = { page: pagina };
      if (fechaDesde) params.fecha_desde = fechaDesde;
      if (severidad !== 'TODAS') params.severidad = severidad;
      if (modulo !== 'TODOS') params.modulo = modulo;
      if (busqueda.trim()) params.search = busqueda.trim();

      const [resumenData, listaEventos] = await Promise.all([
        auditoriaService.resumen().catch(() => null),
        auditoriaService.list(params).catch(() => ({ results: [], count: 0 })),
      ]);

      setResumen(resumenData);

      const rawList = listaEventos as any;
      const eventosExtraidos: BitacoraActividad[] = Array.isArray(rawList)
        ? rawList
        : Array.isArray(rawList?.results)
        ? rawList.results
        : [];
      const total = typeof rawList?.count === 'number' ? rawList.count : eventosExtraidos.length;

      setTotalRegistros(total);
      setEventos(eventosExtraidos);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Error al cargar la bitácora de auditoría.';
      setError(msg);
      toast.error(msg);
    } finally {
      setCargando(false);
    }
  }, [rangoFecha, severidad, modulo, busqueda, pagina]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Exportar vista actual a CSV legal
  const exportarCSV = () => {
    if (!eventos.length) {
      toast.info('No hay registros de auditoría para exportar.');
      return;
    }
    const encabezados = ['ID', 'Fecha Hora', 'Modulo', 'Codigo Evento', 'Severidad', 'Usuario', 'Rol', 'Referencia', 'Observaciones', 'IP'];
    const filas = eventos.map(ev => [
      ev.id,
      ev.creado_en,
      ev.modulo,
      ev.codigo_evento,
      ev.nivel_severidad,
      `"${ev.usuario_nombre || 'Sistema'}"`,
      ev.usuario_rol || 'N/A',
      `"${ev.codigo_comprobante || ev.cliente_nombre || ''}"`,
      `"${(ev.observaciones || '').replace(/"/g, '""')}"`,
      ev.direccion_ip || ''
    ]);

    const contenido = [encabezados.join(','), ...filas.map(f => f.join(','))].join('\n');
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `CAVI_Auditoria_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Bitácora de auditoría exportada exitosamente en formato CSV.');
  };

  const badgeSeveridad = (sev: string) => {
    switch (sev) {
      case 'CRITICO':
        return (
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <span class="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse"></span>
            Crítico
          </span>
        );
      case 'ADVERTENCIA':
        return (
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <span class="h-1.5 w-1.5 rounded-full bg-amber-600"></span>
            Advertencia
          </span>
        );
      default:
        return (
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            Informativo
          </span>
        );
    }
  };

  return (
    <Layout titulo="Auditoría">
      <div class="space-y-6">
        {/* Encabezado */}
        <PageHeader
          titulo="Auditoría"
          actions={
            <div class="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={cargarDatos} disabled={cargando}>
                <Icon name="refresh" class={cargando ? 'animate-spin' : ''} />
                Actualizar
              </Button>
              {esAdmin && (
                <Button variant="secondary" size="sm" onClick={exportarCSV} disabled={!eventos.length}>
                  <Icon name="download" />
                  Exportar CSV
                </Button>
              )}
            </div>
          }
        />

        {/* Alerta de Recibos Anulados en las últimas 24 horas */}
        {esAdmin && resumen?.alertas_anulaciones_recientes && resumen.alertas_anulaciones_recientes.length > 0 && (
          <div class="rounded-xl border border-rose-200 bg-rose-50/80 p-4 shadow-sm">
            <div class="flex items-start gap-3">
              <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-600 text-white shadow-sm">
                <Icon name="warning" class="text-lg" />
              </div>
              <div class="flex-1">
                <div class="flex items-center justify-between">
                  <h3 class="text-title-sm font-bold text-rose-950">
                    Alerta Operativa: Recibos Cancelados Recientes ({resumen.alertas_anulaciones_recientes.length})
                  </h3>
                  <span class="text-caption font-semibold text-rose-700 uppercase tracking-wider">Últimas 24 horas</span>
                </div>
                <p class="mt-1 text-body-sm text-rose-800">
                  Se registraron reversiones de cobro en cartera. Verifique que correspondan a cancelaciones legítimas y autorizadas:
                </p>
                <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {resumen.alertas_anulaciones_recientes.map((alerta) => (
                    <div key={alerta.id} class="rounded-lg border border-rose-200/90 bg-white p-3 shadow-xs">
                      <div class="flex items-center justify-between">
                        <span class="tnum font-bold text-slate-900 text-body-sm">{alerta.codigo}</span>
                        <span class="tnum font-bold text-rose-700 text-body-sm">{fmtMonto(alerta.monto)}</span>
                      </div>
                      <p class="mt-1 text-caption text-slate-600 truncate">
                        <span class="font-medium">Cliente:</span> {alerta.cliente}
                      </p>
                      <p class="text-caption text-slate-500 truncate">
                        <span class="font-medium">Por:</span> {alerta.anulado_por}
                      </p>
                      <p class="mt-1 text-caption text-rose-900 font-medium italic truncate">
                        "{alerta.motivo}"
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tarjetas Métricas Superiores */}
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiTile
            label={esAdmin ? "Eventos del Mes" : "Mis Registros (Mes)"}
            value={fmtCantidad(resumen?.total_eventos_mes ?? 0)}
            icon="history"
            tono="indigo"
            pie={`Hoy: ${resumen?.total_eventos_hoy ?? 0} registros`}
          />
          <KpiTile
            label="Acciones Críticas"
            value={fmtCantidad(resumen?.total_criticos_mes ?? 0)}
            icon="priority_high"
            tono={resumen?.total_criticos_mes ? "rosa" : "neutro"}
            pie="Reversiones y cambios mayores"
          />
          <KpiTile
            label="Recibos Anulados"
            value={fmtCantidad(resumen?.recibos_anulados_mes ?? 0)}
            icon="receipt_long"
            tono={resumen?.recibos_anulados_mes ? "rosa" : "neutro"}
            pie={`Total revertido: ${fmtMonto(resumen?.monto_anulado_mes ?? 0)}`}
          />
          <KpiTile
            label={esAdmin ? "Clientes Auditados" : "Advertencias"}
            value={fmtCantidad(esAdmin ? (resumen?.clientes_modificados_mes ?? 0) : (resumen?.total_advertencias_mes ?? 0))}
            icon={esAdmin ? "groups" : "warning"}
            tono={esAdmin ? "esmeralda" : "ambar"}
            pie={esAdmin ? "Expedientes actualizados" : "Eventos con aviso"}
          />
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div class="flex flex-wrap items-center gap-2">
              <select
                value={rangoFecha}
                onChange={(e) => {
                  setRangoFecha((e.currentTarget as HTMLSelectElement).value as RangoFecha);
                  setPagina(1);
                }}
                class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-900/10"
              >
                <option value="HOY">Hoy</option>
                <option value="SEMANA">Últimos 7 días</option>
                <option value="MES">Este Mes</option>
                <option value="TODO">Histórico Total</option>
              </select>

              <select
                value={severidad}
                onChange={(e) => {
                  setSeveridad((e.currentTarget as HTMLSelectElement).value as SeveridadFiltro);
                  setPagina(1);
                }}
                class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-900/10"
              >
                <option value="TODAS">Toda Severidad</option>
                <option value="CRITICO">Solo Críticos</option>
                <option value="ADVERTENCIA">Solo Advertencias</option>
                <option value="INFORMATIVO">Solo Informativos</option>
              </select>

              {esAdmin && (
                <select
                  value={modulo}
                  onChange={(e) => {
                    setModulo((e.currentTarget as HTMLSelectElement).value as ModuloFiltro);
                    setPagina(1);
                  }}
                  class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-900/10"
                >
                  <option value="TODOS">Todos los Módulos</option>
                  <option value="SEGURIDAD">Seguridad (Usuarios y Permisos)</option>
                  <option value="COBRANZA">Cobranza</option>
                  <option value="CLIENTES">Clientes</option>
                  <option value="PRESTAMOS">Préstamos</option>
                  <option value="FONDOS">Fondos</option>
                  <option value="SISTEMA">Sistema</option>
                </select>
              )}
            </div>

            <div class="w-full lg:w-80 relative">
              <Icon
                name="search"
                size={18}
                class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                placeholder="Buscar por código, cliente, cédula, IP..."
                value={busqueda}
                onInput={(e) => {
                  setBusqueda((e.currentTarget as HTMLInputElement).value);
                  setPagina(1);
                }}
                class="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-body-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
          </div>
        </div>

        {/* Tabla de Bitácora */}
        <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {cargando ? (
            <div class="flex h-64 items-center justify-center">
              <Spinner size={36} />
            </div>
          ) : error ? (
            <div class="p-8 text-center">
              <Icon name="error" class="text-3xl text-rose-600 mb-2" />
              <p class="text-body-md text-rose-700">{error}</p>
              <Button variant="secondary" size="sm" class="mt-4" onClick={cargarDatos}>
                Reintentar
              </Button>
            </div>
          ) : eventos.length === 0 ? (
            <div class="p-12">
              <EmptyState
                icon="history"
                title="No se encontraron registros de auditoría"
                description="No existen eventos registrados que coincidan con los filtros seleccionados."
              />
            </div>
          ) : (
            <div>
              {/* Lista de Fichas Minimalistas de Auditoría */}
              <div class="divide-y divide-slate-100">
                {eventos.map((ev) => {
                  const fechaObj = new Date(ev.creado_en);
                  const fechaFormato = fechaObj.toLocaleDateString('es-NI', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  });
                  const horaFormato = fechaObj.toLocaleTimeString('es-NI', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  return (
                    <div
                      key={ev.id}
                      class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 transition-colors hover:bg-slate-50/70"
                    >
                      {/* Ficha Principal */}
                      <div class="min-w-0 flex-1 space-y-1.5">
                        <div class="flex flex-wrap items-center gap-2">
                          {badgeSeveridad(ev.nivel_severidad)}
                          <span class="font-bold text-slate-900 text-body-sm font-mono">{ev.codigo_evento}</span>
                          <span class="rounded bg-slate-100 px-2 py-0.5 text-caption font-semibold text-slate-600">
                            {ev.modulo}
                          </span>
                          {ev.codigo_comprobante && (
                            <span class="inline-flex items-center gap-1 font-mono font-bold text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">
                              <Icon name="receipt_long" size={14} />
                              {ev.codigo_comprobante}
                            </span>
                          )}
                          {ev.cliente_nombre && !ev.cliente_nombre.includes('object at') && !ev.cliente_nombre.includes('method-wrapper') && (
                            <span class="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                              <Icon name="person" size={14} />
                              {ev.cliente_nombre}
                            </span>
                          )}
                          {ev.prestamo && !ev.codigo_comprobante && (
                            <span class="text-xs text-slate-600 font-mono bg-slate-100 px-2 py-0.5 rounded">
                              Préstamo #{ev.prestamo}
                            </span>
                          )}
                        </div>

                        {/* Observación / Motivo */}
                        <p class="text-body-sm text-slate-700 line-clamp-2 break-words">
                          {ev.observaciones || 'Sin observaciones adicionales registradas.'}
                        </p>

                        {/* Metadatos: Fecha, Usuario, IP, Indicador Diff */}
                        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-slate-500">
                          <span class="inline-flex items-center gap-1">
                            <Icon name="schedule" size={14} class="text-slate-400" />
                            <span class="tnum font-medium">{fechaFormato} a las {horaFormato}</span>
                          </span>
                          <span class="inline-flex items-center gap-1">
                            <Icon name="person" size={14} class="text-slate-400" />
                            <span class="font-semibold text-slate-800">{ev.usuario_nombre || 'Sistema'}</span>
                            {ev.usuario_rol && (
                              <span class="text-slate-400">({ev.usuario_rol === 'ADMINISTRADOR' ? 'Admin' : ev.usuario_rol === 'COBRANZA' ? 'Cobranza' : ev.usuario_rol})</span>
                            )}
                          </span>
                          {ev.direccion_ip && (
                            <span class="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
                              <Icon name="desktop_windows" size={13} />
                              {ev.direccion_ip}
                            </span>
                          )}
                          {ev.diferencial_cambios && (
                            <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                              <Icon name="compare_arrows" size={12} />
                              Modificación con Diff
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botón Ver detalles al costado */}
                      <div class="shrink-0 sm:self-center">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setEventoSeleccionado(ev)}
                          class="w-full sm:w-auto"
                        >
                          <Icon name="visibility" size={16} />
                          Ver detalles
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Barra de Paginación */}
              {totalRegistros > 0 && (
                <div class="flex flex-col sm:flex-row items-center justify-between border-t border-slate-200 px-4 py-3 bg-slate-50/60 gap-3">
                  <span class="text-caption text-slate-600">
                    Mostrando <span class="font-semibold text-slate-900">{eventos.length}</span> de{' '}
                    <span class="font-semibold text-slate-900">{totalRegistros}</span> eventos auditados
                  </span>
                  {Math.ceil(totalRegistros / 20) > 1 && (
                    <div class="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pagina <= 1 || cargando}
                        onClick={() => setPagina((p) => Math.max(1, p - 1))}
                      >
                        <Icon name="arrow_back" size={16} />
                        Anterior
                      </Button>
                      <span class="text-caption font-medium text-slate-700 px-2">
                        Página {pagina} de {Math.ceil(totalRegistros / 20)}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pagina >= Math.ceil(totalRegistros / 20) || cargando}
                        onClick={() => setPagina((p) => Math.min(Math.ceil(totalRegistros / 20), p + 1))}
                      >
                        Siguiente
                        <Icon name="arrow_forward" size={16} />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Detalle Forense Estructurado y Protegido contra Desbordes */}
        {eventoSeleccionado && (
          <Modal
            open={Boolean(eventoSeleccionado)}
            onClose={() => setEventoSeleccionado(null)}
            title={`Detalle de Auditoría: Evento #${eventoSeleccionado.id}`}
            subtitle={`${eventoSeleccionado.modulo} - Registrado el ${new Date(eventoSeleccionado.creado_en).toLocaleDateString('es-NI')} ${new Date(eventoSeleccionado.creado_en).toLocaleTimeString('es-NI')}`}
            icon="history"
            size="lg"
            footer={
              <Button variant="secondary" onClick={() => setEventoSeleccionado(null)}>
                Cerrar
              </Button>
            }
          >
            <div class="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
              {/* Tarjetas Clave de Metadatos */}
              <div class="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:grid-cols-4">
                <div class="min-w-0">
                  <span class="text-caption font-medium text-slate-500 block">Código Evento</span>
                  <span class="font-bold text-slate-900 text-body-sm font-mono truncate block" title={eventoSeleccionado.codigo_evento}>
                    {eventoSeleccionado.codigo_evento}
                  </span>
                </div>
                <div class="min-w-0">
                  <span class="text-caption font-medium text-slate-500 block">Severidad</span>
                  <div class="mt-0.5">{badgeSeveridad(eventoSeleccionado.nivel_severidad)}</div>
                </div>
                <div class="min-w-0">
                  <span class="text-caption font-medium text-slate-500 block">Usuario</span>
                  <span class="font-semibold text-slate-900 text-body-sm truncate block" title={eventoSeleccionado.usuario_nombre || 'Sistema'}>
                    {eventoSeleccionado.usuario_nombre || 'Sistema'}
                  </span>
                  <span class="text-[11px] text-slate-500 block">{eventoSeleccionado.usuario_rol || 'N/A'}</span>
                </div>
                <div class="min-w-0">
                  <span class="text-caption font-medium text-slate-500 block">Dirección IP</span>
                  <span class="font-mono text-slate-700 text-body-sm block truncate" title={eventoSeleccionado.direccion_ip || '127.0.0.1'}>
                    {eventoSeleccionado.direccion_ip || '127.0.0.1'}
                  </span>
                </div>
              </div>

              {/* Referencias Vinculadas (Comprobante / Cliente / Préstamo) */}
              {(() => {
                const tieneCliente = eventoSeleccionado.cliente_nombre &&
                  !eventoSeleccionado.cliente_nombre.includes('object at') &&
                  !eventoSeleccionado.cliente_nombre.includes('method-wrapper');
                if (!eventoSeleccionado.codigo_comprobante && !tieneCliente && !eventoSeleccionado.prestamo) {
                  return null;
                }
                return (
                  <div class="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-body-sm">
                    <span class="text-caption font-semibold uppercase text-slate-500">Referencia:</span>
                    {eventoSeleccionado.codigo_comprobante && (
                      <span class="inline-flex items-center gap-1 font-mono font-bold text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">
                        <Icon name="receipt_long" size={14} />
                        Recibo {eventoSeleccionado.codigo_comprobante}
                      </span>
                    )}
                    {tieneCliente && (
                      <span class="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                        <Icon name="person" size={14} />
                        Cliente: {eventoSeleccionado.cliente_nombre}
                      </span>
                    )}
                    {eventoSeleccionado.prestamo && (
                      <span class="text-xs font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        Crédito #{eventoSeleccionado.prestamo}
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Observaciones y Motivo (con contenedor anti-desborde) */}
              <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                <span class="text-caption font-bold uppercase tracking-wider text-slate-500 block mb-1.5 flex items-center gap-1">
                  <Icon name="description" size={15} />
                  Observaciones y Justificación Registrada
                </span>
                <div class="max-h-36 overflow-y-auto rounded-lg bg-slate-50 p-3 border border-slate-100">
                  <p class="text-body-sm text-slate-800 leading-relaxed break-words whitespace-pre-wrap font-medium">
                    {eventoSeleccionado.observaciones || 'No se registraron notas operativas adicionales para este evento.'}
                  </p>
                </div>
              </div>

              {/* Comparador Diferencial de Cambios (Diff Antes vs Después) con protección de desborde */}
              {eventoSeleccionado.diferencial_cambios && Object.keys(eventoSeleccionado.diferencial_cambios).length > 0 ? (
                <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                  <h4 class="text-caption font-bold uppercase tracking-wider text-slate-700 mb-2.5 flex items-center gap-1.5">
                    <Icon name="compare_arrows" size={16} class="text-indigo-600" />
                    Comparador Diferencial de Modificaciones (Diff)
                  </h4>
                  <div class="overflow-x-auto max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                    <table class="w-full text-left text-body-sm table-fixed">
                      <thead class="sticky top-0 z-10">
                        <tr class="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold text-caption uppercase">
                          <th class="w-1/3 p-2.5 bg-slate-100">Atributo</th>
                          <th class="w-1/3 p-2.5 bg-rose-100/70 text-rose-800">Valor Anterior</th>
                          <th class="w-1/3 p-2.5 bg-emerald-100/70 text-emerald-800">Valor Modificado</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100">
                        {Object.entries(eventoSeleccionado.diferencial_cambios).map(([campo, diff]: any) => (
                          <tr key={campo} class="hover:bg-slate-50/80">
                            <td class="p-2.5 font-medium text-slate-800 capitalize break-words">
                              {campo.replace(/_/g, ' ')}
                            </td>
                            <td class="p-2.5 bg-rose-50/40 text-rose-900 font-mono text-xs break-all whitespace-pre-wrap">
                              {diff.antes !== null && diff.antes !== undefined ? String(diff.antes) : '(vacío)'}
                            </td>
                            <td class="p-2.5 bg-emerald-50/40 text-emerald-900 font-mono text-xs font-semibold break-all whitespace-pre-wrap">
                              {diff.despues !== null && diff.despues !== undefined ? String(diff.despues) : '(vacío)'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : eventoSeleccionado.datos_nuevos ? (
                <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                  <h4 class="text-caption font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                    <Icon name="query_stats" size={16} />
                    Snapshot de Datos Operativos
                  </h4>
                  <pre class="bg-slate-900 text-slate-100 p-3.5 rounded-lg text-xs font-mono overflow-x-auto max-h-56 break-all whitespace-pre-wrap scrollbar-thin">
                    {JSON.stringify(eventoSeleccionado.datos_nuevos, null, 2)}
                  </pre>
                </div>
              ) : null}

              {/* Terminal y User Agent */}
              {eventoSeleccionado.agente_usuario && (
                <div class="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono break-all">
                  <span class="font-bold text-slate-700">Terminal / Navegador:</span> {eventoSeleccionado.agente_usuario}
                </div>
              )}
            </div>
          </Modal>
        )}
      </div>
    </Layout>
  );
}
export default AuditoriaPage;
