import { useState, useEffect } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, KpiTile, Button, Icon, Spinner, EmptyState } from '../components/ui';
import { dashboardService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../lib/router';
import { fmtMonto, fmtCantidad, fmtFecha } from '../lib/format';
import type { Dashboard } from '../types';

export function DashboardPage() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'ADMINISTRADOR';
  const { navigate } = useRouter();

  const [datos, setDatos] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
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
    { label: 'Alta de Cliente', icon: 'person_add', color: 'bg-blue-600', path: '/clientes' },
    { label: 'Arqueo de Caja', icon: 'point_of_sale', color: 'bg-amber-500', path: '/reportes/arqueo' },
  ];

  const ACCIONES_COBRANZA = [
    { label: 'Cobrar en Ruta', icon: 'payments', color: 'bg-emerald-600', path: '/cobros' },
    { label: 'Mi Arqueo del Día', icon: 'point_of_sale', color: 'bg-amber-500', path: '/reportes/arqueo' },
  ];

  const acciones = esAdmin ? ACCIONES_ADMIN : ACCIONES_COBRANZA;

  return (
    <Layout titulo="Inicio">
      <PageHeader
        titulo={`Hola, ${user?.nombre_completo.split(' ')[0] || 'Usuario'}`}
        descripcion={`Centro Operativo del Día · ${datos ? fmtFecha(datos.fecha) : 'Gestión de cobros y atención diaria'}`}
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
              class="group flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-95"
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
          {/* Operación del Día: Recaudación y Estado de Cartera Activa */}
          <div>
            <h2 class="mb-3 text-label-sm font-semibold uppercase tracking-wider text-slate-500">
              Operación y Cobros de Hoy
            </h2>
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiTile
                label="Recaudación Hoy"
                value={fmtMonto(datos.abonos_del_dia.monto)}
                icon="payments"
                tono="esmeralda"
                pie={`${fmtCantidad(datos.abonos_del_dia.cantidad)} recibos cobrados`}
                onClick={() => navigate('/cobros')}
              />
              <KpiTile
                label="En Fecha"
                value={fmtCantidad(datos.cartera_semaforo.al_dia)}
                icon="task_alt"
                tono="indigo"
                pie="Créditos al día"
                onClick={() => navigate('/cobros')}
              />
              <KpiTile
                label="En Gracia"
                value={fmtCantidad(datos.cartera_semaforo.en_gracia)}
                icon="schedule"
                tono="ambar"
                pie="Dentro de los 5 días"
                onClick={() => navigate('/cobros')}
              />
              <KpiTile
                label="Pasados (Mora)"
                value={fmtCantidad(datos.cartera_semaforo.en_mora)}
                icon="warning"
                tono="rosa"
                pie={`Mora: ${fmtMonto(datos.cartera_semaforo.mora_total)}`}
                onClick={() => navigate('/cobros')}
              />
            </div>
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
            description="Usa las acciones rápidas arriba para registrar los abonos o consultar la agenda de cobranza."
          />
        </div>
      )}
    </Layout>
  );
}
