import { useState, useEffect, useMemo } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, Button, Icon, Spinner, StatusBadge, useToast } from '../components/ui';
import { permisoService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { PermisosResponse, CatPermiso } from '../types';

const ICONOS_MODULO: Record<string, string> = {
  DASHBOARD: 'dashboard',
  CLIENTES: 'groups',
  PRESTAMOS: 'account_balance_wallet',
  COBROS: 'payments',
  ARQUEO: 'point_of_sale',
  FONDOS: 'savings',
  INFORMES: 'analytics',
  CONFIGURACION: 'settings',
  USUARIOS: 'manage_accounts',
  PERMISOS: 'shield',
};

export function PermisosPage() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'ADMINISTRADOR';
  const toast = useToast();

  const [data, setData] = useState<PermisosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolActivo, setRolActivo] = useState<'ADMINISTRADOR' | 'COBRANZA'>('COBRANZA');
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  const cargar = async () => {
    setLoading(true);
    try {
      const resp = await permisoService.getMatriz();
      setData(resp);
    } catch {
      toast.error('No se pudo cargar la matriz de permisos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  // Agrupar permisos por módulo
  const permisosPorModulo = useMemo(() => {
    if (!data?.permisos) return {};
    const grupos: Record<string, CatPermiso[]> = {};
    for (const p of data.permisos) {
      if (!grupos[p.modulo]) {
        grupos[p.modulo] = [];
      }
      grupos[p.modulo].push(p);
    }
    return grupos;
  }, [data]);

  const togglePermiso = async (rol: string, codigo: string, estadoActual: boolean) => {
    if (!esAdmin) {
      toast.error('Solo administradores pueden modificar permisos');
      return;
    }
    const nuevoEstado = !estadoActual;
    const key = `${rol}-${codigo}`;
    setToggling((prev) => ({ ...prev, [key]: true }));

    // Actualización optimista en el estado local
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        matriz: {
          ...prev.matriz,
          [rol]: {
            ...prev.matriz[rol],
            [codigo]: nuevoEstado,
          },
        },
      };
    });

    try {
      await permisoService.actualizar({
        rol,
        permiso_codigo: codigo,
        activo: nuevoEstado,
      });
      toast.success(
        `Permiso ${nuevoEstado ? 'activado' : 'desactivado'} para ${rol === 'ADMINISTRADOR' ? 'Administradores' : 'Cobradores'}`
      );
    } catch {
      // Revertir si hubo error
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          matriz: {
            ...prev.matriz,
            [rol]: {
              ...prev.matriz[rol],
              [codigo]: estadoActual,
            },
          },
        };
      });
      toast.error('Error al actualizar el permiso en el servidor');
    } finally {
      setToggling((prev) => ({ ...prev, [key]: false }));
    }
  };

  const modulos = Object.keys(permisosPorModulo);

  return (
    <Layout titulo="Permisos y Roles">
      <PageHeader
        titulo="Permisos y Control de Acceso (RBAC)"
        descripcion="Administración de políticas de seguridad, accesos a pantallas y operaciones por rol de usuario según normativas de auditoría interna."
        actions={
          <Button variant="secondary" icon="refresh" onClick={cargar} loading={loading}>
            Actualizar
          </Button>
        }
      />

      {/* Selector de Rol y Resumen */}
      <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div class="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRolActivo('COBRANZA')}
            class={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-label-md font-bold transition-all shadow-sm ${
              rolActivo === 'COBRANZA'
                ? 'bg-emerald-700 text-white shadow-emerald-700/20'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon name="payments" size={18} />
            Oficial de Cobranza (Ruta)
          </button>
          <button
            type="button"
            onClick={() => setRolActivo('ADMINISTRADOR')}
            class={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-label-md font-bold transition-all shadow-sm ${
              rolActivo === 'ADMINISTRADOR'
                ? 'bg-slate-900 text-white shadow-slate-900/20'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon name="shield" size={18} />
            Administrador Master
          </button>
        </div>

        <div class="flex items-center gap-2 text-body-xs text-slate-500">
          <StatusBadge variant="activo" label="Control Granular Activo" />
          <span>Matriz de políticas auditables</span>
        </div>
      </div>

      {loading ? (
        <div class="flex justify-center py-20">
          <Spinner size={40} />
        </div>
      ) : !data ? (
        <div class="p-8 text-center text-slate-500">
          <p>No se pudo conectar con el catálogo de permisos.</p>
        </div>
      ) : (
        <div class="space-y-6">
          {modulos.map((modulo) => {
            const permisosModulo = permisosPorModulo[modulo];
            const icono = ICONOS_MODULO[modulo] || 'folder';

            return (
              <Card key={modulo} padded={false} class="overflow-hidden border border-slate-200 shadow-sm">
                <div class="bg-slate-50/80 px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 shadow-xs">
                      <Icon name={icono} size={20} />
                    </div>
                    <div>
                      <h3 class="text-body-md font-bold text-slate-900 capitalize">
                        Módulo de {modulo.toLowerCase()}
                      </h3>
                      <p class="text-[12px] text-slate-500">
                        {permisosModulo.length} permisos operativos asignables
                      </p>
                    </div>
                  </div>
                  <span class="text-label-xs font-mono font-semibold uppercase text-slate-400 bg-slate-200/60 px-2 py-0.5 rounded">
                    {modulo}
                  </span>
                </div>

                <div class="divide-y divide-slate-100">
                  {permisosModulo.map((p) => {
                    const keyToggle = `${rolActivo}-${p.codigo}`;
                    const estaActivo = !!data.matriz[rolActivo]?.[p.codigo];
                    const enProgreso = !!toggling[keyToggle];

                    return (
                      <div
                        key={p.codigo}
                        class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50/50 transition-colors"
                      >
                        <div class="flex-1">
                          <div class="flex items-center gap-2">
                            <span class="text-body-md font-semibold text-slate-800">
                              {p.nombre}
                            </span>
                            <span class="font-mono text-[11px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              {p.codigo}
                            </span>
                          </div>
                          {p.descripcion && (
                            <p class="mt-0.5 text-body-xs text-slate-500">{p.descripcion}</p>
                          )}
                        </div>

                        <div class="flex items-center gap-3 shrink-0">
                          <span
                            class={`text-label-xs font-bold ${
                              estaActivo ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                          >
                            {estaActivo ? 'Habilitado' : 'Bloqueado'}
                          </span>

                          <button
                            type="button"
                            disabled={!esAdmin || enProgreso}
                            onClick={() => togglePermiso(rolActivo, p.codigo, estaActivo)}
                            aria-label={`Alternar permiso ${p.nombre}`}
                            class={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 ${
                              estaActivo ? 'bg-emerald-600' : 'bg-slate-200'
                            } ${!esAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            <span
                              class={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                estaActivo ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
