import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 1, rol: 'ADMINISTRADOR', nombre_completo: 'Admin General' },
    isAuthenticated: true,
  })),
}));

vi.mock('../../services/api', () => ({
  clienteService: {
    list: vi.fn(),
  },
  prestamoService: {
    list: vi.fn(),
    amortizacion: vi.fn(),
    pagarPagare: vi.fn(),
    abrirPagareHtml: vi.fn(),
    cancelar: vi.fn(),
  },
  pagoService: {
    list: vi.fn(),
  },
}));

vi.mock('../../components/Layout', () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

import { clienteService, prestamoService, pagoService } from '../../services/api';
import { EstadosCuentaPage } from '../EstadosCuentaPage';

const CLIENTE = {
  id: 1,
  nombres: 'Carlos',
  apellidos: 'Mendoza',
  cedula: '001-201085-0002B',
  telefono: '8888-9999',
  direccion: 'Barrio Altagracia, Managua',
  activo: true,
};

const PRESTAMO = {
  id: 101,
  cliente: 1,
  cliente_nombre: 'Carlos Mendoza',
  monto_principal: '20000.00',
  saldo_insoluto: '12000.00',
  tasa_interes: '0.0250',
  plazo_meses: 6,
  periodicidad: 'MENSUAL',
  fecha_desembolso: '2026-05-01',
  fecha_primer_corte: '2026-06-01',
  estado: 'AL_DIA',
  dias_mora: 0,
};

const PAGOS = [
  {
    id: 1,
    codigo_comprobante: 'REC-2026-0001',
    prestamo: 101,
    monto_total: '4500.00',
    fecha_pago: '2026-06-01',
    metodo_pago: 'EFECTIVO',
    metodo_pago_display: 'Efectivo',
    aplicacion_mora: '0.00',
    aplicacion_interes: '500.00',
    aplicacion_capital: '4000.00',
    saldo_insoluto_tras_pago: '16000.00',
  },
  {
    id: 2,
    codigo_comprobante: 'REC-2026-0002',
    prestamo: 101,
    monto_total: '4500.00',
    fecha_pago: '2026-07-01',
    metodo_pago: 'TRANSFERENCIA',
    metodo_pago_display: 'Transferencia',
    aplicacion_mora: '0.00',
    aplicacion_interes: '400.00',
    aplicacion_capital: '4100.00',
    saldo_insoluto_tras_pago: '11900.00',
  },
];

const AMORTIZACION = {
  total_periodos: 6,
  periodos: [
    { periodo: 1, fecha_vencimiento: '2026-06-01', cuota: 4500, capital: 4000, interes: 500, saldo_insoluto: 16000 },
    { periodo: 2, fecha_vencimiento: '2026-07-01', cuota: 4500, capital: 4100, interes: 400, saldo_insoluto: 11900 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EstadosCuentaPage (Estado de Cuenta de Clientes)', () => {
  it('inicia mostrando el estado vacío invitando a buscar un cliente', async () => {
    render(<EstadosCuentaPage />);
    expect(screen.getByText(/Seleccione un cliente para ver su estado de cuenta/i)).toBeInTheDocument();
    expect(screen.getByText('Estados de Cuenta (Clientes)')).toBeInTheDocument();
    expect(screen.getByText('Informes Financieros')).toBeInTheDocument();
  });

  it('busca un cliente, carga su crédito y muestra las métricas financieras', async () => {
    (clienteService.list as any).mockResolvedValue({ results: [CLIENTE] });
    (prestamoService.list as any).mockResolvedValue({ results: [PRESTAMO] });
    (pagoService.list as any).mockResolvedValue({ results: PAGOS });
    (prestamoService.amortizacion as any).mockResolvedValue(AMORTIZACION);

    render(<EstadosCuentaPage />);

    // Buscar cliente
    fireEvent.focus(screen.getByLabelText('Cliente'));
    fireEvent.input(screen.getByLabelText('Cliente'), { target: { value: 'Carlos' } });

    await waitFor(() => expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Carlos Mendoza'));

    // Debe cargar la ficha del titular
    await waitFor(() => {
      expect(screen.getByText(/001-201085-0002B/)).toBeInTheDocument();
      expect(screen.getByText('Barrio Altagracia, Managua')).toBeInTheDocument();
    });

    // Debe mostrar los KPIs financieros
    await waitFor(() => {
      expect(screen.getByText('Otorgado')).toBeInTheDocument();
      expect(screen.getByText('Amortizado')).toBeInTheDocument();
      expect(screen.getByText('Saldo Insoluto')).toBeInTheDocument();
      expect(screen.getByText('Total Cobrado')).toBeInTheDocument();
    });

    // Historial de pagos y cronograma
    await waitFor(() => {
      expect(screen.getByText('REC-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('REC-2026-0002')).toBeInTheDocument();
      expect(screen.getByText('Cronograma de Cuotas Programadas')).toBeInTheDocument();
    });
  });

  it('permite a un administrador abrir el modal y rescindir un contrato sin pagos activos', async () => {
    (clienteService.list as any).mockResolvedValue({ results: [CLIENTE] });
    (prestamoService.list as any).mockResolvedValue({
      results: [{ ...PRESTAMO, creado_en: new Date().toISOString() }],
    });
    // Sin pagos activos
    (pagoService.list as any).mockResolvedValue({ results: [] });
    (prestamoService.amortizacion as any).mockResolvedValue({ periodos: [] });
    (prestamoService.cancelar as any).mockResolvedValue({
      mensaje: 'Préstamo cancelado y fondos restituidos',
    });

    render(<EstadosCuentaPage />);

    // Buscar y seleccionar cliente
    fireEvent.focus(screen.getByLabelText('Cliente'));
    fireEvent.input(screen.getByLabelText('Cliente'), { target: { value: 'Carlos' } });
    await waitFor(() => expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Carlos Mendoza'));

    // Botón Cancelar Contrato debe estar disponible para el administrador
    await waitFor(() => {
      expect(screen.getByText('Cancelar Contrato')).toBeInTheDocument();
    });

    // Abrir modal de rescisión
    fireEvent.click(screen.getByText('Cancelar Contrato'));
    await waitFor(() => {
      expect(screen.getByText('Rescisión de Contrato de Préstamo')).toBeInTheDocument();
    });

    // Escribir motivo circunstanciado de al menos 15 caracteres
    const textarea = screen.getByPlaceholderText(/Describa de manera detallada/i);
    fireEvent.input(textarea, {
      target: { value: 'Error en la formalización notarial del crédito' },
    });

    const btnConfirmar = screen.getByText('Confirmar Cancelación');
    expect(btnConfirmar).not.toBeDisabled();
    fireEvent.click(btnConfirmar);

    await waitFor(() => {
      expect(prestamoService.cancelar).toHaveBeenCalledWith(
        101,
        'Error en la formalización notarial del crédito'
      );
    });
  });
});

