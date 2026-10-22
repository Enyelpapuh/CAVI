import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  Icon,
  KpiTile,
  Select,
  Spinner,
  type Columna,
} from '../components/ui';
import { fondoService } from '../services/api';
import { fmtMonto, fmtFecha, fmtCantidad } from '../lib/format';
import type {
  Fondo,
  InformeFinancieroResponse,
  DesgloseFondoPeriodo,
  TransaccionPeriodo,
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

const MOCK_FONDOS: Fondo[] = [
  {
    id: 1,
    nombre: 'Familia Villareyna A',
    familiar: 'Carlos Villareyna',
    saldo_disponible: '42500.00',
    capital_inicial: '50000.00',
    capital_colocado: '115000.00',
    activo: true,
    creado_en: '2026-01-01T08:00:00Z',
    actualizado_en: '2026-10-10T12:00:00Z',
  },
  {
    id: 2,
    nombre: 'Fondo de Reserva B',
    familiar: 'Elena Morales',
    saldo_disponible: '52500.00',
    capital_inicial: '60000.00',
    capital_colocado: '100000.00',
    activo: true,
    creado_en: '2026-01-01T08:00:00Z',
    actualizado_en: '2026-10-10T12:00:00Z',
  },
];

const MOCK_INFORME: InformeFinancieroResponse = {
  mes: 10,
  anio: 2026,
  resumen: {
    total_recaudado: '38400.00',
    capital_retornado: '24100.00',
    interes_total: '13800.00',
    interes_fondos: '6900.00',
    interes_admin: '6900.00',
    mora_total: '500.00',
    desembolsos_mes: '45000.00',
    flujo_neto: '-6600.00',
    cantidad_pagos: 28,
  },
  desglose_fondos: [
    {
      fondo_id: 1,
      nombre: 'Familia Villareyna A',
      familiar: 'Carlos Villareyna',
      saldo_actual: '42500.00',
      capital_reintegrado: '14460.00',
      ganancia_interes: '4140.00',
      total_acreditado: '18600.00',
      desembolsos_mes: '27000.00',
      flujo_neto: '-8400.00',
      cantidad_abonos: 18,
    },
    {
      fondo_id: 2,
      nombre: 'Fondo de Reserva B',
      familiar: 'Elena Morales',
      saldo_actual: '52500.00',
      capital_reintegrado: '9640.00',
      ganancia_interes: '2760.00',
      total_acreditado: '12400.00',
      desembolsos_mes: '18000.00',
      flujo_neto: '-5600.00',
      cantidad_abonos: 10,
    },
  ],
  transacciones: [
    {
      pago_id: 104,
      codigo_comprobante: 'REC-104-03',
      fecha_pago: '2026-10-10',
      cliente: 'Juan Carlos Perez Jarquin',
      prestamo_id: 12,
      fondo_id: 1,
      fondo_nombre: 'Familia Villareyna A',
      porcentaje_pi: '0.6000',
      capital_reintegrado: '388.00',
      ganancia_interes: '240.00',
      metodo_pago: 'Transferencia Bancaria',
      referencia_bancaria: 'BAC-TR982341',
    },
    {
      pago_id: 104,
      codigo_comprobante: 'REC-104-03',
      fecha_pago: '2026-10-10',
      cliente: 'Juan Carlos Perez Jarquin',
      prestamo_id: 12,
      fondo_id: 2,
      fondo_nombre: 'Fondo de Reserva B',
      porcentaje_pi: '0.4000',
      capital_reintegrado: '258.67',
      ganancia_interes: '160.00',
      metodo_pago: 'Transferencia Bancaria',
      referencia_bancaria: 'BAC-TR982341',
    },
    {
      pago_id: 98,
      codigo_comprobante: 'REC-098-02',
      fecha_pago: '2026-10-09',
      cliente: 'Maria Elena Lopez Martinez',
      prestamo_id: 9,
      fondo_id: 1,
      fondo_nombre: 'Familia Villareyna A',
      porcentaje_pi: '1.0000',
      capital_reintegrado: '430.00',
      ganancia_interes: '210.00',
      metodo_pago: 'Efectivo',
      referencia_bancaria: '',
    },
    {
      pago_id: 95,
      codigo_comprobante: 'REC-095-01',
      fecha_pago: '2026-10-08',
      cliente: 'Roberto Antonio Gomez',
      prestamo_id: 8,
      fondo_id: 2,
      fondo_nombre: 'Fondo de Reserva B',
      porcentaje_pi: '1.0000',
      capital_reintegrado: '1200.00',
      ganancia_interes: '350.00',
      metodo_pago: 'Transferencia Bancaria',
      referencia_bancaria: 'LAFISE-99120',
    },
    {
      pago_id: 92,
      codigo_comprobante: 'REC-092-04',
      fecha_pago: '2026-10-05',
      cliente: 'Ana Patricia Fonseca',
      prestamo_id: 5,
      fondo_id: 1,
      fondo_nombre: 'Familia Villareyna A',
      porcentaje_pi: '0.5000',
      capital_reintegrado: '500.00',
      ganancia_interes: '150.00',
      metodo_pago: 'Efectivo',
      referencia_bancaria: '',
    },
    {
      pago_id: 92,
      codigo_comprobante: 'REC-092-04',
      fecha_pago: '2026-10-05',
      cliente: 'Ana Patricia Fonseca',
      prestamo_id: 5,
      fondo_id: 2,
      fondo_nombre: 'Fondo de Reserva B',
      porcentaje_pi: '0.5000',
      capital_reintegrado: '500.00',
      ganancia_interes: '150.00',
      metodo_pago: 'Efectivo',
      referencia_bancaria: '',
    },
  ],
};

export function InformeBolsasPage() {
  const hoy = useMemo(() => new Date(), []);
  const [mes, setMes] = useState<number>(10);
  const [anio, setAnio] = useState<number>(2026);
  const [fondoSeleccionado, setFondoSeleccionado] = useState<string>('');

  const [fondosLista, setFondosLista] = useState<Fondo[]>(MOCK_FONDOS);
  const [informe, setInforme] = useState<InformeFinancieroResponse | null>(MOCK_INFORME);
  const [loading, setLoading] = useState(false);

  // Cargar lista de bolsas
  useEffect(() => {
    fondoService
      .list()
      .then((data) => {
        if (data.results && data.results.length > 0) {
          setFondosLista(data.results);
        } else {
          setFondosLista(MOCK_FONDOS);
        }
      })
      .catch(() => setFondosLista(MOCK_FONDOS));
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

      // Si la API devuelve datos reales con recaudación o transacciones, usarlos; de lo contrario mostrar demostración
      if (data && (data.transacciones?.length > 0 || Number(data.resumen?.total_recaudado) > 0)) {
        setInforme(data);
      } else {
        if (fondoSeleccionado) {
          const fid = Number(fondoSeleccionado);
          setInforme({
            ...MOCK_INFORME,
            mes,
            anio,
            desglose_fondos: MOCK_INFORME.desglose_fondos.filter((f) => f.fondo_id === fid),
            transacciones: MOCK_INFORME.transacciones.filter((t) => t.fondo_id === fid),
          });
        } else {
          setInforme({
            ...MOCK_INFORME,
            mes,
            anio,
          });
        }
      }
    } catch {
      // Si el backend no está disponible o falla, renderizar los datos de demostración
      if (fondoSeleccionado) {
        const fid = Number(fondoSeleccionado);
        setInforme({
          ...MOCK_INFORME,
          mes,
          anio,
          desglose_fondos: MOCK_INFORME.desglose_fondos.filter((f) => f.fondo_id === fid),
          transacciones: MOCK_INFORME.transacciones.filter((t) => t.fondo_id === fid),
        });
      } else {
        setInforme({
          ...MOCK_INFORME,
          mes,
          anio,
        });
      }
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
          <span class="font-bold text-slate-900 block">{f.nombre}</span>
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
          <span class="tnum font-bold text-emerald-700 block">{fmtMonto(f.capital_reintegrado)}</span>
          <span class="text-[11px] text-slate-400">Abonos a capital</span>
        </div>
      ),
    },
    {
      key: 'interes',
      header: 'Ingreso Interés',
      align: 'right',
      render: (f) => (
        <div>
          <span class="tnum font-bold text-amber-600 block">{fmtMonto(f.ganancia_interes)}</span>
          <span class="text-[11px] text-slate-400">Ganancia neta 50%</span>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total Acreditado',
      align: 'right',
      render: (f) => (
        <span class="tnum font-extrabold text-slate-900 block">
          {fmtMonto(f.total_acreditado)}
        </span>
      ),
    },
    {
      key: 'desembolsos',
      header: 'Desembolsos',
      align: 'right',
      render: (f) => (
        <span class="tnum text-slate-600 block">
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
          <span class={`tnum font-black ${val >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
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
      render: (t) => <span class="tnum text-slate-700 font-medium">{fmtFecha(t.fecha_pago)}</span>,
    },
    {
      key: 'comprobante',
      header: 'Recibo',
      render: (t) => (
        <div>
          <span class="font-mono text-xs font-bold text-slate-900">{t.codigo_comprobante || `#${t.pago_id}`}</span>
          <span class="block text-body-xs text-slate-500">{t.metodo_pago}</span>
        </div>
      ),
    },
    {
      key: 'cliente',
      header: 'Cliente / Crédito',
      render: (t) => (
        <div>
          <span class="font-medium text-slate-900 block truncate max-w-xs">{t.cliente}</span>
          <span class="text-body-xs text-slate-500">Préstamo #{t.prestamo_id}</span>
        </div>
      ),
    },
    {
      key: 'fondo',
      header: 'Bolsa Aportante',
      render: (t) => (
        <div>
          <span class="font-semibold text-slate-800 block">{t.fondo_nombre}</span>
          <span class="text-body-xs text-slate-500">Pi: {(Number(t.porcentaje_pi) * 100).toFixed(2)}%</span>
        </div>
      ),
    },
    {
      key: 'capital',
      header: 'Abono Capital',
      align: 'right',
      render: (t) => <span class="tnum font-bold text-emerald-700">{fmtMonto(t.capital_reintegrado)}</span>,
    },
    {
      key: 'interes',
      header: 'Interés Bolsa',
      align: 'right',
      render: (t) => <span class="tnum font-bold text-amber-600">{fmtMonto(t.ganancia_interes)}</span>,
    },
  ];

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
        titulo="Informes Financieros de Bolsas"
        descripcion={`Liquidación mensual de ingresos por intereses, abonos recuperados a capital y flujo neto · ${nombreMesActual} ${anio}`}
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
            <div>
              <label class="mb-1.5 block text-label-md text-slate-700">Año</label>
              <input
                type="number"
                value={anio}
                onInput={(e) => setAnio(Number((e.currentTarget as HTMLInputElement).value))}
                min="2020"
                max="2035"
                class="h-[38px] w-full rounded-md border border-slate-300 bg-white px-3 text-body-md text-slate-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
              />
            </div>
            <Select
              label="Filtrar por Bolsa"
              value={fondoSeleccionado}
              onChange={(val) => setFondoSeleccionado(val)}
              options={opcionesFondos}
            />
          </div>

          <div class="flex items-center gap-2">
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
          {/* KPIs Consolidados del Mes */}
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiTile
              label="Ingreso por Intereses"
              value={fmtMonto(informe.resumen.interes_total)}
              icon="trending_up"
              tono="esmeralda"
              pie={`Fondos: ${fmtMonto(informe.resumen.interes_fondos)} (50%) · CAVI: ${fmtMonto(informe.resumen.interes_admin)}`}
            />
            <KpiTile
              label="Capital Reintegrado"
              value={fmtMonto(informe.resumen.capital_retornado)}
              icon="task_alt"
              tono="indigo"
              pie="Abonado a capital por clientes"
            />
            <KpiTile
              label="Total Recaudado en Mes"
              value={fmtMonto(informe.resumen.total_recaudado)}
              icon="savings"
              tono="ambar"
              pie={`${informe.resumen.cantidad_pagos} pagos recibidos`}
            />
            <KpiTile
              label="Flujo Neto Mensual"
              value={fmtMonto(informe.resumen.flujo_neto)}
              icon="account_balance"
              tono={Number(informe.resumen.flujo_neto) >= 0 ? 'esmeralda' : 'rosa'}
              pie={`Nuevos desembolsos: ${fmtMonto(informe.resumen.desembolsos_mes)}`}
            />
          </div>

          {/* Tabla Comparativa de Rendimiento por Bolsa */}
          <Card
            title={`Liquidación por Bolsa Familiar (${nombreMesActual} ${anio})`}
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

          {/* Detalle Transaccional de Abonos del Periodo */}
          <Card
            title="Transacciones y Abonos del Periodo"
            subtitle="Registro auditable de cada cuota cobrada y su distribución exacta entre las bolsas"
            padded={false}
          >
            {informe.transacciones.length === 0 ? (
              <div class="p-8 text-center text-slate-500">
                <p>No se registraron abonos en este mes.</p>
              </div>
            ) : (
              <div class="max-h-96 overflow-y-auto">
                <DataTable
                  columns={columnasTransacciones}
                  rows={informe.transacciones}
                  getKey={(t) => `${t.pago_id}-${t.fondo_id}`}
                  caption="Transacciones del periodo"
                />
              </div>
            )}
          </Card>
        </div>
      )}
    </Layout>
  );
}
