import { useState, useEffect } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { clienteService } from '../services/api';
import type { Cliente } from '../types';

export function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [formData, setFormData] = useState<Partial<Cliente>>({
    cedula: '',
    nombres: '',
    apellidos: '',
    telefono: '',
    direccion: '',
    actividad_economica: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchClientes = async () => {
    setLoading(true);
    try {
      const data = await clienteService.list({ search, page });
      setClientes(data.results);
      setTotal(data.count);
    } catch (err: any) {
      console.error('Error fetching clientes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, [search, page]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.cedula) errors.cedula = 'La cédula es obligatoria';
    if (!formData.nombres) errors.nombres = 'Los nombres son obligatorios';
    if (!formData.apellidos) errors.apellidos = 'Los apellidos son obligatorios';
    if (!formData.telefono) errors.telefono = 'El teléfono es obligatorio';
    if (!formData.direccion) errors.direccion = 'La dirección es obligatoria';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      if (editingCliente) {
        await clienteService.update(editingCliente.id, formData);
      } else {
        await clienteService.create(formData as Omit<Cliente, 'id' | 'creado_en' | 'actualizado_en'>);
      }
      resetForm();
      fetchClientes();
    } catch (err: any) {
      if (err.response?.data?.cedula) {
        setFormErrors({ cedula: err.response.data.cedula[0] });
      } else {
        alert('Error al guardar el cliente');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (cliente: Cliente) => {
    setEditingCliente(cliente);
    setFormData({
      cedula: cliente.cedula,
      nombres: cliente.nombres,
      apellidos: cliente.apellidos,
      telefono: cliente.telefono,
      direccion: cliente.direccion,
      actividad_economica: cliente.actividad_economica || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Está seguro de deshabilitar este cliente?')) return;
    try {
      await clienteService.delete(id);
      fetchClientes();
    } catch (err) {
      alert('Error al eliminar el cliente');
    }
  };

  const resetForm = () => {
    setEditingCliente(null);
    setFormData({
      cedula: '',
      nombres: '',
      apellidos: '',
      telefono: '',
      direccion: '',
      actividad_economica: '',
    });
    setFormErrors({});
    setShowForm(false);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <Layout>
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 class="text-2xl font-bold text-gray-900">Gestión de Clientes</h2>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg class="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo Cliente
          </button>
        </div>

        {/* Búsqueda */}
        <div class="bg-white shadow rounded-lg p-4">
          <div class="max-w-md">
            <label htmlFor="search" class="sr-only">Buscar clientes</label>
            <input
              id="search"
              type="text"
              value={search}
              onInput={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
              placeholder="Buscar por nombre, apellido o cédula..."
              class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Formulario Modal */}
        {showForm && (
          <div class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex min-h-full items-center justify-center p-4">
              <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={resetForm} />
              <div class="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
                <h3 class="text-lg font-medium text-gray-900 mb-4">
                  {editingCliente ? 'Editar Cliente' : 'Nuevo Cliente'}
                </h3>
                <form onSubmit={handleSubmit} class="space-y-4">
                  <div>
                    <label htmlFor="cedula" class="block text-sm font-medium text-gray-700">Cédula</label>
                    <input
                      id="cedula"
                      type="text"
                      value={formData.cedula || ''}
                      onInput={(e) => handleInputChange('cedula', e.currentTarget.value)}
                      class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      disabled={!!editingCliente}
                    />
                    {formErrors.cedula && <p class="mt-1 text-sm text-red-600">{formErrors.cedula}</p>}
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="nombres" class="block text-sm font-medium text-gray-700">Nombres</label>
                      <input
                        id="nombres"
                        type="text"
                        value={formData.nombres || ''}
                        onInput={(e) => handleInputChange('nombres', e.currentTarget.value)}
                        class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                      {formErrors.nombres && <p class="mt-1 text-sm text-red-600">{formErrors.nombres}</p>}
                    </div>
                    <div>
                      <label htmlFor="apellidos" class="block text-sm font-medium text-gray-700">Apellidos</label>
                      <input
                        id="apellidos"
                        type="text"
                        value={formData.apellidos || ''}
                        onInput={(e) => handleInputChange('apellidos', e.currentTarget.value)}
                        class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                      {formErrors.apellidos && <p class="mt-1 text-sm text-red-600">{formErrors.apellidos}</p>}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="telefono" class="block text-sm font-medium text-gray-700">Teléfono</label>
                    <input
                      id="telefono"
                      type="text"
                      value={formData.telefono || ''}
                      onInput={(e) => handleInputChange('telefono', e.currentTarget.value)}
                      class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                    {formErrors.telefono && <p class="mt-1 text-sm text-red-600">{formErrors.telefono}</p>}
                  </div>
                  <div>
                    <label htmlFor="direccion" class="block text-sm font-medium text-gray-700">Dirección</label>
                    <textarea
                      id="direccion"
                      rows={3}
                      value={formData.direccion || ''}
                      onInput={(e) => handleInputChange('direccion', e.currentTarget.value)}
                      class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                    {formErrors.direccion && <p class="mt-1 text-sm text-red-600">{formErrors.direccion}</p>}
                  </div>
                  <div>
                    <label htmlFor="actividad_economica" class="block text-sm font-medium text-gray-700">Actividad Económica</label>
                    <input
                      id="actividad_economica"
                      type="text"
                      value={formData.actividad_economica || ''}
                      onInput={(e) => handleInputChange('actividad_economica', e.currentTarget.value)}
                      class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                  <div class="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={resetForm}
                      class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      class="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                    >
                      {submitting ? 'Guardando...' : (editingCliente ? 'Actualizar' : 'Crear')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Tabla de Clientes */}
        <div class="bg-white shadow rounded-lg overflow-hidden">
          {loading ? (
            <div class="p-8 text-center">
              <div class="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mx-auto"></div>
              <p class="mt-2 text-gray-600">Cargando clientes...</p>
            </div>
          ) : (
            <>
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cédula</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teléfono</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dirección</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actividad</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                      <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-gray-200">
                    {clientes.length === 0 ? (
                      <tr>
                        <td colSpan={7} class="px-6 py-12 text-center text-gray-500">
                          No se encontraron clientes
                        </td>
                      </tr>
                    ) : (
                      clientes.map((cliente) => (
                        <tr key={cliente.id} class="hover:bg-gray-50">
                          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cliente.cedula}</td>
                          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{cliente.nombres} {cliente.apellidos}</td>
                          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cliente.telefono}</td>
                          <td class="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{cliente.direccion}</td>
                          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cliente.actividad_economica || '-'}</td>
                          <td class="px-6 py-4 whitespace-nowrap">
                            <span class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              cliente.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {cliente.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => handleEdit(cliente)}
                              class="text-blue-600 hover:text-blue-900 mr-3"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleDelete(cliente.id)}
                              class="text-red-600 hover:text-red-900"
                            >
                              Deshabilitar
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {totalPages > 1 && (
                <div class="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <div class="text-sm text-gray-700">
                    Mostrando {((page - 1) * 20) + 1} a {Math.min(page * 20, total)} de {total} resultados
                  </div>
                  <div class="flex space-x-2">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                      class="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page === totalPages}
                      class="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}