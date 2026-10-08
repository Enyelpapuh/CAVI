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
    cantidad: 2,
    saldo_total: '100000.00',
  },
  abonos_del_dia: { monto: '2000.00', cantidad: 5 },
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { nombre_completo: 'Admin General', rol: 'ADMINISTRADOR' } });
});

describe('DashboardPage', () => {
  it('muestra las acciones rapidas de administrador y los indicadores clave', async () => {
    (dashboardService.resumen as any).mockResolvedValue(DASHBOARD);
    render(<DashboardPage />);

    // Acciones rápidas
    expect(screen.getByText('Registrar Cliente')).toBeInTheDocument();
    expect(screen.getByText('Nuevo Préstamo')).toBeInTheDocument();
    expect(screen.getByText('Registrar Pago')).toBeInTheDocument();
    expect(screen.getByText('Arqueo Diario')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Clientes Activos')).toBeInTheDocument();
    });

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('C$2,000.00')).toBeInTheDocument();

    // Pie de KPIs
    expect(screen.getByText('C$150,000.00 disponible')).toBeInTheDocument();
    expect(screen.getByText('C$100,000.00 en cartera')).toBeInTheDocument();
    expect(screen.getByText('5 recibos hoy')).toBeInTheDocument();

    // Tarjeta de acceso operativo
    expect(screen.getByText('Gestión Operativa de Cartera')).toBeInTheDocument();
    expect(screen.getByText('Ver Cartera Completa')).toBeInTheDocument();
  });

  it('navega al modulo correspondiente al pulsar una accion rapida', async () => {
    (dashboardService.resumen as any).mockResolvedValue(DASHBOARD);
    render(<DashboardPage />);

    fireEvent.click(screen.getByText('Registrar Cliente'));
    expect(navigateMock).toHaveBeenCalledWith('/clientes');

    fireEvent.click(screen.getByText('Arqueo Diario'));
    expect(navigateMock).toHaveBeenCalledWith('/reportes/arqueo');
  });

  it('muestra acciones de campo y mensaje de bienvenida para el rol cobranza', async () => {
    useAuth.mockReturnValue({ user: { nombre_completo: 'Cobrador Carlos', rol: 'COBRANZA' } });
    render(<DashboardPage />);

    expect(screen.getByText('Mi Ruta de Cobro')).toBeInTheDocument();
    expect(screen.getByText('Registrar Pago')).toBeInTheDocument();
    expect(screen.getByText('Mi Arqueo')).toBeInTheDocument();

    expect(screen.getByText('¡Todo listo para hoy!')).toBeInTheDocument();
    expect(dashboardService.resumen).not.toHaveBeenCalled();
  });
});
