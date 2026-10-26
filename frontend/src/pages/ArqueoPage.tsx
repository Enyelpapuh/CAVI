import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, DataTable, Icon, Input, Select, Spinner, Modal, StatusBadge, useToast, type Columna } from '../components/ui';
import { pagoService, usuarioService, cajaService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fmtMonto, fmtCantidad, fmtFecha } from '../lib/format';
import type { Pago, Usuario, SesionCaja } from '../types';
import { PagoRecibo } from '../components/PagoRecibo';

const HOY = new Date().toISOString().slice(0, 10);

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CHEQUE: 'Cheque',
  OTRO: 'Otro',
};

export function ArqueoPage() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'ADMINISTRADOR';
  const toast = useToast();

  const [fecha, setFecha] = useState(HOY);
  const [usuarioFiltro, setUsuarioFiltro] = useState<string>('TODOS');
  
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [pagoSeleccionado, setPagoSeleccionado] = useState<number | null>(null);

  // Control de Sesión de Caja (Turnos de Cobro)
  const [sesionActiva, setSesionActiva] = useState<SesionCaja | null>(null);
  const [modalApertura, setModalApertura] = useState(false);
  const [modalCierre, setModalCierre] = useState(false);
  const [saldoInicial, setSaldoInicial] = useState('0.00');
  const [efectivoDeclarado, setEfectivoDeclarado] = useState('');
  const [obsCierre, setObsCierre] = useState('');
  const [cajaSubmitting, setCajaSubmitting] = useState(false);

  const cerrarApertura = useCallback(() => setModalApertura(false), []);
  const cerrarCierre = useCallback(() => setModalCierre(false), []);

  const cargarSesion = async () => {
    try {
      const resp = await cajaService.activa();
      setSesionActiva(resp.activa ? resp.sesion : null);
    } catch {
      // Ignorar si falla
    }
  };

  useEffect(() => {
    cargarSesion();
  }, []);

  const handleApertura = async (e: Event) => {
    e.preventDefault();
    setCajaSubmitting(true);
    try {
      const nueva = await cajaService.apertura({
        saldo_inicial_efectivo: saldoInicial,
        observaciones: 'Apertura de turno de ruta',
      });
      setSesionActiva(nueva);
      setModalApertura(false);
      toast.success('Turno de caja aperturado con éxito');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error al aperturar caja');
    } finally {
      setCajaSubmitting(false);
    }
  };

  const handleCierre = async (e: Event) => {
    e.preventDefault();
    if (!sesionActiva) return;
    setCajaSubmitting(true);
    try {
      const cerrada = await cajaService.cierre(sesionActiva.id, {
        efectivo_declarado: efectivoDeclarado,
        observaciones: obsCierre,
      });
      setSesionActiva(null);
      setModalCierre(false);
      const diff = Number(cerrada.diferencia);
      if (diff === 0) {
        toast.success('Caja cerrada y conciliada al centavo (C$0.00 de diferencia)');
      } else if (diff > 0) {
        toast.success(`Caja cerrada con sobrante de ${fmtMonto(diff)}`);
      } else {
        toast.warning(`Caja cerrada con faltante de ${fmtMonto(Math.abs(diff))}`);
      }
      cargarPagos();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error al cerrar caja');
    } finally {
      setCajaSubmitting(false);
    }
  };

  // Cargar lista de usuarios (solo si es admin) para el filtro
  useEffect(() => {
    if (esAdmin) {
      usuarioService.list().then((data) => {
        if (Array.isArray(data)) setUsuarios(data);
        else setUsuarios(data.results || []);
      }).catch(() => {
        toast.error('No se pudo cargar la lista de cobradores');
      });
    } else {
      setUsuarioFiltro(String(user?.id || 'TODOS'));
    }
  }, [esAdmin, user]);

  const cargarPagos = async () => {
    setLoading(true);
    try {
      const params: any = { fecha };
      if (usuarioFiltro !== 'TODOS') {
        params.usuario = parseInt(usuarioFiltro, 10);
      } else if (!esAdmin) {
        params.usuario = user?.id; // Si no es admin, forzar su propio ID
      }

      // Obtener todas las páginas
      let todos: Pago[] = [];
      let currentPage = 1;
      let hasNext = true;

      while (hasNext) {
        const data = await pagoService.list({ ...params, page: currentPage });
        if (Array.isArray(data)) {
          todos = data;
          hasNext = false;
        } else {
          todos = [...todos, ...data.results];
          hasNext = !!data.next;
          currentPage++;
        }
      }
      setPagos(todos);
    } catch (err) {
      toast.error('Error al cargar los recibos del día');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarPagos();
  }, [fecha, usuarioFiltro, esAdmin, user]);

  // Agregar totales
  const { totalGeneral, porMetodo } = useMemo(() => {
    let total = 0;
    const metodos: Record<string, number> = {
      EFECTIVO: 0,
      TRANSFERENCIA: 0,
      CHEQUE: 0,
      OTRO: 0,
    };

    pagos.forEach((pago) => {
      const monto = Number(pago.monto_total) || 0;
      total += monto;
      if (metodos[pago.metodo_pago] !== undefined) {
        metodos[pago.metodo_pago] += monto;
      } else {
        metodos.OTRO += monto;
      }
    });

    return { totalGeneral: total, porMetodo: metodos };
  }, [pagos]);

  const columnas: Columna<Pago>[] = [
    {
      key: 'comprobante',
      header: 'Comprobante',
      width: '120px',
      render: (p) => <span class="tnum font-mono text-slate-900">{p.codigo_comprobante}</span>,
    },
    {
      key: 'cliente',
      header: 'Cliente / Préstamo',
      render: (p) => (
        <div class="min-w-0">
          <p class="truncate font-medium text-slate-900">{p.prestamo_cliente}</p>
          <p class="text-body-sm text-slate-500">Préstamo #{p.prestamo}</p>
        </div>
      ),
    },
    {
      key: 'usuario',
      header: 'Cobrador',
      render: (p) => <span class="text-slate-700">{p.usuario_nombre}</span>,
    },
    {
      key: 'metodo',
      header: 'Método',
      width: '140px',
      render: (p) => (
        <span class="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-label-xs font-semibold text-slate-700">
          <Icon name={p.metodo_pago === 'EFECTIVO' ? 'payments' : p.metodo_pago === 'TRANSFERENCIA' ? 'account_balance' : 'receipt'} size={14} />
          {METODO_LABEL[p.metodo_pago] || p.metodo_pago}
        </span>
      ),
    },
    {
      key: 'monto',
      header: 'Total Cobrado',
      align: 'right',
      width: '140px',
      render: (p) => <span class="tnum font-bold text-green-700">{fmtMonto(p.monto_total)}</span>,
    },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      width: '110px',
      render: (p) => (
        <Button variant="ghost" size="sm" icon="receipt_long" onClick={() => setPagoSeleccionado(p.id)}>
          Ver
        </Button>
      ),
    },
  ];

  // Si el usuario no es admin, ocultamos la columna Cobrador
  const columnasVisibles = esAdmin ? columnas : columnas.filter((c) => c.key !== 'usuario');

  const opcionesUsuarios = [
    { value: 'TODOS', label: 'Todos los cobradores' },
    ...usuarios.map((u) => ({ value: String(u.id), label: u.nombre_completo }))
  ];

  return (
    <Layout titulo="Arqueo y Liquidación">
      <PageHeader
        titulo="Arqueo y Liquidación"
        descripcion="Cierre de caja, validación de ingresos y conciliación de recibos emitidos."
        actions={
          <Button icon="print" onClick={() => window.print()}>
            Imprimir Arqueo
          </Button>
        }
      />

      {/* Estado del Turno de Caja */}
      <div class="print:hidden mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex items-center gap-3">
          <div
            class={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-inner ${
              sesionActiva ? 'bg-emerald-600' : 'bg-slate-400'
            }`}
          >
            <Icon name="point_of_sale" size={22} />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-body-md font-bold text-slate-900">
                {sesionActiva ? 'Turno de Caja Abierto' : 'Sin Turno de Caja Activo'}
              </h3>
              <StatusBadge
                variant={sesionActiva ? 'activo' : 'inactivo'}
                label={sesionActiva ? 'Abierta' : 'Cerrada'}
              />
            </div>
            <p class="text-body-xs text-slate-500">
              {sesionActiva
                ? `Fondo de cambio: ${fmtMonto(sesionActiva.saldo_inicial_efectivo)} · Abierta por ${sesionActiva.usuario_nombre}`
                : 'Aperture un turno de caja para registrar el fondo de cambio antes de salir a cobrar.'}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          {sesionActiva ? (
            <Button
              variant="danger"
              icon="lock"
              size="sm"
              onClick={() => {
                setEfectivoDeclarado('');
                setObsCierre('');
                setModalCierre(true);
              }}
            >
              Cierre de Caja y Arqueo
            </Button>
          ) : (
            <Button
              variant="primary"
              icon="add"
              size="sm"
              onClick={() => {
                setSaldoInicial('0.00');
                setModalApertura(true);
              }}
            >
              Aperturar Turno
            </Button>
          )}
        </div>
      </div>

      <div class="print:hidden mb-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <div class="flex-1 sm:max-w-xs">
          <Input
            label="Fecha de Arqueo"
            type="date"
            value={fecha}
            onInput={setFecha}
          />
        </div>
        {esAdmin && (
          <div class="flex-1 sm:max-w-xs">
            <Select
              label="Cobrador / Ruta"
              options={opcionesUsuarios}
              value={usuarioFiltro}
              onChange={setUsuarioFiltro}
            />
          </div>
        )}
        <Button variant="secondary" icon="sync" onClick={cargarPagos} loading={loading}>
          Actualizar
        </Button>
      </div>

      {/* Solo visible al imprimir */}
      <div class="hidden print:block mb-6 border-b border-slate-300 pb-4">
        <h2 class="text-xl font-bold">Reporte de Arqueo Diario</h2>
        <p class="text-slate-600">Fecha: {fmtFecha(fecha)}</p>
        <p class="text-slate-600">
          Generado por: {user?.nombre_completo}
        </p>
        {esAdmin && usuarioFiltro !== 'TODOS' && (
          <p class="text-slate-600">
            Filtrado por: {usuarios.find(u => String(u.id) === usuarioFiltro)?.nombre_completo}
          </p>
        )}
      </div>

      {loading ? (
        <div class="flex justify-center py-16">
          <Spinner size={40} />
        </div>
      ) : (
        <>
          <div class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card class="flex items-center gap-4 bg-green-50 border-green-200 print:bg-transparent print:border-slate-300 print:shadow-none">
              <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 print:hidden">
                <Icon name="point_of_sale" size={24} />
              </span>
              <div class="min-w-0">
                <p class="text-label-sm uppercase text-green-800 print:text-slate-500">Recaudado (Total)</p>
                <p class="tnum truncate text-headline-sm font-bold text-green-900 print:text-slate-900">{fmtMonto(totalGeneral)}</p>
              </div>
            </Card>
            
            <Card class="flex items-center gap-4 print:border-slate-300 print:shadow-none">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 print:hidden">
                <Icon name="payments" size={20} />
              </span>
              <div class="min-w-0">
                <p class="text-label-sm uppercase text-slate-500">Efectivo Físico</p>
                <p class="tnum truncate text-headline-sm font-bold text-slate-900">{fmtMonto(porMetodo.EFECTIVO)}</p>
              </div>
            </Card>

            <Card class="flex items-center gap-4 print:border-slate-300 print:shadow-none">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 print:hidden">
                <Icon name="account_balance" size={20} />
              </span>
              <div class="min-w-0">
                <p class="text-label-sm uppercase text-slate-500">Transferencias</p>
                <p class="tnum truncate text-headline-sm font-bold text-slate-900">{fmtMonto(porMetodo.TRANSFERENCIA)}</p>
              </div>
            </Card>

            <Card class="flex items-center gap-4 print:border-slate-300 print:shadow-none">
              <div class="min-w-0">
                <p class="text-label-sm uppercase text-slate-500">Volumen</p>
                <p class="tnum truncate text-headline-sm font-bold text-slate-900">
                  {fmtCantidad(pagos.length)} recibos
                </p>
              </div>
            </Card>
          </div>

          <Card padded={false} class="print:shadow-none print:border-slate-300">
            <DataTable
              columns={columnasVisibles}
              rows={pagos}
              getKey={(p) => p.id}
              caption={`Desglose de recibos emitidos el ${fmtFecha(fecha)}`}
              loading={loading}
              emptyTitle="No hay recaudación"
              emptyDescription={`No se encontraron pagos registrados para la fecha ${fmtFecha(fecha)}.`}
            />
          </Card>
        </>
      )}

      {pagoSeleccionado && (
        <PagoRecibo pagoId={pagoSeleccionado} onClose={() => setPagoSeleccionado(null)} />
      )}

      {/* Modal Apertura de Caja */}
      <Modal
        open={modalApertura}
        onClose={cerrarApertura}
        title="Apertura de Turno de Caja"
        icon="point_of_sale"
        footer={
          <>
            <Button variant="ghost" onClick={cerrarApertura} disabled={cajaSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" form="form-apertura" loading={cajaSubmitting}>
              Habilitar Caja
            </Button>
          </>
        }
      >
        <form id="form-apertura" onSubmit={handleApertura} class="space-y-4">
          <p class="text-body-sm text-slate-600">
            Indique el fondo de cambio en efectivo entregado para iniciar la jornada de cobranza.
          </p>
          <Input
            label="Fondo de cambio inicial"
            type="number"
            step="0.01"
            min="0"
            prefix="C$"
            value={saldoInicial}
            onInput={setSaldoInicial}
            required
            hint="Monto en monedas y billetes para dar vuelto"
          />
        </form>
      </Modal>

      {/* Modal Cierre de Caja y Arqueo */}
      <Modal
        open={modalCierre}
        onClose={cerrarCierre}
        title="Cierre de Turno y Conciliación Física"
        icon="lock"
        footer={
          <>
            <Button variant="ghost" onClick={cerrarCierre} disabled={cajaSubmitting}>
              Cancelar
            </Button>
            <Button variant="danger" type="submit" form="form-cierre" loading={cajaSubmitting}>
              Finalizar y Cerrar Turno
            </Button>
          </>
        }
      >
        <form id="form-cierre" onSubmit={handleCierre} class="space-y-4">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1 text-body-sm">
            <div class="flex justify-between">
              <span class="text-slate-500">Fondo Inicial:</span>
              <span class="font-bold text-slate-900">{fmtMonto(sesionActiva?.saldo_inicial_efectivo || 0)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Cobrado en Efectivo Hoy:</span>
              <span class="font-bold text-emerald-700">{fmtMonto(porMetodo.EFECTIVO)}</span>
            </div>
            <div class="flex justify-between border-t border-slate-200 pt-1 text-body-md font-bold">
              <span class="text-slate-700">Efectivo Total Esperado:</span>
              <span class="text-slate-900">
                {fmtMonto(Number(sesionActiva?.saldo_inicial_efectivo || 0) + porMetodo.EFECTIVO)}
              </span>
            </div>
          </div>

          <Input
            label="Efectivo físico contado en mano"
            type="number"
            step="0.01"
            min="0"
            prefix="C$"
            value={efectivoDeclarado}
            onInput={setEfectivoDeclarado}
            required
            placeholder="0.00"
            hint="Suma de billetes y monedas físicos en posesión"
          />

          {efectivoDeclarado && (
            <div class="rounded-xl p-3 border text-body-sm font-semibold">
              {(() => {
                const esperado = Number(sesionActiva?.saldo_inicial_efectivo || 0) + porMetodo.EFECTIVO;
                const contado = Number(efectivoDeclarado) || 0;
                const dif = contado - esperado;
                if (dif === 0) {
                  return (
                    <div class="text-emerald-700 bg-emerald-50 border-emerald-200 p-2 rounded-lg">
                      Conciliación exacta: C$0.00 de diferencia.
                    </div>
                  );
                } else if (dif > 0) {
                  return (
                    <div class="text-amber-800 bg-amber-50 border-amber-200 p-2 rounded-lg">
                      Sobrante de caja: +{fmtMonto(dif)}
                    </div>
                  );
                } else {
                  return (
                    <div class="text-rose-700 bg-rose-50 border-rose-200 p-2 rounded-lg">
                      Faltante de caja: -{fmtMonto(Math.abs(dif))}
                    </div>
                  );
                }
              })()}
            </div>
          )}

          <Input
            label="Observaciones de Cierre (Opcional)"
            value={obsCierre}
            onInput={setObsCierre}
            placeholder="Justificación de sobrante/faltante o notas de entrega"
          />
        </form>
      </Modal>
    </Layout>
  );
}
