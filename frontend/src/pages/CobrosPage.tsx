import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { PagoRecibo } from '../components/PagoRecibo';
import { KpiTile, Button, Icon, Input, Select, Modal, Spinner, EmptyState, StatusBadge, useToast } from '../components/ui';
import { prestamoService, dashboardService, catalogoService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fmtMonto, fmtCantidad, fmtPorcentaje, fmtFecha, iniciales } from '../lib/format';
import type { CarteraFila, CajaCobrador, AgendaCobrador, PreviewPago, Pago, CatBanco } from '../types';

type Filtro = 'TODOS' | 'EN_FECHA' | 'PASADOS';

const METODOS = [
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTRO', label: 'Otro' },
];

const BANCOS_NICARAGUA = [
  { value: 'BAC Credomatic', label: 'BAC Credomatic' },
  { value: 'Banco LAFISE Bancentro', label: 'Banco LAFISE Bancentro' },
  { value: 'Banpro Grupo Promerica', label: 'Banpro Grupo Promerica' },
  { value: 'Banco BDF', label: 'Banco BDF' },
  { value: 'Banco Ficohsa', label: 'Banco Ficohsa' },
  { value: 'Billetera Móvil (Banpro/BAC)', label: 'Billetera Móvil' },
  { value: 'Otro Banco', label: 'Otro Banco' },
];

/** Desglose de prelación del Art. 3180 que devuelve el preview del backend. */
function Prelacion({ preview, esCobranza }: { preview: PreviewPago; esCobranza?: boolean }) {
  const filas: [string, string, string?][] = [
    ['Mora', preview.aplicacion_mora],
    ['Interés corriente', preview.aplicacion_interes],
    ['Capital', preview.aplicacion_capital],
  ];
  return (
    <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p class="text-label-sm uppercase font-bold text-slate-500">Imputación Art. 3180</p>
      <dl class="mt-2 space-y-1.5">
        {filas.map(([label, valor]) => (
          <div key={label} class="flex items-center justify-between text-body-md">
            <dt class="text-slate-600">{label}</dt>
            <dd class="tnum font-medium text-slate-900">{fmtMonto(valor)}</dd>
          </div>
        ))}
        <div class="flex items-center justify-between border-t border-slate-200 pt-1.5 text-body-md">
          <dt class="font-medium text-slate-700">Exceso no aplicado</dt>
          <dd class="tnum font-medium text-slate-900">{fmtMonto(preview.exceso_no_aplicado)}</dd>
        </div>
        <div class="flex items-center justify-between text-body-md">
          <dt class="font-medium text-slate-700">Deuda restante</dt>
          <dd class="tnum font-bold text-slate-900">{fmtMonto(preview.deuda_tras_pago)}</dd>
        </div>
      </dl>

      {!esCobranza && Number(preview.aplicacion_interes) > 0 && (
        <div class="mt-3 pt-2.5 border-t border-dashed border-slate-300 text-xs">
          <span class="font-bold text-slate-600 uppercase tracking-wide block mb-1">
            Distribución de Rendimientos (Ley N° 977 · 50/50)
          </span>
          <div class="flex justify-between text-slate-600 py-0.5">
            <span>Interés a Bolsas Inversoras (50%):</span>
            <span class="font-bold text-emerald-700">{fmtMonto(preview.interes_fondos)}</span>
          </div>
          <div class="flex justify-between text-slate-600 py-0.5">
            <span>Interés Administración CAVI (50%):</span>
            <span class="font-bold text-slate-800">{fmtMonto(preview.interes_administracion)}</span>
          </div>
        </div>
      )}

      {Number(preview.exceso_no_aplicado) > 0 && (
        <p class="mt-2 text-body-sm text-amber-700">
          El excedente se devuelve al cliente: el pago no puede rebasar la deuda total.
        </p>
      )}
      {preview.detalle_mora && preview.detalle_mora.dias_mora > 0 && (
        <p class="mt-2 text-body-sm text-red-700">
          Mora de {preview.detalle_mora.dias_mora} dias fuera de gracia al{' '}
          {fmtPorcentaje(Number(preview.detalle_mora.tasa_mora_mensual) * 100, 2)} mensual.
          Se cobra antes que el interes.
        </p>
      )}
    </div>
  );
}

export function CobrosPage() {
  const { user } = useAuth();
  const esCobranza = user?.rol === 'COBRANZA';
  const toast = useToast();

  const [agenda, setAgenda] = useState<AgendaCobrador | null>(null);
  const [caja, setCaja] = useState<CajaCobrador | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('TODOS');

  const [seleccion, setSeleccion] = useState<CarteraFila | null>(null);
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [banco, setBanco] = useState('BAC Credomatic');
  const [referencia, setReferencia] = useState('');
  const [titular, setTitular] = useState('');
  const [recibidoEfectivo, setRecibidoEfectivo] = useState('');
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<PreviewPago | null>(null);
  const [previewCargando, setPreviewCargando] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorCobro, setErrorCobro] = useState('');
  const [pago, setPago] = useState<Pago | null>(null);
  const [bancosLista, setBancosLista] = useState<CatBanco[]>([]);

  useEffect(() => {
    catalogoService
      .bancos()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setBancosLista(data);
          setBanco(data[0].nombre);
        }
      })
      .catch(() => {});
  }, []);

  const opcionesBancos = useMemo(() => {
    if (bancosLista.length > 0) {
      return bancosLista.map((b) => ({ value: b.nombre, label: b.nombre }));
    }
    return BANCOS_NICARAGUA;
  }, [bancosLista]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [agendaData, cajaData] = await Promise.all([
        dashboardService.agenda(busqueda.trim() ? { search: busqueda.trim() } : undefined),
        dashboardService.caja(),
      ]);
      setAgenda(agendaData);
      setCaja(cajaData);
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'No se pudo cargar la cobranza');
    } finally {
      setLoading(false);
    }
  }, [busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Conteo de Pasados (en mora o con atraso) vs En Fecha
  const totalPasados = useMemo(() => {
    return (agenda?.filas ?? []).filter(
      (f) => f.estado_efectivo === 'EN_MORA' || f.dias_atraso > 0 || Number(f.mora_pendiente) > 0
    ).length;
  }, [agenda]);

  const totalEnFecha = useMemo(() => {
    return (agenda?.filas ?? []).filter(
      (f) => !(f.estado_efectivo === 'EN_MORA' || f.dias_atraso > 0 || Number(f.mora_pendiente) > 0)
    ).length;
  }, [agenda]);

  const filas = useMemo(() => {
    const lista = agenda?.filas ?? [];
    if (filtro === 'EN_FECHA') {
      return lista.filter(
        (f) => !(f.estado_efectivo === 'EN_MORA' || f.dias_atraso > 0 || Number(f.mora_pendiente) > 0)
      );
    }
    if (filtro === 'PASADOS') {
      return lista.filter(
        (f) => f.estado_efectivo === 'EN_MORA' || f.dias_atraso > 0 || Number(f.mora_pendiente) > 0
      );
    }
    return lista;
  }, [agenda, filtro]);

  const montoNum = Number(monto) || 0;
  const minimoCiclo = preview ? Number(preview.minimo_ciclo) : 0;

  const validacion = useMemo(() => {
    const errores: string[] = [];
    if (montoNum <= 0) {
      errores.push('Ingrese un monto mayor a cero');
    } else if (minimoCiclo > 0 && montoNum < minimoCiclo) {
      errores.push(
        `El pago mínimo aceptado es el interés del ciclo (${fmtMonto(minimoCiclo)}).`
      );
    }
    if (!fechaPago) errores.push('Indique la fecha del pago');
    if (metodoPago === 'TRANSFERENCIA' && !referencia.trim()) {
      errores.push('Las transferencias requieren referencia bancaria');
    }
    return errores;
  }, [montoNum, minimoCiclo, fechaPago, metodoPago, referencia]);

  // Actualiza preview legal con debounce al cambiar monto
  useEffect(() => {
    if (!seleccion || montoNum <= 0) {
      setPreview(null);
      return;
    }
    let cancelado = false;
    setPreviewCargando(true);
    const timeout = setTimeout(async () => {
      try {
        const data = await prestamoService.previewPago(seleccion.id, monto);
        if (!cancelado) setPreview(data);
      } catch {
        if (!cancelado) setPreview(null);
      } finally {
        if (!cancelado) setPreviewCargando(false);
      }
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(timeout);
    };
  }, [seleccion, monto, montoNum]);

  const abrirCobro = (fila: CarteraFila) => {
    setSeleccion(fila);
    setMonto(String(Number(fila.cuota) || ''));
    setMetodoPago('EFECTIVO');
    setBanco('BAC Credomatic');
    setReferencia('');
    setTitular('');
    setRecibidoEfectivo('');
    setFechaPago(new Date().toISOString().slice(0, 10));
    setPreview(null);
    setErrorCobro('');
  };

  const cerrar = useCallback(() => {
    setSeleccion(null);
    setPreview(null);
    setErrorCobro('');
  }, []);

  const registrarPago = async () => {
    if (!seleccion || validacion.length > 0) return;
    setSubmitting(true);
    setErrorCobro('');
    try {
      const refFinal =
        metodoPago === 'TRANSFERENCIA'
          ? (banco ? `${banco} · Ref: ${referencia.trim()}${titular.trim() ? ` · Titular: ${titular.trim()}` : ''}` : referencia.trim())
          : referencia.trim();

      const bancoObj = bancosLista.find((b) => b.nombre === banco || String(b.id) === banco);
      const cambioMonto =
        Number(recibidoEfectivo) > montoNum && montoNum > 0
          ? (Number(recibidoEfectivo) - montoNum).toFixed(2)
          : undefined;

      const creado = await prestamoService.pagar(seleccion.id, {
        monto,
        fecha_pago: fechaPago,
        metodo_pago: metodoPago,
        banco_id: bancoObj?.id,
        referencia_bancaria: refFinal,
        efectivo_recibido: metodoPago === 'EFECTIVO' && recibidoEfectivo ? recibidoEfectivo : undefined,
        cambio_devuelto: metodoPago === 'EFECTIVO' ? cambioMonto : undefined,
      });
      setPago(creado);
      setSeleccion(null);
      toast.success(`Abono por ${fmtMonto(monto)} registrado exitosamente.`);
      await cargar();
    } catch (err: any) {
      const data = err.response?.data;
      let msg = 'No se pudo registrar el cobro';
      if (data?.monto) msg = (data.monto as string[]).join(' ');
      else if (data?.detail) msg = String(data.detail);
      setErrorCobro(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const resumen = agenda?.resumen;

  const FILTROS: { valor: Filtro; label: string; count: number; badgeCls: string }[] = [
    { valor: 'TODOS', label: 'Todos', count: agenda?.filas.length ?? 0, badgeCls: 'bg-slate-200 text-slate-700' },
    { valor: 'EN_FECHA', label: 'En Fecha', count: totalEnFecha, badgeCls: 'bg-emerald-100 text-emerald-800' },
    { valor: 'PASADOS', label: 'Pasados', count: totalPasados, badgeCls: 'bg-rose-100 text-rose-800' },
  ];

  return (
    <Layout titulo="Abonos y Cobranza">
      <PageHeader
        titulo="Abonos y Cobranza"
        descripcion="Agenda de recaudación y consulta de créditos en fecha vs. pasados"
        actions={
          <Button variant="secondary" icon="sync" onClick={cargar} loading={loading}>
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

      {/* Indicadores Clave de Cobranza (Bloques Compactos) */}
      <div class="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4 mb-2">
        <KpiTile
          label="Cobros Hoy"
          value={fmtMonto(caja?.total_recaudado)}
          icon="payments"
          tono="esmeralda"
          compact
          pie={`${fmtCantidad(caja?.recibos_emitidos)} recibos emitidos`}
        />
        <KpiTile
          label="Por Cobrar"
          value={fmtMonto(resumen?.saldo_total)}
          icon="account_balance_wallet"
          tono="ambar"
          compact
          pie={`${fmtCantidad(resumen?.cantidad)} creditos en total`}
        />
        <KpiTile
          label="En Fecha"
          value={fmtCantidad(totalEnFecha)}
          icon="task_alt"
          tono="esmeralda"
          compact
          pie="Al corriente / al día"
        />
        <KpiTile
          label="Pasados"
          value={fmtCantidad(totalPasados)}
          icon="priority_high"
          tono="rosa"
          compact
          pie="Vencidos / en mora"
        />
      </div>

      {esCobranza && (
        <p class="mt-3 flex items-center gap-2 text-body-sm text-slate-500">
          <Icon name="lock" size={16} />
          Vista restringida por privacidad: no incluye utilidades ni origen de los fondos.
        </p>
      )}

      {/* Barra de Filtros: En Fecha vs Pasados y Buscador */}
      <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap gap-2">
          {FILTROS.map((item) => (
            <button
              key={item.valor}
              type="button"
              onClick={() => setFiltro(item.valor)}
              class={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-label-md font-semibold transition-colors ${
                filtro === item.valor
                  ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span>{item.label}</span>
              <span
                class={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  filtro === item.valor ? 'bg-white/20 text-white' : item.badgeCls
                }`}
              >
                {item.count}
              </span>
            </button>
          ))}
        </div>
        <div class="relative sm:w-80">
          <Icon
            name="search"
            size={20}
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={busqueda}
            onInput={(e) => setBusqueda((e.target as HTMLInputElement).value)}
            placeholder="Buscar por cliente, cédula o dirección"
            aria-label="Buscar en agenda"
            class="w-full rounded-full border border-slate-200 bg-white py-2 pl-10 pr-4 text-body-md text-slate-800 outline-none transition-shadow focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
          />
        </div>
      </div>

      {/* Agenda de Abonos (Única sección principal) */}
      <div class="mt-4">
        {loading && !agenda ? (
          <div class="flex justify-center py-16">
            <Spinner size={40} />
          </div>
        ) : filas.length === 0 ? (
          <EmptyState
            icon="task_alt"
            title="Sin creditos para cobrar"
            description="No hay creditos que coincidan con el filtro seleccionado o la busqueda."
          />
        ) : (
          <ul class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filas.map((fila) => (
              <li
                key={fila.id}
                class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div class="flex items-start gap-3">
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-label-md font-bold text-white shadow-sm">
                      {iniciales(fila.cliente_nombre)}
                    </span>
                    <div class="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => abrirCobro(fila)}
                        class="truncate text-left text-body-md font-bold text-slate-900 hover:text-green-700 hover:underline block w-full"
                      >
                        {fila.cliente_nombre}
                      </button>
                      <p class="tnum text-body-sm text-slate-500 font-mono">Crédito #{fila.id}</p>
                    </div>
                    <StatusBadge estado={fila.estado} diasAtraso={fila.dias_atraso} />
                  </div>

                  {/* Resumen de Deuda y Cuota */}
                  <dl class="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2.5 text-body-sm border border-slate-100">
                    <div>
                      <dt class="text-xs text-slate-500">Deuda</dt>
                      <dd class="tnum font-bold text-slate-900 text-body-md">{fmtMonto(fila.saldo_deudor)}</dd>
                    </div>
                    <div>
                      <dt class="text-xs text-slate-500">Cuota</dt>
                      <dd class="tnum font-bold text-emerald-800 text-body-md">{fmtMonto(fila.cuota)}</dd>
                    </div>
                    <div class="pt-1 border-t border-slate-200/60">
                      <dt class="text-xs text-slate-500">Vencimiento</dt>
                      <dd class="tnum text-slate-700">{fmtFecha(fila.cuota_fecha)}</dd>
                    </div>
                    <div class="pt-1 border-t border-slate-200/60">
                      <dt class="text-xs text-slate-500">Período</dt>
                      <dd class="tnum text-slate-700">
                        {fila.cuota_periodo ?? '-'} de {fila.total_periodos}
                      </dd>
                    </div>
                  </dl>

                  <p class="mt-2.5 truncate text-body-sm text-slate-500">
                    {fila.cliente_telefono || 'Sin teléfono'} · {fila.cliente_direccion || 'Sin dirección'}
                  </p>

                  {/* Chips de Alerta por Mora o Interés */}
                  {(Number(fila.mora_pendiente) > 0 || Number(fila.interes_vencido) > 0) && (
                    <div class="mt-2.5 flex flex-wrap gap-1.5">
                      {Number(fila.mora_pendiente) > 0 && (
                        <span class="tnum rounded-md bg-red-100 text-red-800 px-2 py-0.5 text-label-xs font-bold">
                          Mora {fmtMonto(fila.mora_pendiente)} · {fila.dias_mora} dias
                        </span>
                      )}
                      {Number(fila.interes_vencido) > 0 && (
                        <span class="tnum rounded-md bg-amber-100 text-amber-800 px-2 py-0.5 text-label-xs font-bold">
                          Interes {fmtMonto(fila.interes_vencido)}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Botón Único de Acción Prioritaria */}
                <div class="mt-4 pt-3 border-t border-slate-100">
                  <Button
                    class="w-full"
                    icon="payments"
                    onClick={() => abrirCobro(fila)}
                    data-testid={`cobrar-${fila.id}`}
                  >
                    Registrar Abono
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* MODAL DE ABONO: INSPECCIÓN DE PENDIENTES Y COBRO */}
      <Modal
        open={!!seleccion}
        onClose={cerrar}
        title="Registrar Abono"
        subtitle={seleccion ? `${seleccion.cliente_nombre} · Préstamo #${seleccion.id}` : undefined}
        icon="payments"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={cerrar} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              onClick={registrarPago}
              loading={submitting}
              disabled={validacion.length > 0 || previewCargando || !preview?.es_valido}
            >
              Confirmar Cobro
            </Button>
          </>
        }
      >
        {seleccion && (
          <div class="space-y-4">
            {/* 1. FICHA DE PENDIENTES DEL PRESTATARIO */}
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div class="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <div class="flex items-center gap-2.5">
                  <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-xs shadow-sm">
                    {iniciales(seleccion.cliente_nombre)}
                  </span>
                  <div>
                    <h4 class="font-bold text-slate-900 text-body-md leading-tight">
                      {seleccion.cliente_nombre}
                    </h4>
                    <span class="text-xs text-slate-500 font-mono">Préstamo #{seleccion.id}</span>
                  </div>
                </div>
                {seleccion.cliente_telefono && (
                  <a
                    href={`tel:${seleccion.cliente_telefono.replace(/\D/g, '')}`}
                    class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-emerald-700 hover:border-slate-300 shadow-sm transition"
                    title="Llamar directamente al cliente"
                  >
                    <Icon name="phone" size={14} class="text-emerald-600" />
                    {seleccion.cliente_telefono}
                  </a>
                )}
              </div>

              {/* Grid de 4 Indicadores de lo que debe */}
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-body-sm">
                <div class="rounded-xl bg-white border border-slate-200/80 p-2.5 shadow-sm">
                  <span class="text-slate-500 text-xs block">Cuota del Ciclo</span>
                  <span class="tnum font-bold text-slate-900 text-body-md">
                    {fmtMonto(seleccion.cuota)}
                  </span>
                  <span class="text-[11px] text-slate-500 block">
                    Período {seleccion.cuota_periodo ?? '-'} de {seleccion.total_periodos}
                  </span>
                </div>

                <div class="rounded-xl bg-white border border-slate-200/80 p-2.5 shadow-sm">
                  <span class="text-slate-500 text-xs block">Vencimiento</span>
                  <span class="tnum font-semibold text-slate-800 text-body-sm">
                    {fmtFecha(seleccion.cuota_fecha)}
                  </span>
                  <span class="text-[11px] text-slate-500 block">
                    {seleccion.dias_atraso > 0 ? `${seleccion.dias_atraso} días atraso` : 'Al corriente'}
                  </span>
                </div>

                <div class="rounded-xl bg-white border border-slate-200/80 p-2.5 shadow-sm">
                  <span class="text-slate-500 text-xs block">Mora Exigible</span>
                  <span
                    class={`tnum font-bold text-body-md ${
                      Number(seleccion.mora_pendiente) > 0 ? 'text-red-600' : 'text-slate-700'
                    }`}
                  >
                    {fmtMonto(seleccion.mora_pendiente)}
                  </span>
                  <span class="text-[11px] text-slate-500 block">
                    {Number(seleccion.dias_mora) > 0 ? `${seleccion.dias_mora} días mora` : 'Sin recargo'}
                  </span>
                </div>

                <div class="rounded-xl bg-white border border-slate-200/80 p-2.5 shadow-sm">
                  <span class="text-slate-500 text-xs block">Deuda Total</span>
                  <span class="tnum font-bold text-slate-900 text-body-md">
                    {fmtMonto(seleccion.saldo_deudor)}
                  </span>
                  <span class="text-[11px] text-slate-500 block">Liquidación total</span>
                </div>
              </div>
            </div>

            {/* 2. CANAL DE PAGO: EFECTIVO VS TRANSFERENCIA */}
            <div>
              <div class="grid grid-cols-2 gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setMetodoPago('EFECTIVO')}
                  class={`flex items-center justify-center gap-2 rounded-xl border p-3 text-body-sm font-semibold transition ${
                    metodoPago === 'EFECTIVO'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-600/20'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon
                    name="payments"
                    size={20}
                    class={metodoPago === 'EFECTIVO' ? 'text-emerald-600' : 'text-slate-400'}
                  />
                  Efectivo Físico
                </button>
                <button
                  type="button"
                  onClick={() => setMetodoPago('TRANSFERENCIA')}
                  class={`flex items-center justify-center gap-2 rounded-xl border p-3 text-body-sm font-semibold transition ${
                    metodoPago === 'TRANSFERENCIA'
                      ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-600/20'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon
                    name="account_balance"
                    size={20}
                    class={metodoPago === 'TRANSFERENCIA' ? 'text-blue-600' : 'text-slate-400'}
                  />
                  Transferencia
                </button>
              </div>

              {/* Select para accesibilidad y sincronización */}
              <div class="sr-only">
                <Select
                  label="Metodo de pago"
                  value={metodoPago}
                  onChange={setMetodoPago}
                  options={METODOS}
                  required
                />
              </div>
            </div>

            {/* 3. MONTO CON ATAJOS RÁPIDOS */}
            <div class="space-y-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-label-md font-semibold text-slate-800">Importe del Abono</span>
                <span class="text-xs text-slate-500">
                  Deuda total: <strong class="text-slate-800">{fmtMonto(seleccion.saldo_deudor)}</strong>
                </span>
              </div>

              {/* Botones de sugerencias y adelanto de pago a un toque */}
              <div class="space-y-1.5">
                <span class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Opciones y Adelanto de Pago:
                </span>
                <div class="flex flex-wrap gap-2">
                  {Number(seleccion.cuota) > 0 && (
                    <button
                      type="button"
                      onClick={() => setMonto(String(Number(seleccion.cuota)))}
                      class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
                    >
                      + Pagar Cuota ({fmtMonto(seleccion.cuota)})
                    </button>
                  )}
                  {Number(seleccion.mora_pendiente) > 0 && Number(seleccion.cuota) > 0 && (
                    <button
                      type="button"
                      onClick={() => setMonto(String(Number(seleccion.cuota) + Number(seleccion.mora_pendiente)))}
                      class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-100"
                    >
                      + Mora y Cuota ({fmtMonto(Number(seleccion.cuota) + Number(seleccion.mora_pendiente))})
                    </button>
                  )}
                  {/* Adelanto de Cuotas Futuras */}
                  {Number(seleccion.cuota) > 0 && Number(seleccion.saldo_deudor) >= Number(seleccion.cuota) * 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        const m = (Number(seleccion.cuota) * 2) + Number(seleccion.mora_pendiente || 0);
                        setMonto(String(Math.min(m, Number(seleccion.saldo_deudor))));
                      }}
                      class="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 transition hover:bg-blue-100 flex items-center gap-1"
                    >
                      <Icon name="paid" size={14} class="text-blue-600" />
                      + Adelantar 2 Cuotas ({fmtMonto(Math.min((Number(seleccion.cuota) * 2) + Number(seleccion.mora_pendiente || 0), Number(seleccion.saldo_deudor)))})
                    </button>
                  )}
                  {Number(seleccion.cuota) > 0 && Number(seleccion.saldo_deudor) >= Number(seleccion.cuota) * 3 && (
                    <button
                      type="button"
                      onClick={() => {
                        const m = (Number(seleccion.cuota) * 3) + Number(seleccion.mora_pendiente || 0);
                        setMonto(String(Math.min(m, Number(seleccion.saldo_deudor))));
                      }}
                      class="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-800 transition hover:bg-indigo-100 flex items-center gap-1"
                    >
                      <Icon name="paid" size={14} class="text-indigo-600" />
                      + Adelantar 3 Cuotas ({fmtMonto(Math.min((Number(seleccion.cuota) * 3) + Number(seleccion.mora_pendiente || 0), Number(seleccion.saldo_deudor)))})
                    </button>
                  )}
                  {Number(seleccion.saldo_deudor) > 0 && (
                    <button
                      type="button"
                      onClick={() => setMonto(String(Number(seleccion.saldo_deudor)))}
                      class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                    >
                      + Liquidar Total ({fmtMonto(seleccion.saldo_deudor)})
                    </button>
                  )}
                </div>
              </div>

              {/* Aviso explicativo de amortización anticipada cuando se adelantan pagos */}
              {montoNum > (Number(seleccion.cuota) + Number(seleccion.mora_pendiente || 0)) && (
                <div class="rounded-lg bg-blue-50/80 border border-blue-200 p-2.5 text-xs text-blue-900 flex items-start gap-2">
                  <Icon name="trending_up" size={16} class="text-blue-700 shrink-0 mt-0.5" />
                  <div>
                    <span class="font-bold">Adelanto de Cuotas / Abono a Capital Activo:</span>{' '}
                    El excedente de C$ {(montoNum - Number(seleccion.cuota) - Number(seleccion.mora_pendiente || 0)).toFixed(2)} amortiza directamente el saldo de capital principal (Art. 3180 del Código Civil), reduciendo la base de cálculo de intereses en los ciclos siguientes.
                  </div>
                </div>
              )}

              <div class="grid gap-3 sm:grid-cols-2 pt-1">
                <Input
                  label="Monto a cobrar"
                  value={monto}
                  onInput={setMonto}
                  type="number"
                  step="0.01"
                  min="0.01"
                  prefix="C$"
                  placeholder="0.00"
                  required
                  hint={minimoCiclo > 0 ? `Mínimo aceptado: ${fmtMonto(minimoCiclo)}` : undefined}
                />
                <Input
                  label="Fecha del pago"
                  value={fechaPago}
                  onInput={setFechaPago}
                  type="date"
                  required
                />
              </div>
            </div>

            {/* 4. DETALLES POR MÉTODO DE PAGO */}
            {metodoPago === 'EFECTIVO' ? (
              <div class="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
                <div class="flex items-center gap-2 text-label-xs font-bold uppercase tracking-wider text-slate-600">
                  <Icon name="payments" size={16} class="text-emerald-600" />
                  Efectivo Físico (Afecta Arqueo Diario)
                </div>
                <div class="grid gap-3 sm:grid-cols-2 items-center">
                  <Input
                    label="Efectivo entregado por cliente"
                    value={recibidoEfectivo}
                    onInput={setRecibidoEfectivo}
                    type="number"
                    step="0.01"
                    prefix="C$"
                    placeholder="Para calcular vuelto"
                  />
                  {Number(recibidoEfectivo) > montoNum && montoNum > 0 ? (
                    <div class="flex flex-col justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
                      <span class="text-xs font-semibold text-emerald-800">Cambio / Vuelto a entregar</span>
                      <span class="tnum text-lg font-bold text-emerald-700">
                        {fmtMonto(Number(recibidoEfectivo) - montoNum)}
                      </span>
                    </div>
                  ) : (
                    <div class="text-xs text-slate-500">
                      El dinero ingresa directamente a caja física para el arqueo del cobrador.
                    </div>
                  )}
                </div>
              </div>
            ) : metodoPago === 'TRANSFERENCIA' ? (
              <div class="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 space-y-3">
                <div class="flex items-center gap-2 text-label-xs font-bold uppercase tracking-wider text-blue-900">
                  <Icon name="account_balance" size={16} class="text-blue-600" />
                  Detalle de la Transacción Bancaria
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Banco receptor"
                    value={banco}
                    onChange={setBanco}
                    options={opcionesBancos}
                    required
                  />
                  <Input
                    label="Referencia bancaria"
                    value={referencia}
                    onInput={setReferencia}
                    placeholder="No. de transacción o voucher"
                    required
                    hint="Comprobante único emitido por el banco"
                  />
                </div>
                <Input
                  label="Titular / Remitente (opcional)"
                  value={titular}
                  onInput={setTitular}
                  placeholder="Nombre de quien realizó la transferencia (si fue un tercero)"
                  hint="Útil para conciliar cuando un familiar paga por el cliente"
                />
              </div>
            ) : null}

            {/* 5. PREVISUALIZACIÓN IMPUTACIÓN ART. 3180 */}
            {previewCargando && (
              <p class="flex items-center gap-2 text-body-sm text-slate-500">
                <Spinner size={16} /> Calculando imputación legal...
              </p>
            )}

            {preview && !previewCargando && <Prelacion preview={preview} esCobranza={esCobranza} />}

            {validacion.map((mensaje) => (
              <p key={mensaje} class="flex items-start gap-2 text-body-sm text-red-600">
                <Icon name="warning" size={16} class="mt-0.5 shrink-0" />
                {mensaje}
              </p>
            ))}

            {preview && !preview.es_valido && preview.error?.monto && (
              <p class="flex items-start gap-2 text-body-sm text-red-600">
                <Icon name="warning" size={16} class="mt-0.5 shrink-0" />
                {preview.error.monto}
              </p>
            )}

            {errorCobro && (
              <p class="flex items-start gap-2 text-body-sm text-red-600">
                <Icon name="warning" size={16} class="mt-0.5 shrink-0" />
                {errorCobro}
              </p>
            )}

            <p class="text-body-sm text-slate-500">
              El pago se imputa en orden estricto: mora acumulada, intereses corrientes y finalmente capital insoluto.
            </p>
          </div>
        )}
      </Modal>

      {pago && <PagoRecibo pagoId={pago.id} onClose={() => setPago(null)} />}
    </Layout>
  );
}
