import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const navigateMock = vi.fn();
vi.mock('../../lib/router', () => ({
  useRouter: () => ({
    navigate: navigateMock,
    currentPath: '/',
  }),
}));

vi.mock('../../services/api', () => ({
  dashboardService: {
    resumen: vi.fn(),
    caja: vi.fn(),
    agenda: vi.fn(),
  },
  clienteService: {
    list: vi.fn(),
  },
}));

vi.mock('../../components/Layout', () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const useAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => useAuth(),
}));

import { dashboardService } from '../../services/api';
import { DashboardPage } from '../DashboardPage';

const CARTERA_FILAS_MOCK = [
  {
    id: 101,
    cliente: 1,
    cliente_nombre: 'María López',
    cliente_direccion: 'Managua',
    cliente_telefono: '8888-1111',
    estado: 'EN_MORA',
    estado_efectivo: 'EN_MORA',
    dias_atraso: 12,
    dias_gracia: 5,
    dias_mora: 7,
    interes_vencido: '150.00',
    mora_pendiente: '75.00',
    mora_acumulada: '75.00',
    tasa_mora: '0.0500',
    saldo_deudor: '5225.00',
    saldo_insoluto: '5000.00',
    cuota: '550.00',
    cuota_fecha: '2026-09-14',
    cuota_periodo: 2,
    total_periodos: 12,
    bolsas: [],
  },
  {
    id: 102,
    cliente: 2,
    cliente_nombre: 'Pedro Ramírez',
    cliente_direccion: 'Masaya',
    cliente_telefono: '8888-2222',
    estado: 'EN_GRACIA',
    estado_efectivo: 'EN_GRACIA',
    dias_atraso: 3,
    dias_gracia: 5,
    dias_mora: 0,
    interes_vencido: '100.00',
    mora_pendiente: '0.00',
    mora_acumulada: '0.00',
    tasa_mora: '0.0500',
    saldo_deudor: '3100.00',
    saldo_insoluto: '3000.00',
    cuota: '420.00',
    cuota_fecha: '2026-09-23',
    cuota_periodo: 1,
    total_periodos: 6,
    bolsas: [],
  },
];

const DASHBOARD = {
  fecha: '2026-09-26',
  clientes_activos: 12,
  bolsas: { cantidad: 3, capital_en_calle: '150000.00' },
  creditos_vigentes: {
    cantidad: 15,
    saldo_total: '100000.00',
  },
  cartera_semaforo: {
    al_dia: 10,
    en_gracia: 3,
    en_mora: 2,
    dias_gracia: 5,
    saldo_en_mora: '15000.00',
    mora_total: '750.00',
  },
  abonos_del_dia: { monto: '2000.00', cantidad: 5 },
  cartera: CARTERA_FILAS_MOCK,
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { nombre_completo: 'Admin General', rol: 'ADMINISTRADOR' } });
  (dashboardService.agenda as any).mockResolvedValue({ resumen: {}, filas: CARTERA_FILAS_MOCK });
});

describe('DashboardPage (Centro Operativo del Día)', () => {
  it('muestra las acciones rápidas operativas con Nuevo Cliente y el Calendario de Cobros', async () => {
    (dashboardService.resumen as any).mockResolvedValue(DASHBOARD);
    render(<DashboardPage />);

    // Acciones rápidas
    expect(screen.getByText('Registrar Pago')).toBeInTheDocument();
    expect(screen.getByText('Nuevo Préstamo')).toBeInTheDocument();
    expect(screen.getByText('Nuevo Cliente')).toBeInTheDocument();
    expect(screen.getByText('Arqueo de Caja')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Operación y Cobros de Hoy')).toBeInTheDocument();
      expect(screen.getByText('Recaudación Hoy')).toBeInTheDocument();
      expect(screen.getByText('Clientes Activos')).toBeInTheDocument();
      expect(screen.getByText('Créditos Activos')).toBeInTheDocument();
      expect(screen.getByText('Saldo en Cartera')).toBeInTheDocument();
    });

    expect(screen.getByText('C$2,000.00')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();

    // Bloque de Agenda y Cartera de Cobros
    await waitFor(() => {
      expect(screen.getByText('Agenda y Cartera de Cobros')).toBeInTheDocument();
      expect(screen.getByText('Límites de Día (Gracia)')).toBeInTheDocument();
      expect(screen.getByText('En Mora (Vencidos)')).toBeInTheDocument();
      expect(screen.getByText('María López')).toBeInTheDocument();
      expect(screen.getByText('Pedro Ramírez')).toBeInTheDocument();
    });

    // Acceso a terminal de cobranza
    expect(screen.getByText('Terminal de Abonos y Cobranza')).toBeInTheDocument();
    expect(screen.getByText('Abrir Cobranza')).toBeInTheDocument();
  });

  it('navega al modulo correspondiente al pulsar Nuevo Cliente', async () => {
    (dashboardService.resumen as any).mockResolvedValue(DASHBOARD);
    render(<DashboardPage />);

    // Pulsar acción rápida Nuevo Cliente
    fireEvent.click(screen.getByText('Nuevo Cliente'));
    expect(navigateMock).toHaveBeenCalledWith('/clientes');

    fireEvent.click(screen.getByText('Arqueo de Caja'));
    expect(navigateMock).toHaveBeenCalledWith('/reportes/arqueo');
  });

  it('muestra acciones de campo, nuevo cliente y rol cobranza para el cobrador', async () => {
    useAuth.mockReturnValue({ user: { nombre_completo: 'Cobrador Carlos', rol: 'COBRANZA' } });
    (dashboardService.resumen as any).mockResolvedValue(DASHBOARD);
    render(<DashboardPage />);

    expect(screen.getByText('Cobrar en Ruta')).toBeInTheDocument();
    expect(screen.getByText('Mi Arqueo del Día')).toBeInTheDocument();
    expect(screen.getByText('Nuevo Cliente')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Cobranza')).toBeInTheDocument();
    });
  });
});
