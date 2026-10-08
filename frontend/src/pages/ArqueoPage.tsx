import { useState, useEffect, useMemo } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, DataTable, Icon, Input, Select, Spinner, EmptyState, useToast, type Columna } from '../components/ui';
import { pagoService, usuarioService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fmtMonto, fmtCantidad, fmtFecha } from '../lib/format';
import type { Pago, Usuario } from '../types';
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
    </Layout>
  );
}
