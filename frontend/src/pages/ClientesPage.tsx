import { useState, useEffect } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, DataTable, Icon, Input, Modal, Textarea, type Columna } from '../components/ui';
import { clienteService } from '../services/api';
import { useToast } from '../components/ui';
import { fmtCantidad } from '../lib/format';
import type { Cliente } from '../types';

const POR_PAGINA = 20;

const FORM_VACIO: Partial<Cliente> = {
  cedula: '',
  nombres: '',
  apellidos: '',
  telefono: '',
  direccion: '',
  actividad_economica: '',
};

export function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [formData, setFormData] = useState<Partial<Cliente>>(FORM_VACIO);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const fetchClientes = async () => {
    setLoading(true);
    try {
      const data = await clienteService.list({ search, page });
      setClientes(data.results);
      setTotal(data.count);
    } catch (err: any) {
      toast.error('No se pudo cargar el padrón de clientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, [search, page]);

  const validar = (): boolean => {
    const errores: Record<string, string> = {};
    if (!formData.cedula) errores.cedula = 'La cédula es obligatoria';
    if (!formData.nombres) errores.nombres = 'Los nombres son obligatorios';
    if (!formData.apellidos) errores.apellidos = 'Los apellidos son obligatorios';
    if (!formData.telefono) errores.telefono = 'El teléfono es obligatorio';
    if (!formData.direccion) errores.direccion = 'La dirección es obligatoria';
    setFormErrors(errores);
    return Object.keys(errores).length === 0;
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!validar()) return;
    setSubmitting(true);
    try {
      if (editing) {
        await clienteService.update(editing.id, formData);
        toast.success('Cliente actualizado');
      } else {
        await clienteService.create(formData as Omit<Cliente, 'id' | 'creado_en' | 'actualizado_en'>);
        toast.success('Cliente registrado');
      }
      cerrarForm();
      fetchClientes();
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.cedula) setFormErrors({ cedula: String(data.cedula[0]) });
      else toast.error('Error al guardar el cliente');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (cliente: Cliente) => {
    setEditing(cliente);
    setFormData({
      cedula: cliente.cedula,
      nombres: cliente.nombres,
      apellidos: cliente.apellidos,
      telefono: cliente.telefono,
      direccion: cliente.direccion,
      actividad_economica: cliente.actividad_economica || '',
    });
    setFormErrors({});
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Está seguro de deshabilitar este cliente?')) return;
    try {
      await clienteService.delete(id);
      toast.success('Cliente deshabilitado');
      fetchClientes();
    } catch {
      toast.error('Error al deshabilitar el cliente');
    }
  };

  const cerrarForm = () => {
    setEditing(null);
    setFormData(FORM_VACIO);
    setFormErrors({});
    setShowForm(false);
  };

  const cambiar = (campo: keyof Cliente, valor: string) => {
    setFormData((prev) => ({ ...prev, [campo]: valor }));
    if (formErrors[campo as string]) {
      setFormErrors((prev) => ({ ...prev, [campo as string]: '' }));
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / POR_PAGINA));

  const columnas: Columna<Cliente>[] = [
    {
      key: 'cedula',
      header: 'Cédula',
      width: '130px',
      render: (cliente) => <span class="tnum font-medium text-slate-900">{cliente.cedula}</span>,
    },
    {
      key: 'nombre',
      header: 'Nombre',
      render: (cliente) => (
        <div class="min-w-0">
          <p class="truncate font-medium text-slate-900">
            {cliente.nombres} {cliente.apellidos}
          </p>
          <p class="truncate text-body-sm text-slate-500">{cliente.direccion}</p>
        </div>
      ),
    },
    {
      key: 'telefono',
      header: 'Teléfono',
      width: '130px',
      render: (cliente) => <span class="tnum text-slate-700">{cliente.telefono}</span>,
    },
    {
      key: 'actividad',
      header: 'Actividad',
      width: '160px',
      render: (cliente) => (
        <span class="truncate text-slate-600">{cliente.actividad_economica || '-'}</span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      width: '110px',
      render: (cliente) => (
        <span
          class={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-label-xs uppercase ${
            cliente.activo
              ? 'border-green-200 bg-green-50 text-green-600'
              : 'border-slate-200 bg-slate-100 text-slate-500'
          }`}
        >
          <span
            class={`h-1.5 w-1.5 rounded-full ${cliente.activo ? 'bg-green-600' : 'bg-slate-400'}`}
            aria-hidden="true"
          />
          {cliente.activo ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      width: '190px',
      render: (cliente) => (
        <div class="flex justify-end gap-1">
          <Button variant="ghost" size="sm" icon="edit" onClick={() => handleEdit(cliente)}>
            Editar
          </Button>
          {cliente.activo && (
            <Button
              variant="ghost"
              size="sm"
              icon="person_off"
              onClick={() => handleDelete(cliente.id)}
            >
              Deshabilitar
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <Layout titulo="Clientes">
      <PageHeader
        titulo="Padrón de Clientes"
        descripcion={`${fmtCantidad(total)} cliente${total === 1 ? '' : 's'} registrado${total === 1 ? '' : 's'}`}
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
            Nuevo Cliente
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
          placeholder="Buscar por nombre, apellido o cédula"
          aria-label="Buscar clientes"
          class="w-full rounded-full border border-slate-200 bg-white py-2 pl-10 pr-4 text-body-md text-slate-800 outline-none transition-shadow focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
        />
      </div>

      <Card padded={false}>
        <DataTable
          columns={columnas}
          rows={clientes}
          getKey={(cliente) => cliente.id}
          caption="Listado de clientes del padrón"
          loading={loading}
          emptyTitle="No se encontraron clientes"
          emptyDescription="Ajuste la búsqueda o registre un nuevo cliente."
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
        title={editing ? 'Editar Cliente' : 'Nuevo Cliente'}
        subtitle={editing ? `Cédula ${editing.cedula} no se puede modificar` : 'Datos del prestatario'}
        icon="person"
        footer={
          <>
            <Button variant="ghost" onClick={cerrarForm} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" form="form-cliente" loading={submitting}>
              {editing ? 'Actualizar' : 'Crear Cliente'}
            </Button>
          </>
        }
      >
        <form id="form-cliente" onSubmit={handleSubmit} class="space-y-4">
          <Input
            label="Cédula"
            value={formData.cedula || ''}
            onInput={(valor) => cambiar('cedula', valor)}
            disabled={!!editing}
            required
            error={formErrors.cedula}
            hint={editing ? undefined : 'Formato 000-000000-0'}
          />
          <div class="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nombres"
              value={formData.nombres || ''}
              onInput={(valor) => cambiar('nombres', valor)}
              required
              error={formErrors.nombres}
            />
            <Input
              label="Apellidos"
              value={formData.apellidos || ''}
              onInput={(valor) => cambiar('apellidos', valor)}
              required
              error={formErrors.apellidos}
            />
          </div>
          <Input
            label="Teléfono"
            value={formData.telefono || ''}
            onInput={(valor) => cambiar('telefono', valor)}
            type="text"
            required
            error={formErrors.telefono}
          />
          <Textarea
            label="Dirección"
            value={formData.direccion || ''}
            onInput={(valor) => cambiar('direccion', valor)}
            required
            error={formErrors.direccion}
          />
          <Input
            label="Actividad Económica"
            value={formData.actividad_economica || ''}
            onInput={(valor) => cambiar('actividad_economica', valor)}
          />
        </form>
      </Modal>
    </Layout>
  );
}
