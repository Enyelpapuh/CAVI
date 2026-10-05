import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { PagoRecibo } from '../components/PagoRecibo';
import { Card, KpiTile, Button, Icon, Input, Select, Modal, Spinner, EmptyState, StatusBadge } from '../components/ui';
import { prestamoService, dashboardService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fmtMonto, fmtCantidad, fmtPorcentaje, fmtFecha, fmtFechaHora, iniciales } from '../lib/format';
import type { CarteraFila, CajaCobrador, AgendaCobrador, PreviewPago, Pago } from '../types';

type Pestana = 'agenda' | 'caja';
type Filtro = 'TODOS' | 'EN_MORA' | 'EN_GRACIA' | 'AL_DIA';

const FILTROS: { valor: Filtro; label: string }[] = [
  { valor: 'TODOS', label: 'Todos' },
  { valor: 'EN_MORA', label: 'En Mora' },
  { valor: 'EN_GRACIA', label: 'En Gracia' },
  { valor: 'AL_DIA', label: 'Al Dia' },
];

const METODOS = [
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTRO', label: 'Otro' },
];

/** Desglose de prelación del Art. 3180 que devuelve el preview del backend. */
function Prelacion({ preview }: { preview: PreviewPago }) {
  const filas: [string, string, string?][] = [
    ['Mora', preview.aplicacion_mora],
    ['Interés corriente', preview.aplicacion_interes],
    ['Capital', preview.aplicacion_capital],
  ];
  return (
    <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p class="text-label-sm uppercase text-slate-500">Imputación Art. 3180</p>
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
      {Number(preview.exceso_no_aplicado) > 0 && (
        <p class="mt-2 text-body-sm text-amber-700">
          El excedente se devuelve al cliente: el pago no puede rebasar la deuda total.
        </p>
      )}
      {preview.detalle_mora && preview.detalle_mora.dias_mora > 0 && (
        <p class="mt-2 text-body-sm text-red-700">
          Mora de {preview.detalle_mora.dias_mora} dias fuera de gracia al{' '}
          {fmtPorcentaje(Number(preview.detalle_mora.tasa_mora_mensual) * 100, 2)} mensual
          (Art. 3184). Se cobra antes que el interes.
        </p>
      )}
    </div>
  );
}

export function CobrosPage() {
  const { user } = useAuth();
  const esCobranza = user?.rol === 'COBRANZA';

  const [pestana, setPestana] = useState<Pestana>('agenda');
  const [agenda, setAgenda] = useState<AgendaCobrador | null>(null);
  const [caja, setCaja] = useState<CajaCobrador | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('TODOS');

  const [seleccion, setSeleccion] = useState<CarteraFila | null>(null);
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [referencia, setReferencia] = useState('');
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<PreviewPago | null>(null);
  const [previewCargando, setPreviewCargando] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorCobro, setErrorCobro] = useState('');
  const [pago, setPago] = useState<Pago | null>(null);

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

  const filas = useMemo(() => {
    const lista = agenda?.filas ?? [];
    if (filtro === 'TODOS') return lista;
    return lista.filter((fila) => fila.estado_efectivo === filtro);
  }, [agenda, filtro]);

  const montoNum = Number(monto) || 0;
  const minimoCiclo = preview ? Number(preview.minimo_ciclo) : 0;

  const validacion = useMemo(() => {
    const errores: string[] = [];
    if (montoNum <= 0) {
      errores.push('Ingrese un monto mayor a cero');
    } else if (minimoCiclo > 0 && montoNum < minimoCiclo) {
      errores.push(
        `El pago mínimo aceptado es el interés del ciclo (${fmtMonto(minimoCiclo)}). Art. 3180 del Código Civil.`
      );
    }
    if (!fechaPago) errores.push('Indique la fecha del pago');
    if (metodoPago === 'TRANSFERENCIA' && !referencia.trim()) {
      errores.push('Las transferencias requieren referencia bancaria');
    }
    return errores;
  }, [montoNum, minimoCiclo, fechaPago, metodoPago, referencia]);

  /** Consulta el preview de prelación mientras el cobrador escribe el monto. */
  useEffect(() => {
    if (!seleccion || montoNum <= 0) {
      setPreview(null);
      return;
    }
    let vigente = true;
    setPreviewCargando(true);
    const temporizador = setTimeout(() => {
      prestamoService
        .previewPago(seleccion.id, monto)
        .then((data) => {
          if (vigente) {
            setPreview(data);
            setErrorCobro('');
          }
        })
        .catch(() => {
          if (vigente) setPreview(null);
        })
        .finally(() => {
          if (vigente) setPreviewCargando(false);
        });
    }, 350);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [seleccion, monto, montoNum]);

  const abrirCobro = (fila: CarteraFila) => {
    setSeleccion(fila);
    setMonto('');
    setMetodoPago('EFECTIVO');
    setReferencia('');
    setFechaPago(new Date().toISOString().slice(0, 10));
    setPreview(null);
    setErrorCobro('');
  };

  const cerrar = () => {
    setSeleccion(null);
    setPreview(null);
    setErrorCobro('');
  };

  const registrarPago = async () => {
    if (!seleccion || validacion.length > 0) return;
    setSubmitting(true);
    setErrorCobro('');
    try {
      const creado = await prestamoService.pagar(seleccion.id, {
        monto,
        fecha_pago: fechaPago,
        metodo_pago: metodoPago,
        referencia_bancaria: referencia,
      });
      setPago(creado);
      setSeleccion(null);
      await cargar();
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.monto) setErrorCobro((data.monto as string[]).join(' '));
      else if (data?.detail) setErrorCobro(String(data.detail));
      else setErrorCobro('No se pudo registrar el cobro');
    } finally {
      setSubmitting(false);
    }
  };

  const resumen = agenda?.resumen;

  return (
    <Layout titulo="Cobranza">
      <PageHeader
        titulo="Gestion de Cobranza"
        descripcion="El abono se imputa primero a mora, luego interes corriente y despues capital (Art. 3180 C.C.)"
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

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Cobros Hoy"
          value={fmtMonto(caja?.total_recaudado)}
          icon="payments"
          tono="esmeralda"
          pie={`${fmtCantidad(caja?.recibos_emitidos)} recibos`}
        />
        <KpiTile
          label="Por Cobrar"
          value={fmtMonto(resumen?.saldo_total)}
          icon="account_balance_wallet"
          tono="ambar"
          pie={`${fmtCantidad(resumen?.cantidad)} creditos`}
        />
        <KpiTile
          label="En Mora"
          value={fmtCantidad(resumen?.en_mora)}
          icon="priority_high"
          tono="rosa"
          pie={`${fmtPorcentaje(resumen?.porcentaje_sano, 0)} sano`}
        />
        <KpiTile
          label="En Gracia"
          value={fmtCantidad(resumen?.en_gracia)}
          icon="schedule"
          tono="neutro"
          pie="4 dias de gracia"
        />
      </div>

      {esCobranza && (
        <p class="mt-3 flex items-center gap-2 text-body-sm text-slate-500">
          <Icon name="lock" size={16} />
          Vista restringida por privacidad (Ley 787): no incluye utilidades ni origen de los fondos.
        </p>
      )}

      <div class="mt-6 flex gap-1 border-b border-slate-200">
        {(
          [
            { valor: 'agenda', label: 'Agenda', icono: 'point_of_sale' },
            { valor: 'caja', label: 'Mi Caja', icono: 'account_balance_wallet' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.valor}
            type="button"
            onClick={() => setPestana(tab.valor)}
            aria-current={pestana === tab.valor}
            class={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-label-md font-medium transition-colors ${
              pestana === tab.valor
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon name={tab.icono} size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {pestana === 'agenda' ? (
        <>
          <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                placeholder="Buscar por cliente o direccion"
                aria-label="Buscar en agenda"
                class="w-full rounded-full border border-slate-200 bg-white py-2 pl-10 pr-4 text-body-md text-slate-800 outline-none transition-shadow focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
          </div>

          <div class="mt-4">
            {loading && !agenda ? (
              <div class="flex justify-center py-16">
                <Spinner size={40} />
              </div>
            ) : filas.length === 0 ? (
              <EmptyState
                icon="task_alt"
                title="Sin creditos para cobrar"
                description="No hay creditos que coincidan con el filtro o la busqueda."
              />
            ) : (
              <ul class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filas.map((fila) => (
                  <li key={fila.id} class="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
                    <div class="flex items-start gap-3">
                      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-label-md font-bold text-slate-600">
                        {iniciales(fila.cliente_nombre)}
                      </span>
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-body-md font-semibold text-slate-900">{fila.cliente_nombre}</p>
                        <p class="tnum text-body-sm text-slate-500">#{fila.id}</p>
                      </div>
                      <StatusBadge estado={fila.estado} diasAtraso={fila.dias_atraso} />
                    </div>

                    <dl class="mt-3 grid grid-cols-2 gap-2 text-body-sm">
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

                    <p class="mt-2 truncate text-body-sm text-slate-500">
                      {fila.cliente_telefono || 'Sin telefono'} · {fila.cliente_direccion || 'Sin direccion'}
                    </p>

                    {(Number(fila.mora_pendiente) > 0 || Number(fila.interes_vencido) > 0) && (
                      <div class="mt-2 flex flex-wrap gap-2">
                        {Number(fila.mora_pendiente) > 0 && (
                          <span class="tnum rounded-full bg-red-50 px-2 py-0.5 text-label-xs font-medium text-red-700">
                            Mora {fmtMonto(fila.mora_pendiente)} · {fila.dias_mora} dias
                          </span>
                        )}
                        {Number(fila.interes_vencido) > 0 && (
                          <span class="tnum rounded-full bg-amber-50 px-2 py-0.5 text-label-xs font-medium text-amber-700">
                            Interes {fmtMonto(fila.interes_vencido)}
                          </span>
                        )}
                      </div>
                    )}

                    <Button
                      class="mt-3 w-full"
                      icon="payments"
                      onClick={() => abrirCobro(fila)}
                      data-testid={`cobrar-${fila.id}`}
                    >
                      Registrar Cobro
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div class="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title="Recaudos de hoy" subtitle={caja ? `Corte del ${fmtFecha(caja.fecha)}` : undefined}>
            <p class="tnum text-headline-lg font-extrabold text-slate-900">
              {fmtMonto(caja?.total_recaudado)}
            </p>
            <p class="mt-1 text-body-sm text-slate-500">
              {fmtCantidad(caja?.recibos_emitidos)} recibos emitidos por {caja?.usuario || 'usted'}
            </p>
            <p class="mt-3 text-body-sm text-slate-600">
              Creditos vigentes en cartera: {fmtCantidad(caja?.creditos_vigentes)}
            </p>
          </Card>

          <Card title="Por metodo de pago">
            {Object.keys(caja?.por_metodo ?? {}).length === 0 ? (
              <EmptyState icon="account_balance_wallet" title="Sin recaudos hoy" />
            ) : (
              <ul class="space-y-2">
                {Object.entries(caja!.por_metodo).map(([metodo, dato]) => (
                  <li key={metodo} class="flex items-center justify-between text-body-md">
                    <span class="text-slate-600">{dato.label}</span>
                    <span class="tnum font-semibold text-slate-900">{fmtMonto(dato.monto)}</span>
                  </li>
                ))}
              </ul>
            )}
            {caja && (
              <p class="mt-4 border-t border-slate-100 pt-3 text-body-sm text-slate-500">
                Actualizado {fmtFechaHora(new Date().toISOString())}
              </p>
            )}
          </Card>
        </div>
      )}

      <Modal
        open={!!seleccion}
        onClose={cerrar}
        title="Registrar Cobro"
        subtitle={seleccion ? `${seleccion.cliente_nombre} · #${seleccion.id}` : undefined}
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
            <div class="grid gap-3 sm:grid-cols-2">
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
                hint={`Deuda total: ${fmtMonto(seleccion.saldo_deudor)}`}
              />
              <Select
                label="Metodo de pago"
                value={metodoPago}
                onChange={setMetodoPago}
                options={METODOS}
                required
              />
              {metodoPago === 'TRANSFERENCIA' && (
                <Input
                  label="Referencia bancaria"
                  value={referencia}
                  onInput={setReferencia}
                  placeholder="No. de transferencia"
                  required
                />
              )}
              <Input label="Fecha del pago" value={fechaPago} onInput={setFechaPago} type="date" required />
            </div>

            {previewCargando && (
              <p class="flex items-center gap-2 text-body-sm text-slate-500">
                <Spinner size={16} /> Calculando imputacion...
              </p>
            )}

            {preview && !previewCargando && (
              <Prelacion preview={preview} />
            )}

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
              Art. 3180 C.C.: el pago se imputa a mora, luego a intereses y por ultimo al capital.
            </p>
          </div>
        )}
      </Modal>

      {pago && <PagoRecibo pagoId={pago.id} onClose={() => setPago(null)} />}
    </Layout>
  );
}
