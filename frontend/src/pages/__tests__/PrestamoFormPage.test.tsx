import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({
  clienteService: {
    list: vi.fn(),
  },
  fondoService: {
    list: vi.fn(),
  },
  prestamoService: {
    list: vi.fn(),
    create: vi.fn(),
    pagarPagare: vi.fn(),
    abrirPagareHtml: vi.fn(),
    simular: vi.fn(),
  },
}));

vi.mock('../../components/Layout', () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

import { clienteService, fondoService, prestamoService } from '../../services/api';
import { PrestamoFormPage } from '../PrestamoFormPage';

const CLIENTES = [
  { id: 1, cedula: '001-111222-3', nombres: 'Juan', apellidos: 'Perez', telefono: '8888-1111', direccion: 'Managua', activo: true },
  { id: 2, cedula: '001-999888-7', nombres: 'Maria', apellidos: 'Lopez', telefono: '8888-2222', direccion: 'Tipitapa', activo: true },
];

const FONDOS = [
  { id: 1, nombre: 'Fondo Principal', familiar: 'Fam Uno', saldo_disponible: '50000.00', activo: true },
  { id: 2, nombre: 'Fondo Secundario', familiar: 'Fam Dos', saldo_disponible: '30000.00', activo: true },
];

const SIMULACION = {
  prestamo: null,
  cliente: null,
  monto_principal: '50000.00',
  tasa_periodica: '0.0250',
  periodicidad: 'MENSUAL',
  plazo_meses: 12,
  total_periodos: 2,
  total_interes: '10000.00',
  total_cuotas: '60000.00',
  periodos: [
    { periodo: 1, fecha_vencimiento: '2026-11-01', cuota: 4874.36, interes: 1250, capital: 3624.36, saldo_insoluto: 46375.64 },
    { periodo: 2, fecha_vencimiento: '2026-12-01', cuota: 4874.36, interes: 1159.39, capital: 3714.97, saldo_insoluto: 42660.67 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  (fondoService.list as any).mockResolvedValue({ results: FONDOS });
  (prestamoService.simular as any).mockResolvedValue(SIMULACION);
  (prestamoService.list as any).mockResolvedValue({ results: [] });
});

describe('PrestamoFormPage (Formulario por Páginas)', () => {
  it('muestra el navegador de páginas e inicia en el Paso 1 de Cliente', async () => {
    render(<PrestamoFormPage />);
    expect(screen.getByText('1. Cliente')).toBeInTheDocument();
    expect(screen.getByText('2. Condiciones')).toBeInTheDocument();
    expect(screen.getByText('3. Fondeo')).toBeInTheDocument();
    expect(screen.getByText('4. Revisión')).toBeInTheDocument();
    expect(screen.getByText('Paso 1: Titular del Préstamo')).toBeInTheDocument();
  });

  it('permite navegar entre pasos mediante las pestañas superiores', async () => {
    render(<PrestamoFormPage />);
    await waitFor(() => expect(screen.getByText('1. Cliente')).toBeInTheDocument());

    // Clic en pestaña Fondeo
    fireEvent.click(screen.getByRole('button', { name: /3\. Fondeo/i }));
    await waitFor(() => {
      expect(screen.getByText('Paso 3: Distribución Multifondo')).toBeInTheDocument();
      expect(screen.getByText('Fondo Principal')).toBeInTheDocument();
      expect(screen.getByText('Fondo Secundario')).toBeInTheDocument();
    });

    // Clic en pestaña Condiciones
    fireEvent.click(screen.getByRole('button', { name: /2\. Condiciones/i }));
    await waitFor(() => {
      expect(screen.getByText('Paso 2: Condiciones del Préstamo')).toBeInTheDocument();
    });
  });

  it('valida la selección del cliente antes de permitir avanzar desde el Paso 1', async () => {
    (clienteService.list as any).mockResolvedValue({ results: CLIENTES });
    render(<PrestamoFormPage />);

    const btnSiguiente = screen.getByRole('button', { name: /Siguiente: Condiciones/i }) as HTMLButtonElement;
    expect(btnSiguiente.disabled).toBe(true);

    // Buscar y seleccionar cliente
    fireEvent.focus(screen.getByLabelText('Cliente'));
    fireEvent.input(screen.getByLabelText('Cliente'), { target: { value: 'Juan' } });
    await waitFor(() => expect(screen.getByText('Juan Perez')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Juan Perez'));

    // Al seleccionar, se habilita el botón y se muestra la ficha del cliente
    await waitFor(() => {
      expect(btnSiguiente.disabled).toBe(false);
      expect(screen.getByText('Cambiar Titular')).toBeInTheDocument();
    });

    // Avanza a condiciones
    fireEvent.click(btnSiguiente);
    await waitFor(() => {
      expect(screen.getByText('Paso 2: Condiciones del Préstamo')).toBeInTheDocument();
    });
  });

  it('en el Paso 2 cotiza la cuota en tiempo real y permite volver al Paso 1', async () => {
    render(<PrestamoFormPage />);

    // Navegar a Condiciones
    fireEvent.click(screen.getByRole('button', { name: /2\. Condiciones/i }));
    await waitFor(() => expect(screen.getByText('Paso 2: Condiciones del Préstamo')).toBeInTheDocument());

    expect(screen.getByText('Sin simulación')).toBeInTheDocument();

    // Ingresar monto
    fireEvent.input(screen.getByLabelText(/Monto principal/), { target: { value: '50000' } });

    await waitFor(() => {
      expect(prestamoService.simular).toHaveBeenCalledWith(
        expect.objectContaining({ monto_principal: '50000', plazo_meses: 12, periodicidad: 'MENSUAL' })
      );
    });

    expect(screen.getByText('Cuota estimada por periodo').parentElement?.textContent).toContain('C$4,874.36');
    expect(screen.getByText('Total a pagar:').parentElement?.textContent).toContain('C$60,000.00');
    expect(screen.getByText('Interés total:').parentElement?.textContent).toContain('C$10,000.00');

    // Botón anterior regresa a Cliente
    fireEvent.click(screen.getByRole('button', { name: /Anterior: Cliente/i }));
    await waitFor(() => {
      expect(screen.getByText('Paso 1: Titular del Préstamo')).toBeInTheDocument();
    });
  });

  it('en el Paso 3 distribuye automáticamente el monto entre fondos y calcula Pi', async () => {
    render(<PrestamoFormPage />);

    // Navegar a Condiciones para ingresar monto
    fireEvent.click(screen.getByRole('button', { name: /2\. Condiciones/i }));
    fireEvent.input(screen.getByLabelText(/Monto principal/), { target: { value: '50000' } });

    // Navegar a Fondeo
    fireEvent.click(screen.getByRole('button', { name: /3\. Fondeo/i }));
    await waitFor(() => expect(screen.getByText('Fondo Principal')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Usar fondo Fondo Principal'));
    fireEvent.click(screen.getByLabelText('Usar fondo Fondo Secundario'));

    screen.getByText('Distribuir automático').click();

    await waitFor(() => {
      const montos = screen.getAllByLabelText(/Monto aportado/) as HTMLInputElement[];
      expect(montos[0].value).toBe('25000.00');
      expect(montos[1].value).toBe('25000.00');
    });

    const pis = screen.getAllByLabelText(/% Pi/) as HTMLInputElement[];
    expect(pis[0].value).toBe('50.00');
    expect(pis[1].value).toBe('50.00');

    expect(screen.getByText('1.0000')).toBeInTheDocument();
  });

  it('completa el flujo por páginas y crea el préstamo al confirmar con datos válidos', async () => {
    (clienteService.list as any).mockResolvedValue({ results: CLIENTES });
    (prestamoService.create as any).mockResolvedValue({
      id: 1,
      cliente_nombre: 'Juan Perez - 001-111222-3',
      monto_principal: '50000.00',
    });

    render(<PrestamoFormPage />);

    // === PASO 1: SELECCIONAR CLIENTE ===
    fireEvent.focus(screen.getByLabelText('Cliente'));
    fireEvent.input(screen.getByLabelText('Cliente'), { target: { value: 'Juan' } });
    await waitFor(() => expect(screen.getByText('Juan Perez')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Juan Perez'));

    const btnSig1 = screen.getByRole('button', { name: /Siguiente: Condiciones/i });
    fireEvent.click(btnSig1);

    // === PASO 2: CONDICIONES ===
    await waitFor(() => expect(screen.getByText('Paso 2: Condiciones del Préstamo')).toBeInTheDocument());
    fireEvent.input(screen.getByLabelText(/Monto principal/), { target: { value: '50000' } });
    fireEvent.input(screen.getByLabelText('Plazo (meses)'), { target: { value: '12' } });
    fireEvent.input(screen.getByLabelText('Fecha desembolso'), { target: { value: '2026-10-01' } });
    fireEvent.input(screen.getByLabelText('Fecha primer corte'), { target: { value: '2026-11-01' } });

    const btnSig2 = screen.getByRole('button', { name: /Siguiente: Fondeo/i });
    fireEvent.click(btnSig2);

    // === PASO 3: FONDEO ===
    await waitFor(() => expect(screen.getByText('Paso 3: Distribución Multifondo')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Usar fondo Fondo Principal'));
    fireEvent.click(screen.getByLabelText('Usar fondo Fondo Secundario'));
    screen.getByText('Distribuir automático').click();

    const btnSig3 = screen.getByRole('button', { name: /Siguiente: Revisión/i });
    fireEvent.click(btnSig3);

    // === PASO 4: REVISIÓN Y CONFIRMACIÓN ===
    await waitFor(() => expect(screen.getByText('Paso 4: Expediente y Amortización Proyectada')).toBeInTheDocument());
    const btnCrear = screen.getByRole('button', { name: /Revisar y Crear Préstamo/i });
    expect(btnCrear).toBeInTheDocument();
    fireEvent.click(btnCrear);

    // Modal de confirmación
    await waitFor(() => expect(screen.getAllByText('Confirmar Desembolso').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Desembolso' }));

    await waitFor(() => {
      expect(prestamoService.create).toHaveBeenCalled();
      const args = (prestamoService.create as any).mock.calls[0][0];
      expect(args.monto_principal).toBe('50000');
      expect(args.fondos_detalle).toHaveLength(2);
      expect(args.fondos_detalle[0].porcentaje_pi).toBe('0.5000');
      expect(args.fondos_detalle[1].porcentaje_pi).toBe('0.5000');
    });

    // Pantalla de éxito
    await waitFor(() => expect(screen.getByText(/Préstamo #1 creado exitosamente/)).toBeInTheDocument());
    expect(screen.getByTestId('pagare-1')).toBeInTheDocument();

    (prestamoService.abrirPagareHtml as any).mockResolvedValue('<html>PAGARE</html>');
    const ventana = { document: { write: vi.fn(), close: vi.fn() }, focus: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(ventana as unknown as Window);
    fireEvent.click(screen.getByTestId('pagare-1'));
    await waitFor(() => expect(prestamoService.abrirPagareHtml).toHaveBeenCalledWith(1));
  });
});