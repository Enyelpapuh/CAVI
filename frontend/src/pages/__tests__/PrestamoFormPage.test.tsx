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
    create: vi.fn(),
    simular: vi.fn(),
  },
}));

vi.mock('../../components/Layout', () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

import { clienteService, fondoService, prestamoService } from '../../services/api';
import { PrestamoFormPage } from '../PrestamoFormPage';

const CLIENTES = [
  { id: 1, cedula: '001-111222-3', nombres: 'Juan', apellidos: 'Perez', activo: true },
  { id: 2, cedula: '001-999888-7', nombres: 'Maria', apellidos: 'Lopez', activo: true },
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
});

describe('PrestamoFormPage', () => {
  it('carga fondos disponibles y muestra tabla multifondo', async () => {
    render(<PrestamoFormPage />);
    await waitFor(() => {
      expect(screen.getByText('Fondo Principal')).toBeInTheDocument();
      expect(screen.getByText('Fondo Secundario')).toBeInTheDocument();
    });
  });

  it('deshabilita el botón hasta que las validaciones pasen', async () => {
    render(<PrestamoFormPage />);
    await waitFor(() => expect(screen.getByText('Fondo Principal')).toBeInTheDocument());

    const btn = screen.getByText('Revisar y Crear Préstamo') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/Seleccione un cliente/)).toBeInTheDocument();
    expect(screen.getByText(/El monto principal debe ser mayor a cero/)).toBeInTheDocument();
  });

  it('distribuye automáticamente el monto entre fondos y calcula Pi', async () => {
    render(<PrestamoFormPage />);
    await waitFor(() => expect(screen.getByText('Fondo Principal')).toBeInTheDocument());

    const montoInput = screen.getByLabelText(/Monto principal/) as HTMLInputElement;
    fireEvent.input(montoInput, { target: { value: '50000' } });

    fireEvent.click(screen.getByLabelText('Usar fondo Fondo Principal'));
    fireEvent.click(screen.getByLabelText('Usar fondo Fondo Secundario'));

    screen.getByText('Distribuir automático').click();

    await waitFor(() => {
      const montos = screen.getAllByLabelText(/Monto aportado/) as HTMLInputElement[];
      expect(montos[0].value).toBe('25000.00');
      expect(montos[1].value).toBe('25000.00');
    });

    const pis = screen.getAllByLabelText(/% Pi/) as HTMLInputElement[];
    expect(pis[0].value).toBe('0.5000');
    expect(pis[1].value).toBe('0.5000');

    expect(screen.getByText('1.0000')).toBeInTheDocument();
  });

  it('requiere seleccionar cliente y elegir fecha', async () => {
    render(<PrestamoFormPage />);
    await waitFor(() => expect(screen.getByText('Fondo Principal')).toBeInTheDocument());
    expect(screen.getByText('Indique la fecha de desembolso')).toBeInTheDocument();
    expect(screen.getByText('Indique la fecha del primer corte')).toBeInTheDocument();
  });

  it('cotiza la cuota contra el backend sin persistir el préstamo', async () => {
    (prestamoService.create as any).mockResolvedValue({});
    render(<PrestamoFormPage />);
    await waitFor(() => expect(screen.getByText('Fondo Principal')).toBeInTheDocument());

    // Sin monto no hay simulación
    expect(screen.getByText('Sin simulación')).toBeInTheDocument();

    fireEvent.input(screen.getByLabelText(/Monto principal/), { target: { value: '50000' } });

    await waitFor(() => {
      expect(prestamoService.simular).toHaveBeenCalledWith(
        expect.objectContaining({ monto_principal: '50000', plazo_meses: 12, periodicidad: 'MENSUAL' })
      );
    });
    expect(screen.getByText('Cuota estimada').parentElement?.textContent).toContain('C$4,874.36');
    expect(screen.getByText('Total a pagar').parentElement?.textContent).toContain('C$60,000.00');
    expect(screen.getByText('Interés total').parentElement?.textContent).toContain('C$10,000.00');
    expect(screen.getByText('Saldo insoluto')).toBeInTheDocument();
    // Cotizar no crea nada
    expect(prestamoService.create).not.toHaveBeenCalled();
  });

  it('crea el préstamo al confirmar con datos válidos', async () => {
    (clienteService.list as any).mockResolvedValue({ results: CLIENTES });
    (prestamoService.create as any).mockResolvedValue({
      id: 1,
      cliente_nombre: 'Juan Perez - 001-111222-3',
      monto_principal: '50000.00',
    });

    render(<PrestamoFormPage />);
    await waitFor(() => expect(screen.getByText('Fondo Principal')).toBeInTheDocument());

    // Seleccionar cliente
    fireEvent.focus(screen.getByLabelText('Cliente'));
    fireEvent.input(screen.getByLabelText('Cliente'), { target: { value: 'Juan' } });
    await waitFor(() => expect(screen.getByText('Juan Perez')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Juan Perez'));

    // Condiciones
    fireEvent.input(screen.getByLabelText(/Monto principal/), { target: { value: '50000' } });
    fireEvent.input(screen.getByLabelText('Plazo (meses)'), { target: { value: '12' } });
    fireEvent.input(screen.getByLabelText('Fecha desembolso'), { target: { value: '2026-10-01' } });
    fireEvent.input(screen.getByLabelText('Fecha primer corte'), { target: { value: '2026-11-01' } });

    // Fondos y distribución
    fireEvent.click(screen.getByLabelText('Usar fondo Fondo Principal'));
    fireEvent.click(screen.getByLabelText('Usar fondo Fondo Secundario'));
    screen.getByText('Distribuir automático').click();

    const btn = await waitFor(() => {
      const b = screen.getByText('Revisar y Crear Préstamo') as HTMLButtonElement;
      expect(b.disabled).toBe(false);
      return b;
    });

    fireEvent.click(btn);

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

    await waitFor(() => expect(screen.getByText(/Préstamo #1 creado exitosamente/)).toBeInTheDocument());
  });
});