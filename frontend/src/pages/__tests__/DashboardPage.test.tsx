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
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { nombre_completo: 'Admin General', rol: 'ADMINISTRADOR' } });
});

describe('DashboardPage (Centro Operativo del Día)', () => {
  it('muestra las acciones rápidas operativas y los indicadores de cobros de hoy', async () => {
    (dashboardService.resumen as any).mockResolvedValue(DASHBOARD);
    render(<DashboardPage />);

    // Acciones rápidas
    expect(screen.getByText('Registrar Pago')).toBeInTheDocument();
    expect(screen.getByText('Nuevo Préstamo')).toBeInTheDocument();
    expect(screen.getByText('Alta de Cliente')).toBeInTheDocument();
    expect(screen.getByText('Arqueo de Caja')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Operación y Cobros de Hoy')).toBeInTheDocument();
      expect(screen.getByText('Recaudación Hoy')).toBeInTheDocument();
      expect(screen.getByText('En Fecha')).toBeInTheDocument();
      expect(screen.getByText('En Gracia')).toBeInTheDocument();
      expect(screen.getByText('Pasados (Mora)')).toBeInTheDocument();
    });

    expect(screen.getByText('C$2,000.00')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    // Acceso a terminal de cobranza
    expect(screen.getByText('Terminal de Abonos y Cobranza')).toBeInTheDocument();
    expect(screen.getByText('Abrir Cobranza')).toBeInTheDocument();
  });

  it('navega al modulo correspondiente al pulsar una accion rapida', async () => {
    (dashboardService.resumen as any).mockResolvedValue(DASHBOARD);
    render(<DashboardPage />);

    fireEvent.click(screen.getByText('Alta de Cliente'));
    expect(navigateMock).toHaveBeenCalledWith('/clientes');

    fireEvent.click(screen.getByText('Arqueo de Caja'));
    expect(navigateMock).toHaveBeenCalledWith('/reportes/arqueo');
  });

  it('muestra acciones de campo y mensaje de bienvenida para el rol cobranza', async () => {
    useAuth.mockReturnValue({ user: { nombre_completo: 'Cobrador Carlos', rol: 'COBRANZA' } });
    (dashboardService.resumen as any).mockResolvedValue(DASHBOARD);
    render(<DashboardPage />);

    expect(screen.getByText('Cobrar en Ruta')).toBeInTheDocument();
    expect(screen.getByText('Mi Arqueo del Día')).toBeInTheDocument();
  });
});
