import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, DataTable, Icon, Input, Modal, Select, Textarea, Spinner, EmptyState, ConfirmModal, type Columna } from '../components/ui';
import { clienteService, catalogoService } from '../services/api';
import { useToast } from '../components/ui';
import { fmtMonto, fmtCantidad, fmtFecha, fmtFechaHora, iniciales } from '../lib/format';
import { formatearCedula, formatearTelefono, desglosarCedula } from '../lib/cedula';
import { useRouter } from '../lib/router';
import type { Cliente, CatActividadEconomica, CatDepartamento, CatMunicipio, Prestamo } from '../types';
import { BotonPagare } from '../components/BotonPagare';

const POR_PAGINA = 20;

const FORM_VACIO: Partial<Cliente> = {
  cedula: '',
  nombres: '',
  apellidos: '',
  telefono: '',
  direccion: '',
  actividad_economica: '',
  departamento: null,
  municipio: null,
  actividad_catalogo: null,
};

const ACTIVIDADES_RAPIDAS = [
  'Comercio / Pulpería',
  'Venta de Ropa',
  'Comedor / Alimentos',
  'Transporte / Taxi',
  'Taller / Oficios',
  'Empleado',
];

export function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'ACTIVOS' | 'INACTIVOS'>('TODOS');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Modal de Alta / Edición
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [formData, setFormData] = useState<Partial<Cliente>>(FORM_VACIO);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Modal de Ficha Personal / Expediente e Historial Crediticio
  const [clienteFicha, setClienteFicha] = useState<Cliente | null>(null);
  const [showFicha, setShowFicha] = useState(false);
  const [prestamosCliente, setPrestamosCliente] = useState<Prestamo[]>([]);
  const [loadingPrestamos, setLoadingPrestamos] = useState(false);
  const [filtroPrestamos, setFiltroPrestamos] = useState<'TODOS' | 'ACTIVOS' | 'FINALIZADOS'>('TODOS');

  // Catálogos Normalizados
  const [actividadesLista, setActividadesLista] = useState<CatActividadEconomica[]>([]);
  const [departamentosLista, setDepartamentosLista] = useState<CatDepartamento[]>([]);
  const [municipiosLista, setMunicipiosLista] = useState<CatMunicipio[]>([]);

  const toast = useToast();
  const { navigate, queryParams } = useRouter();


  useEffect(() => {
    Promise.all([catalogoService.actividades(), catalogoService.departamentos()])
      .then(([act, dep]) => {
        if (Array.isArray(act)) setActividadesLista(act);
        if (Array.isArray(dep)) setDepartamentosLista(dep);
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    if (formData.departamento) {
      catalogoService
        .municipios(Number(formData.departamento))
        .then((muns) => {
          if (Array.isArray(muns)) setMunicipiosLista(muns);
        })
        .catch(() => setMunicipiosLista([]));
    } else {
      setMunicipiosLista([]);
    }
  }, [formData.departamento]);

  const fetchClientes = async () => {
    setLoading(true);
    try {
      const data = await clienteService.list({ search, page });
      setClientes(data.results);
      setTotal(data.count);
    } catch {
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
    if (!formData.cedula?.trim()) errores.cedula = 'La cédula es obligatoria';
    if (!formData.nombres?.trim()) errores.nombres = 'Los nombres son obligatorios';
    if (!formData.apellidos?.trim()) errores.apellidos = 'Los apellidos son obligatorios';
    if (!formData.telefono?.trim()) errores.telefono = 'El teléfono es obligatorio';
    if (!formData.direccion?.trim()) errores.direccion = 'La dirección es obligatoria';
    setFormErrors(errores);
    return Object.keys(errores).length === 0;
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!validar()) return;
    setSubmitting(true);
    try {
      if (editing) {
        const actualizado = await clienteService.update(editing.id, formData);
        toast.success('Cliente actualizado exitosamente');
        cerrarForm();
        await fetchClientes();
        // Abrir ficha con los datos actualizados
        const clienteActualizado: Cliente = {
          ...editing,
          ...formData,
          ...(actualizado || {}),
        } as Cliente;
        setClienteFicha(clienteActualizado);
        setShowFicha(true);
        if (clienteActualizado.id) cargarPrestamos(clienteActualizado.id);
      } else {
        const nuevo = await clienteService.create(formData as Omit<Cliente, 'id' | 'creado_en' | 'actualizado_en'>);
        toast.success('Cliente registrado exitosamente');
        cerrarForm();
        await fetchClientes();
        // Mostrar modal de expediente del cliente recién agregado con datos completos
        const clienteCreado: Cliente = {
          id: nuevo?.id ?? 0,
          cedula: nuevo?.cedula ?? formData.cedula ?? '',
          nombres: nuevo?.nombres ?? formData.nombres ?? '',
          apellidos: nuevo?.apellidos ?? formData.apellidos ?? '',
          telefono: nuevo?.telefono ?? formData.telefono ?? '',
          direccion: nuevo?.direccion ?? formData.direccion ?? '',
          actividad_economica: nuevo?.actividad_economica ?? formData.actividad_economica ?? '',
          activo: nuevo?.activo ?? true,
          creado_en: nuevo?.creado_en ?? new Date().toISOString(),
          actualizado_en: nuevo?.actualizado_en ?? new Date().toISOString(),
        };
        setClienteFicha(clienteCreado);
        setShowFicha(true);
        if (clienteCreado.id) cargarPrestamos(clienteCreado.id);
      }
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
      departamento: cliente.departamento || null,
      municipio: cliente.municipio || null,
      actividad_catalogo: cliente.actividad_catalogo || null,
    });
    setFormErrors({});
    setShowFicha(false);
    setShowForm(true);
  };

  const cargarPrestamos = useCallback(async (clienteId: number) => {
    setLoadingPrestamos(true);
    try {
      const data = await clienteService.prestamos(clienteId);
      setPrestamosCliente(Array.isArray(data) ? data : (data as any)?.results || []);
    } catch {
      setPrestamosCliente([]);
    } finally {
      setLoadingPrestamos(false);
    }
  }, []);

  const verExpediente = useCallback((cliente: Cliente) => {
    setClienteFicha(cliente);
    setShowFicha(true);
    setFiltroPrestamos('TODOS');
    if (cliente?.id) {
      cargarPrestamos(cliente.id);
    }
  }, [cargarPrestamos]);

  const expedienteParam = queryParams.get('expediente') || queryParams.get('clienteId');

  useEffect(() => {
    if (!expedienteParam) return;
    const numId = Number(expedienteParam);
    if (!numId) return;

    // Si ya está abierto este cliente en la ficha, evitar peticiones concurrentes
    if (clienteFicha?.id === numId && showFicha) return;

    const existente = clientes.find((c) => c.id === numId);
    if (existente) {
      verExpediente(existente);
      return;
    }

    clienteService
      .get(numId)
      .then((c) => {
        if (c && c.id) {
          verExpediente(c);
        }
      })
      .catch(() => {});
  }, [expedienteParam]);

  // Créditos activos vs finalizados del cliente
  const prestamosActivos = useMemo(
    () => prestamosCliente.filter((p) => p.estado !== 'CANCELADO'),
    [prestamosCliente]
  );

  const prestamosFinalizados = useMemo(
    () => prestamosCliente.filter((p) => p.estado === 'CANCELADO'),
    [prestamosCliente]
  );

  const totalDeudaCliente = useMemo(
    () => prestamosActivos.reduce((acc, p) => acc + (Number(p.saldo_deudor) || Number(p.saldo_insoluto) || 0), 0),
    [prestamosActivos]
  );

  const prestamosVisibles = useMemo(() => {
    if (filtroPrestamos === 'ACTIVOS') return prestamosActivos;
    if (filtroPrestamos === 'FINALIZADOS') return prestamosFinalizados;
    return prestamosCliente;
  }, [filtroPrestamos, prestamosCliente, prestamosActivos, prestamosFinalizados]);

  const [clienteADesactivar, setClienteADesactivar] = useState<Cliente | null>(null);
  const [desactivando, setDesactivando] = useState(false);

  const solicitarDesactivar = (cliente: Cliente) => {
    setClienteADesactivar(cliente);
  };

  const ejecutarDesactivar = async () => {
    if (!clienteADesactivar) return;
    setDesactivando(true);
    try {
      await clienteService.delete(clienteADesactivar.id);
      toast.success('Cliente desactivado exitosamente');
      if (clienteFicha?.id === clienteADesactivar.id) {
        setShowFicha(false);
      }
      setClienteADesactivar(null);
      fetchClientes();
    } catch {
      toast.error('Error al desactivar el cliente');
    } finally {
      setDesactivando(false);
    }
  };

  const cerrarForm = useCallback(() => {
    setEditing(null);
    setFormData(FORM_VACIO);
    setFormErrors({});
    setShowForm(false);
  }, []);

  const cambiar = useCallback((campo: keyof Cliente, valor: string) => {
    let valorFinal = valor;
    if (campo === 'cedula' && !editing) {
      valorFinal = formatearCedula(valor);
    } else if (campo === 'telefono') {
      valorFinal = formatearTelefono(valor);
    }

    setFormData((prev) => ({ ...prev, [campo]: valorFinal }));
    setFormErrors((prev) => {
      if (prev[campo as string]) {
        return { ...prev, [campo as string]: '' };
      }
      return prev;
    });
  }, [editing]);

  // Filtrado local por estado
  const clientesFiltrados = useMemo(() => {
    if (filtroEstado === 'ACTIVOS') return clientes.filter((c) => c.activo);
    if (filtroEstado === 'INACTIVOS') return clientes.filter((c) => !c.activo);
    return clientes;
  }, [clientes, filtroEstado]);

  const totalPages = Math.max(1, Math.ceil(total / POR_PAGINA));

  // Metadatos de la cédula del cliente en ficha
  const infoCedula = useMemo(() => {
    if (!clienteFicha?.cedula) return null;
    return desglosarCedula(clienteFicha.cedula);
  }, [clienteFicha]);

  const columnas: Columna<Cliente>[] = [
    {
      key: 'cedula',
      header: 'Cédula',
      width: '140px',
      render: (cliente) => (
        <button
          type="button"
          onClick={() => verExpediente(cliente)}
          class="tnum inline-flex items-center gap-1 font-mono text-body-sm font-semibold text-slate-900 hover:text-green-700 hover:underline text-left"
          title="Ver expediente del cliente"
        >
          <Icon name="badge" size={14} class="text-slate-400" />
          {cliente.cedula}
        </button>
      ),
    },
    {
      key: 'nombre',
      header: 'Cliente / Prestatario',
      render: (cliente) => {
        const inits = iniciales(`${cliente.nombres} ${cliente.apellidos}`);
        return (
          <div class="flex items-center gap-3">
            <span
              class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-label-xs font-bold text-white shadow-sm ${cliente.activo ? 'bg-slate-800' : 'bg-slate-400'
                }`}
              aria-hidden="true"
            >
              {inits}
            </span>
            <div class="min-w-0">
              <button
                type="button"
                onClick={() => verExpediente(cliente)}
                class="truncate text-left font-semibold text-slate-900 hover:text-green-700 hover:underline block"
              >
                {cliente.nombres} {cliente.apellidos}
              </button>
              <p class="truncate text-body-sm text-slate-500">{cliente.direccion}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'telefono',
      header: 'Teléfono',
      width: '140px',
      render: (cliente) => (
        <a
          href={`tel:${cliente.telefono.replace(/\D/g, '')}`}
          class="tnum inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-green-700"
          title="Llamar directamente al cliente"
        >
          <Icon name="phone" size={14} class="text-slate-400" />
          {cliente.telefono}
        </a>
      ),
    },
    {
      key: 'actividad',
      header: 'Actividad Económica',
      width: '180px',
      render: (cliente) => (
        <span class="inline-block truncate max-w-[170px] text-body-sm text-slate-600">
          {cliente.actividad_economica ? (
            <span class="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
              {cliente.actividad_economica}
            </span>
          ) : (
            '-'
          )}
        </span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      width: '110px',
      render: (cliente) => (
        <span
          class={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-label-xs uppercase ${cliente.activo
              ? 'border-green-200 bg-green-50 text-green-700 font-semibold'
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
      width: '240px',
      render: (cliente) => (
        <div class="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon="history"
            onClick={() => verExpediente(cliente)}
            title="Ver expediente e historial crediticio completo"
            aria-label="Ficha e Historial"
          >
            Historial
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon="edit"
            onClick={() => handleEdit(cliente)}
            title="Editar cliente"
          >
            Editar
          </Button>
          {cliente.activo && (
            <Button
              variant="ghost"
              size="sm"
              icon="person_off"
              onClick={() => solicitarDesactivar(cliente)}
              title="Deshabilitar cliente"
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

      {/* Controles de búsqueda y filtros rápidos */}
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="relative w-full sm:max-w-md">
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

        {/* Selector de estado */}
        <div class="flex items-center gap-1 rounded-xl bg-slate-100 p-1 self-start sm:self-auto">
          {(['TODOS', 'ACTIVOS', 'INACTIVOS'] as const).map((est) => (
            <button
              key={est}
              type="button"
              onClick={() => setFiltroEstado(est)}
              class={`rounded-lg px-3 py-1.5 text-label-xs font-semibold uppercase tracking-wider transition-colors ${filtroEstado === est
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
                }`}
            >
              {est === 'TODOS' ? 'Todos' : est === 'ACTIVOS' ? 'Activos' : 'Inactivos'}
            </button>
          ))}
        </div>
      </div>

      <Card padded={false}>
        <DataTable
          columns={columnas}
          rows={clientesFiltrados}
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

      {/* MODAL 1: FICHA PERSONAL / EXPEDIENTE DEL CLIENTE */}
      <Modal
        open={showFicha && !!clienteFicha}
        onClose={() => setShowFicha(false)}
        title="Expediente del Cliente"
        subtitle={clienteFicha ? `Cédula: ${clienteFicha.cedula}` : ''}
        icon="badge"
        size="lg"
        footer={
          <div class="flex w-full items-center justify-between">
            <Button
              variant="secondary"
              size="sm"
              icon="receipt_long"
              onClick={() => {
                setShowFicha(false);
                navigate(
                  clienteFicha
                    ? `/reportes/estados-cuenta?cliente=${clienteFicha.id}`
                    : '/reportes/estados-cuenta'
                );
              }}
            >
              Ver Estado de Cuenta
            </Button>
            <div class="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setShowFicha(false)}>
                Cerrar
              </Button>
              {clienteFicha && (
                <Button
                  variant="secondary"
                  icon="edit"
                  onClick={() => handleEdit(clienteFicha)}
                >
                  Editar Datos
                </Button>
              )}
              {clienteFicha && clienteFicha.activo && (
                <Button
                  icon="add_circle"
                  onClick={() => {
                    setShowFicha(false);
                    navigate('/prestamos/nuevo');
                  }}
                >
                  Nuevo Préstamo
                </Button>
              )}
            </div>
          </div>
        }
      >
        {clienteFicha && (
          <div class="space-y-5">
            {/* Cabecera del Cliente */}
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div class="flex items-center gap-3.5">
                <span
                  class={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-title-md font-bold text-white shadow-sm ${clienteFicha.activo ? 'bg-slate-900' : 'bg-slate-400'
                    }`}
                >
                  {iniciales(`${clienteFicha.nombres} ${clienteFicha.apellidos}`)}
                </span>
                <div>
                  <h3 class="text-headline-sm font-bold text-slate-900 leading-tight">
                    {clienteFicha.nombres} {clienteFicha.apellidos}
                  </h3>
                  <div class="flex flex-wrap items-center gap-2 mt-1">
                    <span class="inline-flex items-center gap-1 font-mono text-label-sm font-semibold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                      <Icon name="badge" size={14} class="text-slate-400" />
                      {clienteFicha.cedula}
                    </span>
                    <span
                      class={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-label-xs uppercase font-bold ${clienteFicha.activo
                          ? 'bg-green-100 text-green-800'
                          : 'bg-slate-200 text-slate-600'
                        }`}
                    >
                      <span
                        class={`h-1.5 w-1.5 rounded-full ${clienteFicha.activo ? 'bg-green-600' : 'bg-slate-500'
                          }`}
                      />
                      {clienteFicha.activo ? 'Cliente Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Acciones Rápidas */}
              <div class="flex items-center gap-2 w-full sm:w-auto">
                <a
                  href={`tel:${(clienteFicha.telefono || '').replace(/\D/g, '')}`}
                  class="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-200 px-3.5 py-2 text-label-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 transition-colors"
                  title="Llamar al cliente"
                >
                  <Icon name="phone" size={16} class="text-green-700" />
                  Llamar ({clienteFicha.telefono || 'Sin teléfono'})
                </a>
              </div>
            </div>

            {/* Grid de Secciones de Información */}
            <div class="grid gap-4 sm:grid-cols-2">
              {/* Tarjeta 1: Identificación y Datos de Cédula */}
              <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div class="flex items-center gap-2 text-label-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                  <Icon name="badge" size={16} class="text-slate-400" />
                  Identificación Institucional
                </div>
                <div class="space-y-2 text-body-sm">
                  <div>
                    <span class="text-slate-500 block text-label-xs">Cédula Oficial</span>
                    <span class="font-mono font-bold text-slate-900 text-body-md">
                      {clienteFicha.cedula}
                    </span>
                  </div>
                  {infoCedula?.departamento && infoCedula.departamento !== 'N/A' && (
                    <div>
                      <span class="text-slate-500 block text-label-xs">Origen de Emisión</span>
                      <span class="font-medium text-slate-800">
                        {infoCedula.municipio !== infoCedula.departamento
                          ? `${infoCedula.municipio}, ${infoCedula.departamento}`
                          : infoCedula.departamento}
                      </span>
                    </div>
                  )}
                  {infoCedula?.fechaNacimientoTexto && (
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <span class="text-slate-500 block text-label-xs">Fecha Nacimiento (aprox)</span>
                        <span class="font-medium text-slate-800">
                          {infoCedula.fechaNacimientoTexto}
                        </span>
                      </div>
                      {infoCedula.edadAproximada && (
                        <div>
                          <span class="text-slate-500 block text-label-xs">Edad Aprox.</span>
                          <span class="font-medium text-slate-800">
                            {infoCedula.edadAproximada} años
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Tarjeta 2: Contacto y Ubicación Domiciliar */}
              <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div class="flex items-center gap-2 text-label-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                  <Icon name="location_on" size={16} class="text-slate-400" />
                  Contacto y Domicilio
                </div>
                <div class="space-y-2 text-body-sm">
                  <div>
                    <span class="text-slate-500 block text-label-xs">Teléfono Móvil</span>
                    <a
                      href={`tel:${(clienteFicha.telefono || '').replace(/\D/g, '')}`}
                      class="font-semibold text-slate-900 hover:text-green-700 inline-flex items-center gap-1.5"
                    >
                      <Icon name="phone" size={14} class="text-slate-400" />
                      {clienteFicha.telefono || 'Sin teléfono'}
                    </a>
                  </div>
                  <div>
                    <span class="text-slate-500 block text-label-xs">Dirección Física Completa</span>
                    <p class="font-medium text-slate-800 whitespace-pre-line leading-relaxed">
                      {clienteFicha.direccion}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tarjeta 3: Perfil Económico */}
              <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div class="flex items-center gap-2 text-label-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                  <Icon name="paid" size={16} class="text-slate-400" />
                  Perfil y Actividad Económica
                </div>
                <div class="space-y-2 text-body-sm">
                  <div>
                    <span class="text-slate-500 block text-label-xs">Rubro / Fuente de Ingresos</span>
                    <span class="inline-block mt-1 font-semibold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg">
                      {clienteFicha.actividad_economica || 'No especificada'}
                    </span>
                  </div>
                  <p class="text-label-xs text-slate-500 pt-1">
                    Actividad declarada para evaluación y asignación de ciclo de cobro.
                  </p>
                </div>
              </div>

              {/* Tarjeta 4: Trazabilidad en CAVI */}
              <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div class="flex items-center gap-2 text-label-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                  <Icon name="how_to_reg" size={16} class="text-slate-400" />
                  Registro en Sistema
                </div>
                <div class="space-y-2 text-body-sm">
                  <div class="grid grid-cols-2 gap-2">
                    <div>
                      <span class="text-slate-500 block text-label-xs">ID de Prestatario</span>
                      <span class="font-mono font-bold text-slate-900">
                        #CLI-{clienteFicha.id}
                      </span>
                    </div>
                    <div>
                      <span class="text-slate-500 block text-label-xs">Fecha de Registro</span>
                      <span class="font-medium text-slate-800">
                        {fmtFecha(clienteFicha.creado_en)}
                      </span>
                    </div>
                  </div>
                  {clienteFicha.actualizado_en && (
                    <div>
                      <span class="text-slate-500 block text-label-xs">Última Modificación</span>
                      <span class="text-slate-600 text-label-xs">
                        {fmtFechaHora(clienteFicha.actualizado_en)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sección de Historial Crediticio: Créditos Activos y Finalizados */}
            <div class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4 shadow-xs">
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
                <div class="flex items-center gap-2.5">
                  <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
                    <Icon name="history_edu" size={20} />
                  </div>
                  <div>
                    <h4 class="text-body-md font-bold text-slate-900">
                      Historial Crediticio del Prestatario
                    </h4>
                    <p class="text-label-xs text-slate-500">
                      Créditos activos en cobro y obligaciones finalizadas / canceladas
                    </p>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="sync"
                    loading={loadingPrestamos}
                    onClick={() => {
                      if (clienteFicha?.id) cargarPrestamos(clienteFicha.id);
                    }}
                    title="Actualizar listado de créditos del cliente"
                  >
                    Actualizar
                  </Button>

                  {/* Pestañas de filtrado de créditos */}
                  <div class="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setFiltroPrestamos('TODOS')}
                    class={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                      filtroPrestamos === 'TODOS'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todos ({prestamosCliente.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroPrestamos('ACTIVOS')}
                    class={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                      filtroPrestamos === 'ACTIVOS'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Activos ({prestamosActivos.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroPrestamos('FINALIZADOS')}
                    class={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                      filtroPrestamos === 'FINALIZADOS'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Finalizados ({prestamosFinalizados.length})
                  </button>
                  </div>
                </div>
              </div>

              {/* KPI Bar del Historial */}
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div class="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-center">
                  <span class="block text-label-xs font-bold uppercase tracking-wider text-slate-500">
                    Total Histórico
                  </span>
                  <span class="text-body-md font-black text-slate-900">
                    {prestamosCliente.length} crédito{prestamosCliente.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div class="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-center">
                  <span class="block text-label-xs font-bold uppercase tracking-wider text-emerald-700">
                    Créditos Activos
                  </span>
                  <span class="text-body-md font-black text-emerald-800">
                    {prestamosActivos.length} en cobro
                  </span>
                </div>
                <div class="rounded-xl border border-slate-200 bg-slate-100/60 p-3 text-center">
                  <span class="block text-label-xs font-bold uppercase tracking-wider text-slate-600">
                    Finalizados
                  </span>
                  <span class="text-body-md font-black text-slate-700">
                    {prestamosFinalizados.length} cancelados
                  </span>
                </div>
                <div class="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-center">
                  <span class="block text-label-xs font-bold uppercase tracking-wider text-blue-700">
                    Deuda Insoluta
                  </span>
                  <span class="text-body-md font-black text-blue-900">
                    {fmtMonto(totalDeudaCliente)}
                  </span>
                </div>
              </div>

              {/* Listado de préstamos del cliente */}
              {loadingPrestamos ? (
                <div class="flex justify-center py-8">
                  <Spinner size={32} />
                </div>
              ) : prestamosVisibles.length === 0 ? (
                <div class="py-6">
                  <EmptyState
                    icon="receipt_long"
                    title={
                      filtroPrestamos === 'ACTIVOS'
                        ? 'Sin créditos activos en este momento'
                        : filtroPrestamos === 'FINALIZADOS'
                        ? 'Sin créditos finalizados o cancelados'
                        : 'El prestatario no tiene créditos registrados'
                    }
                    description={
                      filtroPrestamos === 'TODOS'
                        ? 'Puede formalizar su primer crédito multifondo utilizando el botón superior.'
                        : 'No se encontraron préstamos que coincidan con el filtro seleccionado.'
                    }
                    action={
                      filtroPrestamos === 'TODOS' && clienteFicha.activo ? (
                        <Button
                          size="sm"
                          icon="post_add"
                          onClick={() => {
                            setShowFicha(false);
                            navigate('/prestamos/nuevo');
                          }}
                        >
                          Nuevo Préstamo
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <div class="overflow-x-auto rounded-xl border border-slate-200">
                  <table class="w-full text-left border-collapse text-body-sm">
                    <thead>
                      <tr class="border-b border-slate-200 bg-slate-50/80 text-label-xs font-bold uppercase tracking-wider text-slate-500">
                        <th class="py-2.5 px-3">Préstamo</th>
                        <th class="py-2.5 px-3">Condiciones</th>
                        <th class="py-2.5 px-3 text-right">Monto Original</th>
                        <th class="py-2.5 px-3 text-right">Saldo Deudor</th>
                        <th class="py-2.5 px-3">Estado</th>
                        <th class="py-2.5 px-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                      {prestamosVisibles.map((p) => {
                        const esCancelado = p.estado === 'CANCELADO';
                        const esMora = p.estado === 'EN_MORA' || (p.dias_atraso ?? 0) > (p.dias_gracia || 4);
                        const esGracia = p.estado === 'EN_GRACIA' || ((p.dias_atraso ?? 0) > 0 && !esMora);

                        return (
                          <tr key={p.id} class="hover:bg-slate-50/80 transition-colors">
                            {/* ID y Fechas */}
                            <td class="py-2.5 px-3">
                              <span class="font-bold text-slate-900 block">
                                Préstamo #{p.id}
                              </span>
                              <span class="text-[11px] text-slate-500 font-mono block">
                                Otorgado: {fmtFecha(p.fecha_desembolso)}
                              </span>
                            </td>

                            {/* Condiciones */}
                            <td class="py-2.5 px-3 text-body-sm">
                              <span class="font-semibold text-slate-800 block">
                                {(Number(p.tasa_interes) * 100).toFixed(2)}% mensual
                              </span>
                              <span class="text-[11px] text-slate-500 block">
                                {p.plazo_meses > 0 ? `${p.plazo_meses} meses (${p.periodicidad})` : 'Plazo Indefinido'}
                              </span>
                            </td>

                            {/* Monto Original */}
                            <td class="py-2.5 px-3 text-right font-medium text-slate-800 tnum">
                              {fmtMonto(p.monto_principal)}
                            </td>

                            {/* Saldo Deudor */}
                            <td class="py-2.5 px-3 text-right">
                              {esCancelado ? (
                                <span class="font-mono text-xs font-semibold text-slate-400">
                                  C$0.00 (Saldado)
                                </span>
                              ) : (
                                <span class="font-bold text-slate-900 block tnum">
                                  {fmtMonto(p.saldo_deudor || p.saldo_insoluto)}
                                </span>
                              )}
                            </td>

                            {/* Estado con Badge */}
                            <td class="py-2.5 px-3">
                              {esCancelado ? (
                                <span class="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-xs font-bold border border-slate-200">
                                  <Icon name="check_circle" size={14} class="text-emerald-600" />
                                  Finalizado / Saldado
                                </span>
                              ) : esMora ? (
                                <span class="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 px-2.5 py-0.5 text-xs font-bold border border-rose-200">
                                  <span class="h-1.5 w-1.5 rounded-full bg-rose-600" />
                                  En Mora ({(p as any).dias_mora ?? p.dias_atraso}d)
                                </span>
                              ) : esGracia ? (
                                <span class="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2.5 py-0.5 text-xs font-bold border border-amber-200">
                                  <span class="h-1.5 w-1.5 rounded-full bg-amber-600" />
                                  Límite de Gracia
                                </span>
                              ) : (
                                <span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-xs font-bold border border-emerald-200">
                                  <span class="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                                  Activo / Al Día
                                </span>
                              )}
                            </td>

                            {/* Acciones por Préstamo */}
                            <td class="py-2.5 px-3 text-right">
                              <div class="flex items-center justify-end gap-1.5">
                                <BotonPagare
                                  prestamoId={p.id}
                                  size="sm"
                                  variant="secondary"
                                  label="Ver Pagaré"
                                  abrirVentana={true}
                                  onError={toast.error}
                                />

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon="receipt_long"
                                  onClick={() => {
                                    setShowFicha(false);
                                    navigate(
                                      `/reportes/estados-cuenta?cliente=${clienteFicha.id}&prestamo=${p.id}`
                                    );
                                  }}
                                  title="Ver estado de cuenta de este crédito"
                                >
                                  Estado Cuenta
                                </Button>

                                {!esCancelado && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    icon="payments"
                                    onClick={() => {
                                      setShowFicha(false);
                                      navigate('/cobros');
                                    }}
                                    title="Ir a registrar abono"
                                  >
                                    Cobrar
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 2: FORMULARIO DE ALTA / EDICIÓN */}
      <Modal
        open={showForm}
        onClose={cerrarForm}
        title={editing ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}
        subtitle={
          editing
            ? `Cédula ${editing.cedula} no se puede modificar`
            : 'Complete la información principal de identidad y contacto'
        }
        icon="person"
        size="md"
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
          {/* Bloque 1: Identificación de la Cédula */}
          <div class="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 space-y-3">
            <div class="flex items-center gap-2 text-label-xs uppercase font-bold tracking-wider text-slate-500">
              <Icon name="badge" size={16} class="text-slate-400" />
              Datos de Cédula de Identidad
            </div>

            <Input
              label="Cédula"
              value={formData.cedula || ''}
              onInput={(valor) => cambiar('cedula', valor)}
              disabled={!!editing}
              required
              placeholder="001-000000-0000A"
              error={formErrors.cedula}
              hint={editing ? undefined : 'Formato: 001-XXXXXX-XXXXX (14 caracteres)'}
            />

            <div class="grid gap-3 sm:grid-cols-2">
              <Input
                label="Nombres"
                value={formData.nombres || ''}
                onInput={(valor) => cambiar('nombres', valor)}
                placeholder="Nombres según cédula"
                required
                error={formErrors.nombres}
              />
              <Input
                label="Apellidos"
                value={formData.apellidos || ''}
                onInput={(valor) => cambiar('apellidos', valor)}
                placeholder="Apellidos según cédula"
                required
                error={formErrors.apellidos}
              />
            </div>
          </div>

          {/* Bloque 2: Contacto Principal y Domicilio */}
          <div class="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 space-y-3">
            <div class="flex items-center gap-2 text-label-xs uppercase font-bold tracking-wider text-slate-500">
              <Icon name="phone" size={16} class="text-slate-400" />
              Contacto Principal y Domicilio
            </div>

            <Input
              label="Teléfono"
              value={formData.telefono || ''}
              onInput={(valor) => cambiar('telefono', valor)}
              type="tel"
              placeholder="Ej. 8888-8888"
              required
              error={formErrors.telefono}
              hint="Número celular para llamadas y notificaciones de cobro"
            />

            <div class="grid gap-3 sm:grid-cols-2">
              <Select
                label="Departamento"
                value={String(formData.departamento || '')}
                onChange={(val) => {
                  setFormData((prev) => ({
                    ...prev,
                    departamento: val ? Number(val) : null,
                    municipio: null,
                  }));
                }}
                options={[
                  { value: '', label: 'Seleccionar Departamento' },
                  ...departamentosLista.map((d) => ({ value: String(d.id), label: d.nombre })),
                ]}
              />
              <Select
                label="Municipio"
                value={String(formData.municipio || '')}
                onChange={(val) => {
                  setFormData((prev) => ({
                    ...prev,
                    municipio: val ? Number(val) : null,
                  }));
                }}
                disabled={!formData.departamento || municipiosLista.length === 0}
                options={[
                  { value: '', label: 'Seleccionar Municipio' },
                  ...municipiosLista.map((m) => ({ value: String(m.id), label: m.nombre })),
                ]}
              />
            </div>

            <Textarea
              label="Dirección exacta"
              value={formData.direccion || ''}
              onInput={(valor) => cambiar('direccion', valor)}
              placeholder="Barrio, calle, número de casa o punto de referencia exacto"
              required
              error={formErrors.direccion}
              rows={2}
            />
          </div>

          {/* Bloque 3: Actividad Económica con accesos rápidos del catálogo */}
          <div class="space-y-2 pt-1">
            <Input
              label="Actividad Económica"
              value={formData.actividad_economica || ''}
              onInput={(valor) => cambiar('actividad_economica', valor)}
              placeholder="Ej. Pulpería, Comercio, Transporte..."
              hint="Rubro económico o fuente de ingresos del prestatario"
            />

            <div class="flex flex-wrap gap-1.5 pt-1">
              {(actividadesLista.length > 0 ? actividadesLista.map((a) => a.nombre) : ACTIVIDADES_RAPIDAS).map((act) => {
                const actObj = actividadesLista.find((a) => a.nombre === act);
                return (
                  <button
                    type="button"
                    key={act}
                    onClick={() => {
                      cambiar('actividad_economica', act);
                      if (actObj) {
                        setFormData((prev) => ({ ...prev, actividad_catalogo: actObj.id }));
                      }
                    }}
                    class={`rounded-full border px-2.5 py-1 text-label-xs transition-colors ${formData.actividad_economica === act
                        ? 'border-green-600 bg-green-50 font-semibold text-green-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                  >
                    + {act}
                  </button>
                );
              })}
            </div>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: CONFIRMACIÓN PARA DESACTIVAR CLIENTE */}
      {clienteADesactivar && (
        <ConfirmModal
          open={Boolean(clienteADesactivar)}
          onClose={() => setClienteADesactivar(null)}
          onConfirm={ejecutarDesactivar}
          loading={desactivando}
          title="Desactivar Prestatario"
          message={`¿Está seguro de desactivar al prestatario "${clienteADesactivar.nombres} ${clienteADesactivar.apellidos}" (Cédula: ${clienteADesactivar.cedula})? Su expediente pasará a estado inactivo.`}
          variant="danger"
          confirmText="Desactivar"
          cancelText="Cancelar"
        />
      )}
    </Layout>
  );
}
