import { useState, useEffect } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, KpiTile, Button, Icon, Spinner, EmptyState } from '../components/ui';
import { dashboardService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../lib/router';
import { fmtMonto, fmtCantidad, fmtPorcentaje, fmtFecha } from '../lib/format';
import type { Dashboard } from '../types';



export function DashboardPage() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'ADMINISTRADOR';
  const { navigate } = useRouter();

  const [datos, setDatos] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const ACCIONES_ADMIN = [
    { label: 'Registrar Cliente', icon: 'person_add', color: 'bg-indigo-600', path: '/clientes' },
    { label: 'Nuevo Préstamo', icon: 'post_add', color: 'bg-blue-600', path: '/prestamos/nuevo' },
    { label: 'Registrar Pago', icon: 'payments', color: 'bg-emerald-600', path: '/cobros' },
    { label: 'Arqueo Diario', icon: 'point_of_sale', color: 'bg-amber-500', path: '/reportes/arqueo' },
  ];

  const ACCIONES_COBRANZA = [
    { label: 'Mi Ruta de Cobro', icon: 'map', color: 'bg-blue-600', path: '/cobros' },
    { label: 'Registrar Pago', icon: 'payments', color: 'bg-emerald-600', path: '/cobros' },
    { label: 'Mi Arqueo', icon: 'point_of_sale', color: 'bg-amber-500', path: '/reportes/arqueo' },
  ];

  const acciones = esAdmin ? ACCIONES_ADMIN : ACCIONES_COBRANZA;

  return (
    <Layout titulo="Panel de Control">
      <PageHeader
        titulo={`Hola, ${user?.nombre_completo.split(' ')[0] || 'Usuario'}`}
        descripcion={
          esAdmin
            ? datos
              ? `Resumen financiero al ${fmtFecha(datos.fecha)}`
              : 'Resumen financiero y acciones rápidas'
            : 'Acciones rápidas para tu gestión de hoy'
        }
        actions={
          esAdmin && (
            <Button variant="secondary" icon="sync" onClick={() => location.reload()} loading={loading}>
              Actualizar
            </Button>
          )
        }
      />

      {/* Acciones Rápidas */}
      <div class="mb-8">
        <h2 class="mb-3 text-label-sm uppercase tracking-wider text-slate-500">Acciones Rápidas</h2>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {acciones.map((accion) => (
            <button
              key={accion.label}
              onClick={() => navigate(accion.path)}
              class="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-transparent hover:shadow-md active:scale-95"
            >
              <div class={`flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-inner transition-transform group-hover:scale-110 ${accion.color}`}>
                <Icon name={accion.icon} size={24} />
              </div>
              <span class="text-center text-body-sm font-semibold text-slate-700 group-hover:text-slate-900">
                {accion.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div class="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-body-md text-red-700">
          <Icon name="warning" size={20} />
          {error}
        </div>
      )}

      {loading && !datos && esAdmin ? (
        <div class="flex justify-center py-16">
          <Spinner size={40} />
        </div>
      ) : esAdmin && datos ? (
        <>
          <h2 class="mb-3 mt-6 text-label-sm uppercase tracking-wider text-slate-500">Indicadores Principales</h2>
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile
              label="Clientes Activos"
              value={fmtCantidad(datos?.clientes_activos)}
              icon="groups"
              tono="ambar"
              onClick={() => navigate('/clientes')}
            />
            <KpiTile
              label="Bolsas de Fondo"
              value={fmtCantidad(datos?.bolsas.cantidad)}
              icon="savings"
              tono="indigo"
              pie={`${fmtMonto(datos?.bolsas.capital_en_calle)} disponible`}
              onClick={() => navigate('/fondos')}
            />
            <KpiTile
              label="Creditos Vigentes"
              value={fmtCantidad(datos?.creditos_vigentes.cantidad)}
              icon="account_balance_wallet"
              tono="esmeralda"
              pie={`${fmtMonto(datos?.creditos_vigentes.saldo_total)} en cartera`}
              onClick={() => navigate('/cobros')}
            />
            <KpiTile
              label="Abonos del Dia"
              value={fmtMonto(datos?.abonos_del_dia.monto)}
              icon="payments"
              tono="neutro"
              pie={`${fmtCantidad(datos?.abonos_del_dia.cantidad)} recibos hoy`}
              onClick={() => navigate('/reportes/arqueo')}
            />
          </div>

          <div class="mt-6">
            <Card class="flex flex-col items-center justify-between gap-4 p-6 sm:flex-row">
              <div class="flex items-center gap-4">
                <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Icon name="credit_score" size={26} />
                </div>
                <div>
                  <h3 class="text-body-md font-bold text-slate-900">Gestión Operativa de Cartera</h3>
                  <p class="text-body-sm text-slate-500">
                    Consulta el estado de cada crédito, cuotas vigentes y mora exigible directamente en la terminal de cobros.
                  </p>
                </div>
              </div>
              <Button variant="secondary" iconRight="arrow_forward" onClick={() => navigate('/cobros')}>
                Ver Cartera Completa
              </Button>
            </Card>
          </div>
        </>
      ) : !esAdmin ? (
        <div class="mt-4">
          <EmptyState
            icon="task_alt"
            title="¡Todo listo para hoy!"
            description="Usa las acciones rápidas arriba para registrar los abonos o ver tu ruta de cobranza."
          />
        </div>
      ) : null}
    </Layout>
  );
}
