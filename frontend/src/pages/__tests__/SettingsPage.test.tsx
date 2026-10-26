import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const navigateMock = vi.fn();
vi.mock('../../lib/router', () => ({
  useRouter: () => ({
    navigate: navigateMock,
    currentPath: '/seguridad/settings',
  }),
}));

vi.mock('../../services/api', () => ({
  configuracionService: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../components/Layout', () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const useAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => useAuth(),
}));

import { configuracionService } from '../../services/api';
import { ToastProvider } from '../../components/ui';
import { SettingsPage } from '../SettingsPage';

function renderPagina() {
  return render(
    <ToastProvider>
      <SettingsPage />
    </ToastProvider>
  );
}

const CONFIG_MOCK = {
  id: 1,
  modo_estricto: false,
  permitir_superar_usura: true,
  tasa_maxima_legal: '0.0300',
  dias_gracia: 4,
  permitir_plazo_indefinido: true,
  tasa_mora_diaria: '0.0050',
  actualizado_en: '2026-10-09T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({
    user: { nombre_completo: 'Admin General', rol: 'ADMINISTRADOR' },
    hasRole: (role: string) => role === 'ADMINISTRADOR',
  });
});

describe('SettingsPage (Políticas y Configuración del Sistema)', () => {
  it('carga y muestra los parámetros y políticas configuradas', async () => {
    (configuracionService.get as any).mockResolvedValue(CONFIG_MOCK);
    renderPagina();

    expect(screen.getByText('Configuración del Sistema')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Modo Operativo del Sistema')).toBeInTheDocument();
      expect(screen.getAllByText('Digitalización Flexible')[0]).toBeInTheDocument();
      expect(screen.getByText('Días de Gracia de Cobranza')).toBeInTheDocument();
      expect(screen.getByText(/Préstamos de Periodo Indefinido/i)).toBeInTheDocument();
    });
  });

  it('permite al administrador guardar modificaciones en la configuración', async () => {
    (configuracionService.get as any).mockResolvedValue(CONFIG_MOCK);
    (configuracionService.update as any).mockResolvedValue({
      ...CONFIG_MOCK,
      dias_gracia: 7,
      permitir_superar_usura: true,
    });

    renderPagina();

    await waitFor(() => {
      expect(screen.getByText('Guardar Configuración')).toBeInTheDocument();
    });

    const botonGuardar = screen.getByText('Guardar Configuración');
    fireEvent.click(botonGuardar);

    await waitFor(() => {
      expect(configuracionService.update).toHaveBeenCalled();
      expect(screen.getByText(/guardadas correctamente/i)).toBeInTheDocument();
    });
  });

  it('muestra aviso restrictivo para usuarios que no son administradores', async () => {
    useAuth.mockReturnValue({
      user: { nombre_completo: 'Cobrador 1', rol: 'COBRANZA' },
      hasRole: (role: string) => role === 'COBRANZA',
    });
    (configuracionService.get as any).mockResolvedValue(CONFIG_MOCK);

    renderPagina();

    await waitFor(() => {
      expect(screen.getByText(/Solo el rol/i)).toBeInTheDocument();
    });
  });
});
