import { useState, useEffect } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { fondoService } from '../services/api';
import type { Fondo, MovimientoFondo } from '../types';
import { fmtMonto } from '../lib/format';

const tipoBadgeClass: Record<string, string> = {
  INYECCION: 'bg-green-100 text-green-800',
  RETIRO: 'bg-orange-100 text-orange-800',
  DESEMBOLSO: 'bg-blue-100 text-blue-800',
  GANANCIA: 'bg-yellow-100 text-yellow-800',
};

const tipoSign: Record<string, string> = {
  INYECCION: '+',
  GANANCIA: '+',
  RETIRO: '-',
  DESEMBOLSO: '-',
};

type ModalState =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'inyeccion'; fondo: Fondo }
  | { type: 'retiro'; fondo: Fondo }
  | { type: 'movimientos'; fondo: Fondo };

export function FondosPage() {
  const [fondos, setFondos] = useState<Fondo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');

  const [createForm, setCreateForm] = useState({ nombre: '', familiar: '', capital_inicial: '' });
  const [montoForm, setMontoForm] = useState({ monto: '', descripcion: '' });

  const [movimientos, setMovimientos] = useState<MovimientoFondo[]>([]);
  const [movLoading, setMovLoading] = useState(false);
  const [movPage, setMovPage] = useState(1);
  const [movTotal, setMovTotal] = useState(0);

  const fetchFondos = async () => {
    setLoading(true);
    try {
      const data = await fondoService.list({ search });
      setFondos(data.results);
    } catch (err: any) {
      console.error('Error fetching fondos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFondos();
  }, [search]);

  const handleCreate = async (e: Event) => {
    e.preventDefault();
    if (!createForm.nombre || !createForm.familiar || !createForm.capital_inicial) {
      setError('Todos los campos son obligatorios');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await fondoService.create({
        nombre: createForm.nombre,
        familiar: createForm.familiar,
        capital_inicial: createForm.capital_inicial,
      });
      setModal({ type: 'none' });
      setCreateForm({ nombre: '', familiar: '', capital_inicial: '' });
      fetchFondos();
    } catch (err: any) {
      const data = err.response?.data;
      if (data && typeof data === 'object') {
        const msgs = Object.values(data).flat().map(String);
        setError(msgs.join(' ') || 'Error al crear el fondo');
      } else {
        setError('Error al crear el fondo');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleMovimiento = async (e: Event) => {
    e.preventDefault();
    if (!montoForm.monto || Number(montoForm.monto) <= 0) {
      setError('Ingrese un monto válido mayor a cero');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (modal.type === 'inyeccion') {
        await fondoService.inyeccion(modal.fondo.id, montoForm);
      } else if (modal.type === 'retiro') {
        await fondoService.retiro(modal.fondo.id, montoForm);
      }
      setModal({ type: 'none' });
      setMontoForm({ monto: '', descripcion: '' });
      fetchFondos();
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.error) {
        setError(String(data.error));
      } else if (data?.monto) {
        setError((data.monto as string[]).join(' '));
      } else {
        setError('Error al procesar la operación');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openMovimientos = async (fondo: Fondo) => {
    setModal({ type: 'movimientos', fondo });
    setMovimientos([]);
    setMovPage(1);
    setMovTotal(0);
    await loadMovimientos(fondo.id, 1);
  };

  const loadMovimientos = async (fondoId: number, page: number) => {
    setMovLoading(true);
    try {
      const data = await fondoService.movimientos(fondoId, { page });
      setMovimientos(data.results);
      setMovTotal(data.count);
    } catch (err: any) {
      console.error('Error fetching movimientos:', err);
    } finally {
      setMovLoading(false);
    }
  };

  const handleMovPage = (next: number) => {
    if (modal.type !== 'movimientos') return;
    setMovPage(next);
    loadMovimientos(modal.fondo.id, next);
  };

  const closeModal = () => {
    setModal({ type: 'none' });
    setError('');
  };

  return (
    <Layout>
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 class="text-2xl font-bold text-gray-900">Administración de Fondos</h2>
          <button
            onClick={() => { setError(''); setModal({ type: 'create' }); }}
            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg class="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo Fondo
          </button>
        </div>

        {/* Búsqueda */}
        <div class="bg-white shadow rounded-lg p-4">
          <div class="max-w-md">
            <label htmlFor="search" class="sr-only">Buscar fondos</label>
            <input
              id="search"
              type="text"
              value={search}
              onInput={(e) => setSearch(e.currentTarget.value)}
              placeholder="Buscar por nombre o familiar..."
              class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Grid de Fondos */}
        {loading ? (
          <div class="bg-white shadow rounded-lg p-8 text-center">
            <div class="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mx-auto"></div>
            <p class="mt-2 text-gray-600">Cargando fondos...</p>
          </div>
        ) : fondos.length === 0 ? (
          <div class="bg-white shadow rounded-lg p-12 text-center text-gray-500">
            No se encontraron fondos
          </div>
        ) : (
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {fondos.map((fondo) => (
              <div key={fondo.id} class="bg-white shadow rounded-lg overflow-hidden flex flex-col">
                <div class="px-6 py-5 bg-gradient-to-r from-blue-600 to-blue-700">
                  <div class="flex items-start justify-between">
                    <div>
                      <h3 class="text-lg font-semibold text-white">{fondo.nombre}</h3>
                      <p class="text-sm text-blue-200 mt-0.5">Familiar: {fondo.familiar}</p>
                    </div>
                    <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-white/20 text-white">
                      {fondo.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>

                <div class="px-6 py-5 space-y-4 flex-1">
                  <div>
                    <p class="text-sm text-gray-500">Saldo disponible</p>
                    <p class="text-2xl font-bold text-gray-900">{fmtMonto(fondo.saldo_disponible)}</p>
                  </div>
                  <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p class="text-gray-500">Capital inicial</p>
                      <p class="font-medium text-gray-900">{fmtMonto(fondo.capital_inicial)}</p>
                    </div>
                    <div>
                      <p class="text-gray-500">Capital colocado</p>
                      <p class="font-medium text-gray-900">{fmtMonto(fondo.capital_colocado ?? 0)}</p>
                    </div>
                    <div>
                      <p class="text-gray-500">Ganancias acumuladas</p>
                      <p class="font-medium text-green-700">{fmtMonto(fondo.ganancias_acumuladas)}</p>
                    </div>
                    <div>
                      <p class="text-gray-500">Rentabilidad</p>
                      <p class="font-medium text-gray-900">{(fondo.rentabilidad ?? 0).toFixed(2)}%</p>
                    </div>
                  </div>
                </div>

                <div class="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-2">
                  <button
                    onClick={() => { setError(''); setMontoForm({ monto: '', descripcion: '' }); setModal({ type: 'inyeccion', fondo }); }}
                    class="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md"
                  >
                    Inyección
                  </button>
                  <button
                    onClick={() => { setError(''); setMontoForm({ monto: '', descripcion: '' }); setModal({ type: 'retiro', fondo }); }}
                    class="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-md"
                  >
                    Retiro
                  </button>
                  <button
                    onClick={() => openMovimientos(fondo)}
                    class="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md"
                  >
                    Movimientos
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal: Crear Fondo */}
        {modal.type === 'create' && (
          <div class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex min-h-full items-center justify-center p-4">
              <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={closeModal} />
              <div class="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 class="text-lg font-medium text-gray-900 mb-4">Nuevo Fondo</h3>
                <form onSubmit={handleCreate} class="space-y-4">
                  <div>
                    <label htmlFor="nombre" class="block text-sm font-medium text-gray-700">Nombre</label>
                    <input
                      id="nombre"
                      type="text"
                      value={createForm.nombre}
                      onInput={(e) => setCreateForm({ ...createForm, nombre: e.currentTarget.value })}
                      class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="familiar" class="block text-sm font-medium text-gray-700">Familiar</label>
                    <input
                      id="familiar"
                      type="text"
                      value={createForm.familiar}
                      onInput={(e) => setCreateForm({ ...createForm, familiar: e.currentTarget.value })}
                      class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="capital_inicial" class="block text-sm font-medium text-gray-700">Capital inicial (C$)</label>
                    <input
                      id="capital_inicial"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={createForm.capital_inicial}
                      onInput={(e) => setCreateForm({ ...createForm, capital_inicial: e.currentTarget.value })}
                      class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                  {error && <p class="text-sm text-red-600">{error}</p>}
                  <div class="flex justify-end space-x-3 pt-4">
                    <button type="button" onClick={closeModal} class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      class="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                    >
                      {submitting ? 'Creando...' : 'Crear Fondo'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Inyección / Retiro */}
        {(modal.type === 'inyeccion' || modal.type === 'retiro') && (
          <div class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex min-h-full items-center justify-center p-4">
              <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={closeModal} />
              <div class="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 class="text-lg font-medium text-gray-900 mb-1">
                  {modal.type === 'inyeccion' ? 'Inyección de Capital' : 'Retiro de Capital'}
                </h3>
                <p class="text-sm text-gray-500 mb-4">{modal.fondo.nombre}</p>
                <div class="rounded-md bg-gray-50 px-4 py-3 mb-4 flex justify-between">
                  <span class="text-sm text-gray-600">Saldo disponible</span>
                  <span class="text-sm font-semibold text-gray-900">{fmtMonto(modal.fondo.saldo_disponible)}</span>
                </div>
                <form onSubmit={handleMovimiento} class="space-y-4">
                  <div>
                    <label htmlFor="monto" class="block text-sm font-medium text-gray-700">Monto (C$)</label>
                    <input
                      id="monto"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={montoForm.monto}
                      onInput={(e) => setMontoForm({ ...montoForm, monto: e.currentTarget.value })}
                      class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="descripcion" class="block text-sm font-medium text-gray-700">Descripción</label>
                    <input
                      id="descripcion"
                      type="text"
                      value={montoForm.descripcion}
                      onInput={(e) => setMontoForm({ ...montoForm, descripcion: e.currentTarget.value })}
                      placeholder={modal.type === 'inyeccion' ? 'Inyección de capital' : 'Retiro de capital'}
                      class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                  {error && (
                    <div class="rounded-md bg-red-50 border border-red-200 px-4 py-3">
                      <p class="text-sm text-red-700">{error}</p>
                    </div>
                  )}
                  <div class="flex justify-end space-x-3 pt-4">
                    <button type="button" onClick={closeModal} class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      class={`px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white disabled:opacity-50 ${
                        modal.type === 'inyeccion' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'
                      }`}
                    >
                      {submitting ? 'Procesando...' : modal.type === 'inyeccion' ? 'Inyectar' : 'Retirar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Movimientos */}
        {modal.type === 'movimientos' && (
          <div class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex min-h-full items-center justify-center p-4">
              <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={closeModal} />
              <div class="relative bg-white rounded-lg shadow-xl max-w-2xl w-full">
                <div class="px-6 py-4 border-b border-gray-200 flex items-start justify-between">
                  <div>
                    <h3 class="text-lg font-medium text-gray-900">Movimientos</h3>
                    <p class="text-sm text-gray-500">{modal.fondo.nombre} - {modal.fondo.familiar}</p>
                  </div>
                  <button onClick={closeModal} class="text-gray-400 hover:text-gray-600">
                    <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div class="max-h-96 overflow-y-auto">
                  {movLoading ? (
                    <div class="p-8 text-center">
                      <div class="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mx-auto"></div>
                    </div>
                  ) : movimientos.length === 0 ? (
                    <div class="p-12 text-center text-gray-500">Sin movimientos registrados</div>
                  ) : (
                    <table class="min-w-full divide-y divide-gray-200">
                      <thead class="bg-gray-50 sticky top-0">
                        <tr>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo anterior</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo posterior</th>
                          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                        </tr>
                      </thead>
                      <tbody class="bg-white divide-y divide-gray-200">
                        {movimientos.map((mov) => (
                          <tr key={mov.id} class="hover:bg-gray-50">
                            <td class="px-6 py-3 whitespace-nowrap">
                              <span class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${tipoBadgeClass[mov.tipo]}`}>
                                {tipoSign[mov.tipo]}{mov.tipo_display}
                              </span>
                            </td>
                            <td class={`px-6 py-3 whitespace-nowrap text-sm font-medium ${
                              mov.tipo === 'INYECCION' || mov.tipo === 'GANANCIA' ? 'text-green-700' : 'text-red-700'
                            }`}>
                              {fmtMonto(mov.monto)}
                            </td>
                            <td class="px-6 py-3 whitespace-nowrap text-sm text-gray-500">{fmtMonto(mov.saldo_anterior)}</td>
                            <td class="px-6 py-3 whitespace-nowrap text-sm text-gray-500">{fmtMonto(mov.saldo_posterior)}</td>
                            <td class="px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                              {mov.descripcion && <span class="block text-xs text-gray-400">{mov.descripcion}</span>}
                              {new Date(mov.creado_en).toLocaleString('es-NI')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {Math.ceil(movTotal / 20) > 1 && (
                  <div class="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                    <div class="text-sm text-gray-700">
                      Página {movPage} de {Math.ceil(movTotal / 20)}
                    </div>
                    <div class="flex space-x-2">
                      <button
                        onClick={() => handleMovPage(movPage - 1)}
                        disabled={movPage === 1}
                        class="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <button
                        onClick={() => handleMovPage(movPage + 1)}
                        disabled={movPage >= Math.ceil(movTotal / 20)}
                        class="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}