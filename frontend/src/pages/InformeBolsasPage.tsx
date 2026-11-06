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
  Select,
  Spinner,
  useToast,
  type Columna,
} from '../components/ui';
import { fondoService } from '../services/api';
import { fmtMonto, fmtFecha } from '../lib/format';
import type {
  Fondo,
  InformeFinancieroResponse,
  DesgloseFondoPeriodo,
  TransaccionPeriodo,
  TransaccionCanceladaPeriodo,
} from '../types';

const MESES = [
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

export function InformeBolsasPage() {
  const toast = useToast();
  const hoy = useMemo(() => new Date(), []);
  const [mes, setMes] = useState<number>(() => new Date().getMonth() + 1);
  const [anio, setAnio] = useState<number>(() => new Date().getFullYear());
  const [fondoSeleccionado, setFondoSeleccionado] = useState<string>('');
  const [tabActiva, setTabActiva] = useState<'resumen' | 'bolsas' | 'transacciones' | 'cancelados'>('resumen');

  const [fondosLista, setFondosLista] = useState<Fondo[]>([]);
  const [informe, setInforme] = useState<InformeFinancieroResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Cargar lista de bolsas
  useEffect(() => {
    fondoService
      .list()
      .then((data) => {
        if (data.results && Array.isArray(data.results)) {
          setFondosLista(data.results);
        } else if (Array.isArray(data)) {
          setFondosLista(data);
        }
      })
      .catch(() => setFondosLista([]));
  }, []);

  // Cargar informe financiero del periodo
  const cargarInforme = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fondoService.informeFinanciero({
        mes,
        anio,
        fondo: fondoSeleccionado ? Number(fondoSeleccionado) : undefined,
      });
      setInforme(data || null);
    } catch {
      setInforme(null);
      toast.error('No se pudo generar el informe financiero del periodo');
    } finally {
      setLoading(false);
    }
  }, [mes, anio, fondoSeleccionado]);

  useEffect(() => {
    cargarInforme();
  }, [cargarInforme]);

  const aplicarMesActual = () => {
    setMes(hoy.getMonth() + 1);
    setAnio(hoy.getFullYear());
  };

  const aplicarMesAnterior = () => {
    if (mes === 1) {
      setMes(12);
      setAnio(anio - 1);
    } else {
      setMes(mes - 1);
    }
  };

  const nombreMesActual = MESES.find((m) => m.value === String(mes))?.label || `Mes ${mes}`;
  const mesAnteriorNum = mes === 1 ? 12 : mes - 1;
  const nombreMesAnterior = MESES.find((m) => m.value === String(mesAnteriorNum))?.label || `Mes ${mesAnteriorNum}`;

  const opcionesFondos = useMemo(() => {
    return [
      { value: '', label: 'Todas las Bolsas (Consolidado)' },
      ...fondosLista.map((f) => ({ value: String(f.id), label: `${f.nombre} (${f.familiar})` })),
    ];
  }, [fondosLista]);

  const columnasDesglose: Columna<DesgloseFondoPeriodo>[] = [
    {
      key: 'fondo',
      header: 'Bolsa Familiar',
      render: (f) => (
        <div>
          <span class="font-bold text-slate-900 block text-body-sm">{f.nombre}</span>
          <span class="text-body-xs text-slate-500">Titular: {f.familiar}</span>
        </div>
      ),
    },
    {
      key: 'capital',
      header: 'Capital Reintegrado',
      align: 'right',
      render: (f) => (
        <div>
          <span class="tnum font-mono font-bold text-emerald-700 block">{fmtMonto(f.capital_reintegrado)}</span>
          <span class="text-[11px] text-slate-400 font-medium">Abonos a capital</span>
        </div>
      ),
    },
    {
      key: 'interes',
      header: 'Ingreso Interés',
      align: 'right',
      render: (f) => (
        <div>
          <span class="tnum font-mono font-bold text-amber-600 block">{fmtMonto(f.ganancia_interes)}</span>
          <span class="text-[11px] text-slate-400 font-medium">Ganancia neta 50%</span>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total Acreditado',
      align: 'right',
      render: (f) => (
        <span class="tnum font-mono font-extrabold text-slate-900 block">
          {fmtMonto(f.total_acreditado)}
        </span>
      ),
    },
    {
      key: 'desembolsos',
      header: 'Desembolsos',
      align: 'right',
      render: (f) => (
        <span class="tnum font-mono text-slate-600 block">
          {fmtMonto(f.desembolsos_mes)}
        </span>
      ),
    },
    {
      key: 'neto',
      header: 'Flujo Neto Mensual',
      align: 'right',
      render: (f) => {
        const val = Number(f.flujo_neto);
        return (
          <span class={`tnum font-mono font-black ${val >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {val >= 0 ? '+' : ''}{fmtMonto(f.flujo_neto)}
          </span>
        );
      },
    },
  ];

  const columnasTransacciones: Columna<TransaccionPeriodo>[] = [
    {
      key: 'fecha',
      header: 'Fecha',
      render: (t) => <span class="tnum font-mono text-slate-700 font-medium text-body-xs">{fmtFecha(t.fecha_pago)}</span>,
    },
    {
      key: 'comprobante',
      header: 'Comprobante',
      render: (t) => (
        <div>
          <span class="font-mono text-xs font-bold text-slate-900">{t.codigo_comprobante || `#${t.pago_id}`}</span>
          <span class="block text-body-xs text-slate-500">{t.metodo_pago}</span>
          {t.referencia_bancaria && (
            <span class="block text-[10px] text-slate-400 font-mono">Ref: {t.referencia_bancaria}</span>
          )}
        </div>
      ),
    },
    {
      key: 'cliente',
      header: 'Cliente / Crédito',
      render: (t) => (
        <div>
          <span class="font-semibold text-slate-900 block truncate max-w-xs text-body-sm">{t.cliente}</span>
          <span class="text-body-xs text-slate-500">Préstamo #{t.prestamo_id}</span>
        </div>
      ),
    },
    {
      key: 'monto_total',
      header: 'Total Cobrado',
      align: 'right',
      render: (t) => (
        <span class="tnum font-mono font-bold text-slate-900">
          {fmtMonto(t.monto_total || (Number(t.capital_reintegrado) + Number(t.ganancia_interes)))}
        </span>
      ),
    },
    {
      key: 'capital',
      header: 'Amortización Capital',
      align: 'right',
      render: (t) => <span class="tnum font-mono font-bold text-emerald-700">{fmtMonto(t.capital_reintegrado)}</span>,
    },
    {
      key: 'interes',
      header: 'Interés Corriente',
      align: 'right',
      render: (t) => <span class="tnum font-mono font-bold text-amber-600">{fmtMonto(t.ganancia_interes)}</span>,
    },
    {
      key: 'fondo',
      header: 'Bolsa Aportante',
      render: (t) => (
        <div>
          <span class="font-semibold text-slate-800 block text-body-xs">{t.fondo_nombre}</span>
          <span class="text-body-xs text-slate-500 font-mono">Pi: {(Number(t.porcentaje_pi) * 100).toFixed(2)}%</span>
        </div>
      ),
    },
  ];

  const columnasCancelados: Columna<TransaccionCanceladaPeriodo>[] = [
    {
      key: 'comprobante',
      header: 'Comprobante Anulado',
      render: (c) => (
        <div>
          <span class="font-mono text-xs font-bold text-rose-700 line-through block">{c.codigo_comprobante}</span>
          <span class="inline-block rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-800 border border-rose-200 mt-0.5">
            INVÁLIDO
          </span>
        </div>
      ),
    },
    {
      key: 'fechas',
      header: 'Fechas',
      render: (c) => (
        <div class="text-body-xs font-mono">
          <span class="text-slate-600 block">Cobro: {fmtFecha(c.fecha_pago)}</span>
          <span class="text-rose-700 font-semibold block">Anulado: {fmtFecha(c.fecha_anulacion)}</span>
        </div>
      ),
    },
    {
      key: 'cliente',
      header: 'Cliente / Crédito',
      render: (c) => (
        <div>
          <span class="font-semibold text-slate-900 block truncate max-w-xs text-body-sm">{c.cliente}</span>
          <span class="text-body-xs text-slate-500">Préstamo #{c.prestamo_id}</span>
        </div>
      ),
    },
    {
      key: 'monto',
      header: 'Total Revertido',
      align: 'right',
      render: (c) => (
        <div>
          <span class="tnum font-mono font-bold text-rose-800 block">{fmtMonto(c.monto_total)}</span>
          <span class="text-[10px] font-mono text-slate-500">Cap: {fmtMonto(c.aplicacion_capital)} · Int: {fmtMonto(c.aplicacion_interes)}</span>
        </div>
      ),
    },
    {
      key: 'motivo',
      header: 'Motivo y Autorización',
      render: (c) => (
        <div class="max-w-xs">
          <span class="italic text-slate-800 font-medium block text-body-xs">&ldquo;{c.motivo_anulacion}&rdquo;</span>
          <span class="text-[10px] text-slate-500 block mt-0.5">Autorizado por: {c.anulado_por_nombre}</span>
        </div>
      ),
    },
  ];

  const esBolsaIndividual = Boolean(informe?.fondo_info);

  return (
    <Layout titulo="Informes Financieros">
      {/* Pestañas de Navegación de Reportes */}
      <div class="mb-5 flex items-center justify-between border-b border-slate-200 pb-3 print:hidden">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-label-sm font-semibold text-white shadow-sm"
          >
            <Icon name="analytics" size={18} />
            Informes Financieros
          </button>
          <button
            type="button"
            onClick={() => (location.href = '/reportes/estados-cuenta')}
            class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-label-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Icon name="receipt_long" size={18} />
            Estados de Cuenta (Clientes)
          </button>
        </div>

        {informe && (
          <Button icon="print" variant="secondary" onClick={() => window.print()}>
            Imprimir Informe Mensual
          </Button>
        )}
      </div>

      <PageHeader
        titulo="Informe Financiero Mensual"
        descripcion={
          informe?.fondo_info
            ? `Liquidación financiera individual para ${informe.fondo_info.nombre} (${informe.fondo_info.familiar}) · ${nombreMesActual} ${anio}`
            : `Liquidación consolidada de rendimientos, recaudación bruta, colocación y auditoría de operaciones · ${nombreMesActual} ${anio}`
        }
      />

      {/* Barra de Filtros del Periodo (Oculto al imprimir) */}
      <Card class="print:hidden">
        <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
            <Select
              label="Mes de Liquidación"
              value={String(mes)}
              onChange={(val) => setMes(Number(val))}
              options={MESES}
            />
            <Input
              label="Año"
              type="number"
              value={String(anio)}
              onInput={(val) => {
                const num = Number(val);
                if (!isNaN(num) && num >= 2000 && num <= 2099) {
                  setAnio(num);
                }
              }}
              min="2020"
              max="2035"
            />
            <Select
              label="Filtrar por Bolsa"
              value={fondoSeleccionado}
              onChange={(val) => setFondoSeleccionado(val)}
              options={opcionesFondos}
            />
          </div>

          <div class="flex flex-wrap items-center gap-2 pb-0.5">
            <Button size="sm" variant="secondary" onClick={aplicarMesActual}>
              Mes Actual
            </Button>
            <Button size="sm" variant="secondary" onClick={aplicarMesAnterior}>
              Mes Anterior
            </Button>
            <Button size="sm" icon="refresh" onClick={cargarInforme}>
              Actualizar
            </Button>
          </div>
        </div>
      </Card>

      {/* Vista de Contenido */}
      {loading ? (
        <div class="flex justify-center py-20">
          <Spinner size={40} />
        </div>
      ) : !informe ? (
        <div class="mt-6">
          <EmptyState
            icon="analytics"
            title="Sin datos para este periodo"
            description="No se pudieron cargar los datos financieros para el mes seleccionado."
          />
        </div>
      ) : (
        <div class="mt-6 space-y-6">
          {/* Ficha de Identidad de la Bolsa Individual cuando está filtrada */}
          {informe.fondo_info && (
            <div class="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/90 via-indigo-50/40 to-white p-5 shadow-xs transition-all">
              <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex items-start gap-3.5">
                  <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                    <Icon name="account_balance_wallet" size={26} />
                  </div>
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-label-xs font-bold uppercase tracking-wider text-blue-700">
                        Ficha de Bolsa Individual
                      </span>
                      <span class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-label-xs font-bold text-blue-800">
                        {informe.fondo_info.tipo_persona === 'JURIDICA' ? 'Persona Jurídica' : 'Persona Natural'}
                      </span>
                    </div>
                    <h3 class="text-title-md font-bold text-slate-900 mt-0.5">
                      {informe.fondo_info.nombre}
                    </h3>
                    <p class="text-body-xs text-slate-600">
                      Titular: <span class="font-semibold text-slate-800">{informe.fondo_info.familiar}</span>
                      {informe.fondo_info.tipo_persona === 'JURIDICA' ? (
                        <>
                          {' '}· RUC: <span class="font-mono font-medium text-slate-800">{informe.fondo_info.ruc || 'N/D'}</span>
                          {informe.fondo_info.razon_social ? ` (${informe.fondo_info.razon_social})` : ''}
                        </>
                      ) : (
                        <>
                          {' '}· Cédula: <span class="font-mono font-medium text-slate-800">{informe.fondo_info.cedula_titular || 'N/D'}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-3">
                  <div class="rounded-xl border border-slate-200/90 bg-white/95 px-4 py-2 text-right shadow-2xs">
                    <span class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Saldo Disponible</span>
                    <span class="tnum font-mono text-title-sm font-bold text-emerald-700 block">
                      {fmtMonto(informe.fondo_info.saldo_disponible)}
                    </span>
                  </div>
                  <div class="rounded-xl border border-slate-200/90 bg-white/95 px-4 py-2 text-right shadow-2xs">
                    <span class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ganancias Acumuladas</span>
                    <span class="tnum font-mono text-title-sm font-bold text-amber-700 block">
                      {fmtMonto(informe.fondo_info.ganancias_acumuladas)}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="close"
                    onClick={() => setFondoSeleccionado('')}
                    class="border-blue-200 text-blue-700 hover:bg-blue-100/50"
                  >
                    Ver Consolidado
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Selector de Pestañas Internas del Informe */}
          <div class="flex border-b border-slate-200 bg-white rounded-t-xl px-4 text-label-sm font-semibold print:hidden overflow-x-auto">
            <button
              type="button"
              onClick={() => setTabActiva('resumen')}
              class={`flex items-center gap-2 border-b-2 py-3 px-3 transition-colors ${
                tabActiva === 'resumen'
                  ? 'border-slate-900 text-slate-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon name="analytics" size={16} />
              <span>Resumen & Comparativa MoM</span>
            </button>
            <button
              type="button"
              onClick={() => setTabActiva('bolsas')}
              class={`flex items-center gap-2 border-b-2 py-3 px-3 transition-colors ${
                tabActiva === 'bolsas'
                  ? 'border-slate-900 text-slate-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon name="account_balance_wallet" size={16} />
              <span>{esBolsaIndividual ? 'Rendimiento de la Bolsa' : 'Rendimiento por Bolsa'}</span>
              <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-mono font-semibold text-slate-700">
                {informe.desglose_fondos.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTabActiva('transacciones')}
              class={`flex items-center gap-2 border-b-2 py-3 px-3 transition-colors ${
                tabActiva === 'transacciones'
                  ? 'border-slate-900 text-slate-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon name="receipt" size={16} />
              <span>Libro de Transacciones</span>
              <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-mono font-semibold text-slate-700">
                {informe.transacciones.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTabActiva('cancelados')}
              class={`flex items-center gap-2 border-b-2 py-3 px-3 transition-colors ${
                tabActiva === 'cancelados'
                  ? 'border-rose-600 text-rose-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-rose-700'
              }`}
            >
              <Icon name="cancel" size={16} class={tabActiva === 'cancelados' ? 'text-rose-600' : ''} />
              <span>Operaciones Canceladas</span>
              {Boolean(informe.seccion_cancelados?.cantidad) && (
                <span class="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-mono font-bold text-rose-800 border border-rose-300">
                  {informe.seccion_cancelados?.cantidad}
                </span>
              )}
            </button>
          </div>

          {/* KPIs Consolidados o Individuales del Mes */}
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiTile
              label="Ingreso por Intereses"
              value={fmtMonto(esBolsaIndividual ? informe.resumen.interes_fondos : informe.resumen.interes_total)}
              icon="trending_up"
              tono="esmeralda"
              pie={
                informe.fondo_info
                  ? `Ganancia neta 50% acreditada a ${informe.fondo_info.nombre}`
                  : `Fondos: ${fmtMonto(informe.resumen.interes_fondos)} (50%) · CAVI: ${fmtMonto(informe.resumen.interes_admin)}`
              }
            />
            <KpiTile
              label="Capital Reintegrado"
              value={fmtMonto(informe.resumen.capital_retornado)}
              icon="task_alt"
              tono="indigo"
              pie={
                informe.fondo_info
                  ? `Amortizaciones reingresadas a la bolsa`
                  : "Abonado a capital por clientes"
              }
            />
            <KpiTile
              label="Total Recaudado en Mes"
              value={fmtMonto(informe.resumen.total_recaudado)}
              icon="savings"
              tono="ambar"
              pie={
                informe.fondo_info
                  ? `${informe.resumen.cantidad_pagos} cuotas con participación`
                  : `${informe.resumen.cantidad_pagos} cobros efectivos`
              }
            />
            <KpiTile
              label="Flujo Neto Mensual"
              value={fmtMonto(informe.resumen.flujo_neto)}
              icon="account_balance"
              tono={Number(informe.resumen.flujo_neto) >= 0 ? 'esmeralda' : 'rosa'}
              pie={
                informe.fondo_info
                  ? `Colocación del mes: ${fmtMonto(informe.resumen.desembolsos_mes)}`
                  : `Desembolsos: ${fmtMonto(informe.resumen.desembolsos_mes)}`
              }
            />
          </div>

          {/* PESTAÑA 1: RESUMEN Y COMPARATIVA MoM */}
          {(tabActiva === 'resumen' || window.matchMedia?.('print').matches) && (
            <div class="space-y-6">
              {informe.comparativa_mes_anterior && (
                <Card
                  title={
                    informe.fondo_info
                      ? `Comparativa de Rendimiento de la Bolsa (${nombreMesActual} vs. ${nombreMesAnterior})`
                      : `Comparativa de Rendimiento con Mes Anterior (${nombreMesActual} vs. ${nombreMesAnterior})`
                  }
                  subtitle={
                    informe.fondo_info
                      ? `Análisis Month-over-Month (MoM) de retornos y recaudación de ${informe.fondo_info.nombre}`
                      : "Análisis Month-over-Month (MoM) de variación nominal en córdobas y crecimiento porcentual"
                  }
                  padded={false}
                >
                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm">
                      <thead class="border-b border-slate-200 bg-slate-50/90 text-label-xs font-bold uppercase tracking-wider text-slate-600">
                        <tr>
                          <th class="py-3.5 px-4">Indicador Financiero</th>
                          <th class="py-3.5 px-4 text-right">{nombreMesActual} {anio}</th>
                          <th class="py-3.5 px-4 text-right">{nombreMesAnterior} {informe.comparativa_mes_anterior.anio_anterior}</th>
                          <th class="py-3.5 px-4 text-right">Variación (C$)</th>
                          <th class="py-3.5 px-4 text-right">Crecimiento (%)</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100">
                        {[
                          { label: 'Recaudación Bruta en Caja', data: informe.comparativa_mes_anterior.total_recaudado, esMonto: true },
                          { label: 'Capital Abonado / Reintegrado', data: informe.comparativa_mes_anterior.capital_retornado, esMonto: true },
                          { label: 'Intereses Corrientes Generados', data: informe.comparativa_mes_anterior.interes_total, esMonto: true },
                          { label: '  · Interés a Fondos Familiares (50%)', data: informe.comparativa_mes_anterior.interes_fondos, esMonto: true, sub: true },
                          { label: '  · Interés Administración CAVI (50%)', data: informe.comparativa_mes_anterior.interes_admin, esMonto: true, sub: true },
                          { label: 'Mora y Recargos Recuperados', data: informe.comparativa_mes_anterior.mora_total, esMonto: true },
                          { label: 'Capital Desembolsado en Nuevos Créditos', data: informe.comparativa_mes_anterior.desembolsos_mes, esMonto: true },
                          { label: 'Total de Cobros Efectivos', data: informe.comparativa_mes_anterior.cantidad_pagos, esMonto: false },
                        ].map((row) => {
                          const diff = Number(row.data.diferencia);
                          const pct = Number(row.data.porcentaje);
                          const sub = row.sub;
                          return (
                            <tr key={row.label} class={`hover:bg-slate-50/70 transition-colors ${sub ? 'bg-slate-50/40 text-xs' : ''}`}>
                              <td class={`py-3 px-4 font-medium ${sub ? 'pl-8 text-slate-600' : 'text-slate-900 text-body-sm'}`}>
                                {row.label}
                              </td>
                              <td class="py-3 px-4 text-right tnum font-mono font-bold text-slate-900">
                                {row.esMonto ? fmtMonto(row.data.actual) : row.data.actual}
                              </td>
                              <td class="py-3 px-4 text-right tnum font-mono text-slate-500">
                                {row.esMonto ? fmtMonto(row.data.anterior) : row.data.anterior}
                              </td>
                              <td class={`py-3 px-4 text-right tnum font-mono font-bold ${diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                                {diff > 0 ? '+' : ''}{row.esMonto ? fmtMonto(row.data.diferencia) : row.data.diferencia}
                              </td>
                              <td class="py-3 px-4 text-right tnum font-mono">
                                <span class={`inline-block px-2 py-0.5 rounded text-xs font-bold ${pct > 0 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : pct < 0 ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-slate-100 text-slate-600'}`}>
                                  {pct > 0 ? '+' : ''}{row.data.porcentaje}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* PESTAÑA 2: RENDIMIENTO POR BOLSA FAMILIAR */}
          {(tabActiva === 'bolsas' || window.matchMedia?.('print').matches) && (
            <div class="space-y-4">
              <div class="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-body-xs text-blue-950">
                <div class="flex items-start gap-2.5">
                  <Icon name="info" class="text-blue-700 mt-0.5 shrink-0" size={18} />
                  <div class="space-y-1">
                    <span class="font-bold text-blue-900 block text-body-sm">
                      Mecanismo de Liquidación y Acreditación Automática (Ley N° 977)
                    </span>
                    <p class="text-blue-900/90 leading-relaxed">
                      <strong>Reintegro de Capital:</strong> Todo abono a capital realizado por los prestatarios se acredita de forma inmediata y automática al saldo disponible de la bolsa aportante en proporción a su porcentaje de participación (<span class="font-mono font-semibold">Pi</span>).
                    </p>
                    <p class="text-blue-900/90 leading-relaxed">
                      <strong>Ganancias de Interés:</strong> Del interés corriente cobrado, el 50% se distribuye entre los fondos inversores según su factor <span class="font-mono font-semibold">Pi</span> (<span class="font-mono">Ganancia = Interés Fondos × Pi</span>) y se acumula en su saldo histórico de utilidades.
                    </p>
                    <p class="text-blue-900/80 text-[11px] pt-0.5">
                      Utilice el selector superior &ldquo;Filtrar por Bolsa&rdquo; para alternar entre el <strong>Consolidado General</strong> o el <strong>Informe Individual</strong> de un fondo específico.
                    </p>
                  </div>
                </div>
              </div>

              {informe.fondo_info && (
                <div class="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-body-xs text-blue-900">
                  <div class="flex items-center gap-2">
                    <Icon name="info" class="text-blue-600 shrink-0" size={18} />
                    <span>Mostrando únicamente la liquidación individual de <strong>{informe.fondo_info.nombre}</strong>.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFondoSeleccionado('')}
                    class="text-label-xs font-bold text-blue-700 hover:underline cursor-pointer"
                  >
                    Ver todas las bolsas
                  </button>
                </div>
              )}

              <Card
                title={
                  informe.fondo_info
                    ? `Liquidación Individual (${informe.fondo_info.nombre} · ${nombreMesActual} ${anio})`
                    : `Liquidación por Bolsa Familiar (${nombreMesActual} ${anio})`
                }
                subtitle="Desglose de capital reintegrado, ganancias de interés (50% fondos) y balance neto mensual"
                padded={false}
              >
                {informe.desglose_fondos.length === 0 ? (
                  <div class="p-8 text-center text-slate-500">
                    <p>No hay movimientos registrados para las bolsas en este mes.</p>
                  </div>
                ) : (
                  <DataTable
                    columns={columnasDesglose}
                    rows={informe.desglose_fondos}
                    getKey={(f) => f.fondo_id}
                    caption="Liquidación mensual por bolsa"
                  />
                )}
              </Card>
            </div>
          )}

          {/* PESTAÑA 3: LIBRO DE TRANSACCIONES VIGENTES */}
          {(tabActiva === 'transacciones' || window.matchMedia?.('print').matches) && (
            <Card
              title={
                informe.fondo_info
                  ? `Libro de Cobros y Transacciones (${informe.fondo_info.nombre})`
                  : "Libro de Cobros y Transacciones Vigentes"
              }
              subtitle={
                informe.fondo_info
                  ? `Cobros del período donde participó el capital de ${informe.fondo_info.nombre}`
                  : "Registro cronológico y auditable de cobros asentados efectivamente en el período"
              }
              padded={false}
            >
              {informe.transacciones.length === 0 ? (
                <div class="p-8 text-center text-slate-500">
                  <p>No se registraron cobros vigentes en este mes.</p>
                </div>
              ) : (
                <div class="max-h-[500px] overflow-y-auto">
                  <DataTable
                    columns={columnasTransacciones}
                    rows={informe.transacciones}
                    getKey={(t) => `${t.pago_id}-${t.fondo_id}`}
                    caption="Transacciones vigentes del periodo"
                  />
                </div>
              )}
            </Card>
          )}

          {/* PESTAÑA 4: SECCIÓN DE AUDITORÍA DE OPERACIONES CANCELADAS */}
          {(tabActiva === 'cancelados' || window.matchMedia?.('print').matches) && (
            <div class="space-y-4">
              <div class="rounded-xl border-2 border-rose-300 bg-rose-50/70 p-4 shadow-xs">
                <div class="flex items-center justify-between">
                  <div>
                    <h4 class="text-title-sm font-bold text-rose-950 flex items-center gap-2">
                      <Icon name="warning" class="text-rose-600" />
                      Auditoría de Transacciones y Recibos Cancelados
                    </h4>
                    <p class="text-body-xs text-rose-800 mt-1">
                      {informe.fondo_info
                        ? `Registro inmutable de recibos anulados que impactaron a ${informe.fondo_info.nombre} bajo la Ley N° 977 (UAF).`
                        : "Registro inmutable de recibos anulados y contratos rescindidos durante el período bajo la Ley N° 977 (UAF)."}
                    </p>
                  </div>
                  <div class="text-right">
                    <span class="text-xs uppercase font-bold text-rose-900 block">Total Revertido en Período</span>
                    <span class="font-mono text-xl font-black text-rose-900">
                      {fmtMonto(informe.seccion_cancelados?.total_revertido || 0)}
                    </span>
                  </div>
                </div>
              </div>

              <Card
                title={
                  informe.fondo_info
                    ? `Detalle de Comprobantes Invalidados (${informe.fondo_info.nombre})`
                    : "Detalle de Comprobantes Invalidados"
                }
                subtitle="Motivo justificado, montos debitados y administradores que autorizaron la reversión"
                padded={false}
              >
                {!informe.seccion_cancelados || informe.seccion_cancelados.transacciones_canceladas.length === 0 ? (
                  <div class="p-8 text-center text-slate-500">
                    <Icon name="verified_user" size={32} class="mx-auto text-emerald-600 mb-2" />
                    <p class="font-medium text-slate-700">No hubo recibos cancelados en este período.</p>
                    <p class="text-body-xs text-slate-400 mt-1">Todas las transacciones asentadas se mantuvieron válidas sin reversiones contables.</p>
                  </div>
                ) : (
                  <DataTable
                    columns={columnasCancelados}
                    rows={informe.seccion_cancelados.transacciones_canceladas}
                    getKey={(c) => c.pago_id}
                    caption="Auditoría de operaciones canceladas"
                  />
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}

export default InformeBolsasPage;

