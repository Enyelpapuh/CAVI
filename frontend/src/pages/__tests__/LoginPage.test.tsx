import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginPage } from '../LoginPage';
import { AuthProvider } from '../../context/AuthContext';
import { ToastProvider } from '../../components/ui';
import { authService } from '../../services/api';

vi.mock('../../services/api', () => ({
  authService: {
    login: vi.fn(),
  },
}));

function renderLogin() {
  return render(
    <ToastProvider>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </ToastProvider>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('muestra el formulario de autenticacion con sus campos', () => {
    renderLogin();
    expect(screen.getByPlaceholderText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Contraseña')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Iniciar Sesión/i })).toBeInTheDocument();
  });

  it('notifica error sin recargar cuando las credenciales son invalidas', async () => {
    const errorResponse = {
      response: {
        status: 401,
        data: { detail: 'No se encontró una cuenta activa con las credenciales proporcionadas' },
      },
    };
    (authService.login as any).mockRejectedValue(errorResponse);

    renderLogin();

    fireEvent.input(screen.getByPlaceholderText('Correo electrónico'), {
      target: { value: 'usuario@erroneo.com' },
    });
    fireEvent.input(screen.getByPlaceholderText('Contraseña'), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Iniciar Sesión/i }));

    await waitFor(() => {
      expect(
        screen.getAllByText('No se encontró una cuenta activa con las credenciales proporcionadas').length
      ).toBeGreaterThanOrEqual(1);
    });

    // El botón vuelve a estar activo
    expect(screen.getByRole('button', { name: /Iniciar Sesión/i })).toBeInTheDocument();
  });
});
