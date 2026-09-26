import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({
  prestamoService: {
    list: vi.fn(),
    pagar: vi.fn(),
  },
  pagoService: {
    getRecibo: vi.fn(),
  },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { rol: 'ADMINISTRADOR' } }),
}));

vi.mock('../../components/Layout', () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

import { prestamoService, pagoService } from '../../services/api';
import { CobrosPage } from '../CobrosPage';

const PRESTAMOS = [
  {
    id: 1,
    cliente: 1,
    cliente_nombre: 'Juan Perez - 001-111222-3',
    monto_principal: '10000.00',
    saldo_insoluto: '8454.02',
    saldo_deudor: 8754.02,
    interes_minimo_ciclo: 253.62,
    tasa_interes: '0.0300',
    plazo_meses: 6,
    periodicidad: 'MENSUAL' as const,
    estado: 'VIGENTE' as const,
    proxima_cuota: {
      fecha_vencimiento: '2026-10-31',
      cuota: 1845.98,
      interes: 253.62,
      capital: 1592.36,
      periodo: 2,
    },
    fondos_detalle: [],
    total_aportado: 10000,
    suma_pi: 1,
  },
];

const PAGO_CREADO = {
  id: 10,
  codigo_comprobante: 'PAG-00010',
  prestamo: 1,
  monto_total: '1845.98',
  aplicacion_interes: '253.62',
  aplicacion_capital: '1592.36',
  aplicacion_mora: '0.00',
  saldo_insoluto_tras_pago: '6861.66',
  exceso_no_aplicado: '0',
};

const RECIBO = {
  ...PAGO_CREADO,
  prestamo_cliente: 'Juan Perez - 001-111222-3',
  fecha_pago: '2026-10-01',
  metodo_pago: 'EFECTIVO',
  metodo_pago_display: 'Efectivo',
  referencia_bancaria: '',
  usuario_nombre: 'Admin CAVI',
  creado_en: '2026-10-01T12:00:00Z',
  fondos_detalle: [
    {
      id: 1,
      fondo: 1,
      fondo_nombre: 'Fondo Principal',
      fondo_familiar: 'Fam Uno',
      porcentaje_pi: '0.5000',
      capital_reintegrado: '796.18',
      ganancia: '63.41',
    },
  ],
  ganancia_administracion: '63.41',
  saldo_deudor_tras_pago: 7105.28,
};

beforeEach(() => {
  vi.clearAllMocks();
  (prestamoService.list as any).mockResolvedValue({ results: PRESTAMOS });
  (pagoService.getRecibo as any).mockResolvedValue(RECIBO);
});

describe('CobrosPage', () => {
  it('lista préstamos vigentes con saldo deudor y cuota', async () => {
    render(<CobrosPage />);
    await waitFor(() => {
      expect(screen.getByText(/Juan Perez/)).toBeInTheDocument();
      expect(screen.getByText('C$8,754.02')).toBeInTheDocument();
    });
    expect(prestamoService.list).toHaveBeenCalledWith({ estado: 'VIGENTE' });
    expect(prestamoService.list).toHaveBeenCalledWith({ estado: 'EN_MORA' });
  });

  it('valida que el monto no sea menor al interés mínimo del ciclo', async () => {
    render(<CobrosPage />);
    await waitFor(() => screen.getByText(/Juan Perez/));

    fireEvent.click(screen.getByText(/Juan Perez/));
    const montoInput = screen.getByLabelText('Monto a cobrar (C$)') as HTMLInputElement;

    fireEvent.input(montoInput, { target: { value: '100.00' } });
    expect(screen.getByText(/pago mínimo aceptado es el interés del ciclo/i)).toBeInTheDocument();

    const continuar = screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement;
    expect(continuar.disabled).toBe(true);
  });

  it('registra el cobro en dos toques y muestra el recibo', async () => {
    (prestamoService.pagar as any).mockResolvedValue(PAGO_CREADO);
    render(<CobrosPage />);
    await waitFor(() => screen.getByText(/Juan Perez/));

    fireEvent.click(screen.getByText(/Juan Perez/));
    fireEvent.input(screen.getByLabelText('Monto a cobrar (C$)'), { target: { value: '1845.98' } });

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByText('Confirmar Cobro');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Cobro' }));

    await waitFor(() => {
      expect(prestamoService.pagar).toHaveBeenCalledWith(1, {
        monto: '1845.98',
        fecha_pago: expect.any(String),
        metodo_pago: 'EFECTIVO',
        referencia_bancaria: '',
      });
    });
    await waitFor(() => expect(screen.getAllByText(/PAG-00010/).length).toBeGreaterThan(0));
    expect(pagoService.getRecibo).toHaveBeenCalledWith(10);
    expect(screen.getByText(/Recibido de/)).toBeInTheDocument();
  });

  it('exige la referencia bancaria en transferencias', async () => {
    render(<CobrosPage />);
    await waitFor(() => screen.getByText(/Juan Perez/));

    fireEvent.click(screen.getByText(/Juan Perez/));
    fireEvent.input(screen.getByLabelText('Monto a cobrar (C$)'), { target: { value: '1845.98' } });
    fireEvent.change(screen.getByLabelText('Método de pago'), { target: { value: 'TRANSFERENCIA' } });

    expect(screen.getByText(/transferencias requieren referencia/i)).toBeInTheDocument();
    const continuar = screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement;
    expect(continuar.disabled).toBe(true);

    fireEvent.input(screen.getByLabelText('Referencia bancaria'), { target: { value: 'REF-777' } });
    expect((screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement).disabled).toBe(false);
  });
});