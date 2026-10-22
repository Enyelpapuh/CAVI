import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/api', () => ({
  clienteService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../components/Layout', () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

import { clienteService } from '../../services/api';
import { ToastProvider } from '../../components/ui';
import { ClientesPage } from '../ClientesPage';

const CLIENTES = [
  {
    id: 1,
    cedula: '001-111222-3',
    nombres: 'Juan',
    apellidos: 'Perez Ramirez',
    telefono: '8888-1111',
    direccion: 'Barrio Centro, Managua',
    actividad_economica: 'Comerciante',
    activo: true,
  },
  {
    id: 2,
    cedula: '002-333444-5',
    nombres: 'Maria',
    apellidos: 'Lopez',
    telefono: '7777-2222',
    direccion: 'Masaya',
    actividad_economica: '',
    activo: false,
  },
];

const renderPage = () =>
  render(
    <ToastProvider>
      <ClientesPage />
    </ToastProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  (clienteService.list as any).mockResolvedValue({ results: CLIENTES, count: CLIENTES.length });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ClientesPage', () => {
  it('lista el padrón en la DataTable', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Juan Perez Ramirez')).toBeInTheDocument());

    expect(clienteService.list).toHaveBeenCalledWith({ search: '', page: 1 });
    expect(screen.getByText('001-111222-3')).toBeInTheDocument();
    expect(screen.getByText('Barrio Centro, Managua')).toBeInTheDocument();
    expect(screen.getByText('Comerciante')).toBeInTheDocument();
    // Segundo cliente sin actividad econ\u00f3mica y deshabilitado
    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.getAllByText('Inactivo')).toHaveLength(1);
    // Solo el cliente activo se puede deshabilitar
    expect(screen.getAllByRole('button', { name: /Deshabilitar/ })).toHaveLength(1);
  });

  it('filtra por nombre o cédula con el buscador', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Juan Perez Ramirez')).toBeInTheDocument());

    fireEvent.input(screen.getByLabelText('Buscar clientes'), { target: { value: '001-111' } });

    await waitFor(() =>
      expect(clienteService.list).toHaveBeenCalledWith({ search: '001-111', page: 1 })
    );
  });

  it('valida los campos obligatorios antes de crear', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Juan Perez Ramirez')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Nuevo Cliente/i }));
    fireEvent.input(screen.getByLabelText(/Cédula/), { target: { value: '003-555666-7' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear Cliente/i }));

    await waitFor(() => expect(screen.getByText('Los nombres son obligatorios')).toBeInTheDocument());
    expect(screen.getByText('Los apellidos son obligatorios')).toBeInTheDocument();
    expect(screen.getByText('El teléfono es obligatorio')).toBeInTheDocument();
    expect(screen.getByText('La dirección es obligatoria')).toBeInTheDocument();
    expect(clienteService.create).not.toHaveBeenCalled();
  });

  it('crea el cliente y recarga el padrón', async () => {
    (clienteService.create as any).mockResolvedValue({ id: 3 });
    renderPage();
    await waitFor(() => expect(screen.getByText('Juan Perez Ramirez')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Nuevo Cliente/i }));
    fireEvent.input(screen.getByLabelText(/Cédula/), { target: { value: '003-555666-7' } });
    fireEvent.input(screen.getByLabelText(/^Nombres/), { target: { value: 'Ana' } });
    fireEvent.input(screen.getByLabelText(/Apellidos/), { target: { value: 'Ruiz' } });
    fireEvent.input(screen.getByLabelText(/Teléfono/), { target: { value: '6666-3333' } });
    fireEvent.input(screen.getByLabelText(/Dirección/), { target: { value: 'León' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear Cliente/i }));

    await waitFor(() =>
      expect(clienteService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cedula: '003-555666-7',
          nombres: 'Ana',
          apellidos: 'Ruiz',
          telefono: '6666-3333',
          direccion: 'León',
        })
      )
    );
    await waitFor(() => expect(clienteService.list).toHaveBeenCalledTimes(2));
  });

  it('edita el cliente seleccionado sin permitir cambiar la cédula', async () => {
    (clienteService.update as any).mockResolvedValue({});
    renderPage();
    await waitFor(() => expect(screen.getByText('Juan Perez Ramirez')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /Editar/ })[0]);
    expect(screen.getByLabelText(/Cédula/)).toHaveProperty('disabled', true);
    fireEvent.input(screen.getByLabelText(/Teléfono/), { target: { value: '8888-9999' } });
    fireEvent.click(screen.getByRole('button', { name: /Actualizar/i }));

    await waitFor(() =>
      expect(clienteService.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ telefono: '8888-9999' })
      )
    );
  });

  it('deshabilita el cliente solo tras confirmar', async () => {
    (clienteService.delete as any).mockResolvedValue({});
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmSpy);
    renderPage();
    await waitFor(() => expect(screen.getByText('Juan Perez Ramirez')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Deshabilitar/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(clienteService.delete).not.toHaveBeenCalled();

    vi.stubGlobal('confirm', () => true);
    fireEvent.click(screen.getByRole('button', { name: /Deshabilitar/i }));
    await waitFor(() => expect(clienteService.delete).toHaveBeenCalledWith(1));
  });

  it('abre el expediente personal del cliente con su informacion detallada', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Juan Perez Ramirez')).toBeInTheDocument());

    // Pulsar botón "Ficha" del primer cliente
    const botonesFicha = screen.getAllByRole('button', { name: /Ficha/i });
    fireEvent.click(botonesFicha[0]);

    // Verificar modal de expediente
    await waitFor(() => expect(screen.getByText('Expediente del Cliente')).toBeInTheDocument());
    expect(screen.getByText('Identificación Institucional')).toBeInTheDocument();
    expect(screen.getByText('Contacto y Domicilio')).toBeInTheDocument();
    expect(screen.getByText('Perfil y Actividad Económica')).toBeInTheDocument();
    expect(screen.getByText('Registro en Sistema')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nuevo Préstamo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Editar Datos/i })).toBeInTheDocument();
  });

  it('filtra clientes por pestañas de estado (Todos, Activos, Inactivos)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Juan Perez Ramirez')).toBeInTheDocument());

    // Filtrar por Inactivos
    fireEvent.click(screen.getByRole('button', { name: 'Inactivos' }));
    expect(screen.queryByText('Juan Perez Ramirez')).not.toBeInTheDocument();
    expect(screen.getByText('Maria Lopez')).toBeInTheDocument();

    // Filtrar por Activos
    fireEvent.click(screen.getByRole('button', { name: 'Activos' }));
    expect(screen.getByText('Juan Perez Ramirez')).toBeInTheDocument();
    expect(screen.queryByText('Maria Lopez')).not.toBeInTheDocument();

    // Volver a Todos
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(screen.getByText('Juan Perez Ramirez')).toBeInTheDocument();
    expect(screen.getByText('Maria Lopez')).toBeInTheDocument();
  });
});

