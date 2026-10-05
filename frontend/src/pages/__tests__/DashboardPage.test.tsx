import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const fila = (over: Record<string, any> = {}) => ({
  id: 1,
  cliente: 1,
  cliente_nombre: 'Juan Perez',
  cliente_direccion: 'Barrio Centro',
  cliente_telefono: '81234567',
  estado: 'VIGENTE',
  estado_efectivo: 'AL_DIA',
  dias_atraso: 0,
  dias_gracia: 4,
  dias_mora: 0,
  interes_vencido: '0.00',
  mora_pendiente: '0.00',
  mora_acumulada: '0.00',
  tasa_mora: '0.0125',
  saldo_deudor: '52500.00',
  saldo_insoluto: '50000.00',
  cuota: '4874.36',
  cuota_fecha: '2026-10-23',
  cuota_periodo: 1,
  total_periodos: 12,
  bolsas: [{ id: 1, nombre: 'Fondo A', porcentaje_pi: '1.0000' }],
  ...over,
});

const DASHBOARD = {
  fecha: '2026-09-26',
  clientes_activos: 12,
  bolsas: { cantidad: 3, capital_en_calle: '150000.00' },
  creditos_vigentes: {
    cantidad: 2,
    saldo_total: '100000.00',
    porcentaje_sano: '50.00',
    al_dia: 1,
    en_mora: 1,
    en_gracia: 0,
    saldo_en_mora: '51250.00',
    mora_total: '62.50',
    interes_vencido_total: '1250.00',
  },
  cartera_semaforo: {
    al_dia: 1,
    en_gracia: 0,
    en_mora: 1,
    dias_gracia: 4,
    saldo_en_mora: '51250.00',
    mora_total: '62.50',
  },
  abonos_del_dia: { monto: '2000.00', cantidad: 1 },
  cartera: [
    fila(),
    fila({
      id: 2,
      cliente_nombre: 'Maria Lopez',
      cliente_direccion: 'Barrio Nueve',
      estado: 'EN_MORA',
      estado_efectivo: 'EN_MORA',
      dias_atraso: 9,
      dias_mora: 5,
      mora_pendiente: '62.50',
      interes_vencido: '1250.00',
      saldo_deudor: '51250.00',
    }),
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { rol: 'ADMINISTRADOR' } });
});

describe('DashboardPage', () => {
  it('muestra los agregados que devuelve el backend', async () => {
    (dashboardService.resumen as any).mockResolvedValue(DASHBOARD);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Clientes Activos')).toBeInTheDocument();
    });
    expect(screen.getByText('Clientes Activos').parentElement?.textContent).toContain('12');
    expect(screen.getByText('Bolsas de Fondo').parentElement?.textContent).toContain('3');
    expect(screen.getByText('Abonos del Dia').parentElement?.textContent).toContain('C$2,000.00');
    // Capital en calle en el pie del KPI de bolsas
    expect(screen.getByText('C$150,000.00 en calle')).toBeInTheDocument();
    // Resumen de cartera
    expect(screen.getByText('Cartera Total').parentElement?.textContent).toContain('C$100,000.00');
    expect(screen.getByText('En Mora', { selector: 'p' }).parentElement?.textContent).toContain('1');
  });

  it('muestra el semaforo de cobranza y la mora por recuperar', async () => {
    (dashboardService.resumen as any).mockResolvedValue(DASHBOARD);
    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('Semaforo de cobranza')).toBeInTheDocument());
    expect(screen.getByText(/1 al dia/)).toBeInTheDocument();
    expect(screen.getByText(/0 en gracia/)).toBeInTheDocument();
    expect(screen.getByText(/1 en mora/)).toBeInTheDocument();
    expect(screen.getByText('Saldo en mora').parentElement?.textContent).toContain('C$51,250.00');
    expect(screen.getByText('Mora por recuperar').parentElement?.textContent).toContain('C$62.50');
    expect(screen.getByText('Interes vencido').parentElement?.textContent).toContain('C$1,250.00');
  });

  it('detalla la mora exigible de cada credito', async () => {
    (dashboardService.resumen as any).mockResolvedValue(DASHBOARD);
    render(<DashboardPage />);

    await waitFor(() => expect(screen.getAllByText('Maria Lopez').length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Mora C\$62\.50 · 5 dias/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Interes vencido C\$1,250\.00/).length).toBeGreaterThan(0);
  });

  it('lista la cartera con el semaforo de atraso', async () => {
    (dashboardService.resumen as any).mockResolvedValue(DASHBOARD);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Juan Perez').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('Maria Lopez').length).toBeGreaterThan(0);
    expect(screen.getAllByText('En Mora (9d)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Al Dia').length).toBeGreaterThan(0);
  });

  it('filtra la cartera por estado', async () => {
    (dashboardService.resumen as any).mockResolvedValue(DASHBOARD);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Juan Perez').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: 'En Mora' }));

    await waitFor(() => {
      expect(screen.queryByText('Juan Perez')).toBeNull();
    });
    expect(screen.getAllByText('Maria Lopez').length).toBeGreaterThan(0);
  });

  it('busca por nombre sin distinguir acentos', async () => {
    (dashboardService.resumen as any).mockResolvedValue(DASHBOARD);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Juan Perez').length).toBeGreaterThan(0);
    });

    fireEvent.input(screen.getByLabelText('Buscar en cartera'), { target: { value: 'maria' } });

    await waitFor(() => {
      expect(screen.queryByText('Juan Perez')).toBeNull();
    });
    expect(screen.getAllByText('Maria Lopez').length).toBeGreaterThan(0);
  });

  it('bloquea el panel para el rol cobranza sin llamar al backend', async () => {
    useAuth.mockReturnValue({ user: { rol: 'COBRANZA' } });
    render(<DashboardPage />);

    expect(screen.getByText('Acceso restringido')).toBeInTheDocument();
    expect(dashboardService.resumen).not.toHaveBeenCalled();
  });

  it('muestra estado vacio cuando la cartera no coincide con el filtro', async () => {
    (dashboardService.resumen as any).mockResolvedValue({ ...DASHBOARD, cartera: [] });
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Sin creditos en este filtro')).toBeInTheDocument();
    });
  });
});
