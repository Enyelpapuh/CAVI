import { useState, useEffect, useCallback } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, DataTable, Icon, Input, Modal, Select, ConfirmModal, type Columna } from '../components/ui';
import { usuarioService } from '../services/api';
import { useToast } from '../components/ui';
import { fmtCantidad } from '../lib/format';
import type { Usuario } from '../types';

const POR_PAGINA = 20;

const FORM_VACIO: Partial<Usuario> & { password?: string } = {
  nombre_completo: '',
  correo: '',
  rol: 'COBRANZA',
  password: '',
  activo: true,
};

const ROLES = [
  { value: 'ADMINISTRADOR', label: 'Administrador' },
  { value: 'COBRANZA', label: 'Cobranza' },
];

export function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [formData, setFormData] = useState<Partial<Usuario> & { password?: string }>(FORM_VACIO);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [usuarioAConfirmar, setUsuarioAConfirmar] = useState<Usuario | null>(null);
  const [confirmandoEstado, setConfirmandoEstado] = useState(false);
  const toast = useToast();

  const fetchUsuarios = async () => {
    setLoading(true);
    try {
      const data = await usuarioService.list({ search, page });
      // Manejar respuesta paginada o lista plana
      if (Array.isArray(data)) {
        setUsuarios(data);
        setTotal(data.length);
      } else {
        setUsuarios(data.results);
        setTotal(data.count);
      }
    } catch (err: any) {
      toast.error('No se pudo cargar el listado de usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsuarios();
  }, [search, page]);

  const validar = (): boolean => {
    const errores: Record<string, string> = {};
    if (!formData.nombre_completo) errores.nombre_completo = 'El nombre es obligatorio';
    if (!formData.correo) errores.correo = 'El correo es obligatorio';
    if (!editing && !formData.password) errores.password = 'La contraseña inicial es obligatoria';
    setFormErrors(errores);
    return Object.keys(errores).length === 0;
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!validar()) return;
    setSubmitting(true);
    try {
      if (editing) {
        // Al editar, si no cambia la contraseña, no la enviamos
        const { password, ...resto } = formData;
        const datosEnvio = password ? formData : resto;
        await usuarioService.update(editing.id, datosEnvio);
        toast.success('Usuario actualizado');
      } else {
        await usuarioService.create(formData as Omit<Usuario, 'id' | 'creado_en' | 'actualizado_en' | 'ultimo_login'> & { password?: string });
        toast.success('Usuario registrado');
      }
      cerrarForm();
      fetchUsuarios();
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.correo) setFormErrors({ correo: String(data.correo[0]) });
      else toast.error('Error al guardar el usuario');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (usuario: Usuario) => {
    setEditing(usuario);
    setFormData({
      nombre_completo: usuario.nombre_completo,
      correo: usuario.correo,
      rol: usuario.rol,
      password: '',
      activo: usuario.activo,
    });
    setFormErrors({});
    setShowForm(true);
  };

  const handleToggleEstado = (usuario: Usuario) => {
    setUsuarioAConfirmar(usuario);
  };

  const ejecutarToggleEstado = async () => {
    if (!usuarioAConfirmar) return;
    const accion = usuarioAConfirmar.activo ? 'deshabilitar' : 'habilitar';
    setConfirmandoEstado(true);
    try {
      await usuarioService.update(usuarioAConfirmar.id, { activo: !usuarioAConfirmar.activo });
      toast.success(`Usuario ${usuarioAConfirmar.activo ? 'deshabilitado' : 'habilitado'} exitosamente`);
      setUsuarioAConfirmar(null);
      fetchUsuarios();
    } catch {
      toast.error(`Error al ${accion} el usuario`);
    } finally {
      setConfirmandoEstado(false);
    }
  };

  const cerrarForm = useCallback(() => {
    setEditing(null);
    setFormData(FORM_VACIO);
    setFormErrors({});
    setShowForm(false);
  }, []);

  const cambiar = useCallback((campo: keyof typeof formData, valor: string | boolean) => {
    setFormData((prev) => ({ ...prev, [campo]: valor }));
    setFormErrors((prev) => {
      if (prev[campo as string]) {
        return { ...prev, [campo as string]: '' };
      }
      return prev;
    });
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / POR_PAGINA));

  const columnas: Columna<Usuario>[] = [
    {
      key: 'nombre',
      header: 'Usuario',
      render: (u) => (
        <div class="min-w-0">
          <p class="truncate font-medium text-slate-900">{u.nombre_completo}</p>
          <p class="truncate text-body-sm text-slate-500">{u.correo}</p>
        </div>
      ),
    },
    {
      key: 'rol',
      header: 'Rol',
      width: '150px',
      render: (u) => (
        <span class={`rounded-full px-2.5 py-0.5 text-label-xs font-semibold uppercase tracking-wider ${
          u.rol === 'ADMINISTRADOR' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'
        }`}>
          {u.rol}
        </span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      width: '120px',
      render: (u) => (
        <span
          class={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-label-xs uppercase ${
            u.activo
              ? 'border-green-200 bg-green-50 text-green-600'
              : 'border-slate-200 bg-slate-100 text-slate-500'
          }`}
        >
          <span
            class={`h-1.5 w-1.5 rounded-full ${u.activo ? 'bg-green-600' : 'bg-slate-400'}`}
            aria-hidden="true"
          />
          {u.activo ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      width: '160px',
      render: (u) => (
        <div class="flex justify-end gap-1">
          <Button variant="ghost" size="sm" icon="edit" onClick={() => handleEdit(u)}>
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={u.activo ? 'person_off' : 'person_add'}
            onClick={() => handleToggleEstado(u)}
          >
            {u.activo ? 'Baja' : 'Alta'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Layout titulo="Usuarios">
      <PageHeader
        titulo="Gestión de Usuarios"
        descripcion={`${fmtCantidad(total)} usuario${total === 1 ? '' : 's'} en el sistema`}
        actions={
          <Button
            icon="person_add"
            onClick={() => {
              setEditing(null);
              setFormData(FORM_VACIO);
              setFormErrors({});
              setShowForm(true);
            }}
          >
            Nuevo Usuario
          </Button>
        }
      />

      <div class="relative mb-4 sm:max-w-md">
        <Icon
          name="search"
          size={20}
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          value={search}
          onInput={(e) => {
            setSearch((e.currentTarget as HTMLInputElement).value);
            setPage(1);
          }}
          placeholder="Buscar por nombre o correo"
          aria-label="Buscar usuarios"
          class="w-full rounded-full border border-slate-200 bg-white py-2 pl-10 pr-4 text-body-md text-slate-800 outline-none transition-shadow focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
        />
      </div>

      <Card padded={false}>
        <DataTable
          columns={columnas}
          rows={usuarios}
          getKey={(u) => u.id}
          caption="Listado de usuarios y personal de cobranza"
          loading={loading}
          emptyTitle="No se encontraron usuarios"
          emptyDescription="Ajuste la búsqueda o cree un nuevo usuario."
          footer={
            totalPages > 1 ? (
              <>
                <td class="px-3 text-body-sm text-slate-600" colSpan={columnas.length - 1}>
                  Mostrando {(page - 1) * POR_PAGINA + 1} a {Math.min(page * POR_PAGINA, total)} de{' '}
                  {fmtCantidad(total)} resultados
                </td>
                <td class="px-3">
                  <div class="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="arrow_back"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      iconRight="arrow_forward"
                      disabled={page === totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </td>
              </>
            ) : null
          }
        />
      </Card>

      <Modal
        open={showForm}
        onClose={cerrarForm}
        title={editing ? 'Editar Usuario' : 'Nuevo Usuario'}
        subtitle={editing ? 'Modifica el acceso y roles' : 'Asigna credenciales para el sistema'}
        icon="group"
        footer={
          <>
            <Button variant="ghost" onClick={cerrarForm} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" form="form-usuario" loading={submitting}>
              {editing ? 'Actualizar' : 'Crear Usuario'}
            </Button>
          </>
        }
      >
        <form id="form-usuario" onSubmit={handleSubmit} class="space-y-4">
          <Input
            label="Nombre Completo"
            value={formData.nombre_completo || ''}
            onInput={(valor) => cambiar('nombre_completo', valor)}
            required
            error={formErrors.nombre_completo}
          />
          <Input
            label="Correo (Username)"
            type="email"
            value={formData.correo || ''}
            onInput={(valor) => cambiar('correo', valor)}
            disabled={!!editing}
            required
            error={formErrors.correo}
            hint={editing ? 'El correo no se puede cambiar' : 'Se utilizará para iniciar sesión'}
          />
          <Select
            label="Rol de Acceso"
            value={formData.rol as string}
            onChange={(valor) => cambiar('rol', valor)}
            options={ROLES}
            required
          />
          <Input
            label={editing ? "Nueva Contraseña (Opcional)" : "Contraseña Inicial"}
            type="password"
            value={formData.password || ''}
            onInput={(valor) => cambiar('password', valor)}
            required={!editing}
            error={formErrors.password}
            hint={editing ? 'Dejar en blanco para mantener la actual' : 'Mínimo 8 caracteres'}
          />
        </form>
      </Modal>

      {/* Modal de confirmación para activar/desactivar usuario */}
      {usuarioAConfirmar && (
        <ConfirmModal
          open={Boolean(usuarioAConfirmar)}
          onClose={() => setUsuarioAConfirmar(null)}
          onConfirm={ejecutarToggleEstado}
          loading={confirmandoEstado}
          title={usuarioAConfirmar.activo ? 'Deshabilitar Usuario' : 'Habilitar Usuario'}
          message={
            usuarioAConfirmar.activo
              ? `¿Está seguro de deshabilitar al usuario "${usuarioAConfirmar.nombre_completo}" (${usuarioAConfirmar.correo})? El operador no podrá ingresar a la plataforma.`
              : `¿Desea habilitar nuevamente al usuario "${usuarioAConfirmar.nombre_completo}" (${usuarioAConfirmar.correo}) para otorgarle acceso al sistema?`
          }
          variant={usuarioAConfirmar.activo ? 'danger' : 'primary'}
          confirmText={usuarioAConfirmar.activo ? 'Deshabilitar' : 'Habilitar'}
          cancelText="Cancelar"
        />
      )}
    </Layout>
  );
}
