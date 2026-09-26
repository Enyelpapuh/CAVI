import { render, screen } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';

vi.mock('preact-router/match', () => ({
  Link: ({ children, path, ...rest }: any) => (
    <a href={path} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('preact-router', () => ({
  useRouter: () => [{ url: '/cobros' }, vi.fn()],
}));

const logout = vi.fn();
let rol: 'ADMINISTRADOR' | 'COBRANZA' = 'ADMINISTRADOR';
let usuario: { nombre_completo: string; rol: 'ADMINISTRADOR' | 'COBRANZA' } | null = {
  nombre_completo: 'Lic. Fernando Martinez',
  rol: 'ADMINISTRADOR',
};

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: usuario ? { nombre_completo: usuario.nombre_completo, rol } : null,
    logout,
  }),
}));

import { Sidebar } from '../Sidebar';
import { Topbar } from '../Topbar';
import { Layout } from '../../Layout';
import { ToastProvider } from '../../ui/Toast';

const conToast = (children: any) => <ToastProvider>{children}</ToastProvider>;

describe('Sidebar', () => {
  it('muestra las secciones operativas y el perfil del usuario', () => {
    render(conToast(<Sidebar />));
    expect(screen.getByText('Panel de Control')).toBeInTheDocument();
    expect(screen.getByText('Clientes')).toBeInTheDocument();
    expect(screen.getByText('Lic. Fernando Martinez')).toBeInTheDocument();
    expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
  });

  it('oculta las secciones exclusivas del administrador al rol COBRANZA', () => {
    rol = 'COBRANZA';
    render(conToast(<Sidebar />));
    expect(screen.getByText('Créditos y Abonos')).toBeInTheDocument();
    expect(screen.queryByText('Bolsas de Capital')).not.toBeInTheDocument();
    expect(screen.queryByText('Permisos')).not.toBeInTheDocument();
    rol = 'ADMINISTRADOR';
  });

  it('marca los modulos de sprints futuros como no disponibles', () => {
    render(conToast(<Sidebar />));
    expect(screen.getByText('Estados de Cuenta').closest('button')).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('Topbar', () => {
  it('muestra el titulo de la pagina, el estado del servidor y el rol', () => {
    render(conToast(<Topbar titulo="Créditos y Abonos" onAbrirMenu={vi.fn()} />));
    expect(screen.getByText('Créditos y Abonos')).toBeInTheDocument();
    expect(screen.getByText(/Servidor en Línea/)).toBeInTheDocument();
    expect(screen.getByText('Administrador')).toBeInTheDocument();
  });
});

describe('Layout', () => {
  it('deduce el titulo del encabezado a partir de la ruta activa', () => {
    render(
      conToast(
        <Layout>
          <p>Contenido</p>
        </Layout>
      )
    );
    expect(screen.getAllByText('Créditos y Abonos').length).toBeGreaterThan(0);
    expect(screen.getByText('Contenido')).toBeInTheDocument();
  });

  it('renderiza el shell completo cuando hay sesion iniciada', () => {
    render(
      conToast(
        <Layout>
          <p>Contenido</p>
        </Layout>
      )
    );
    expect(screen.getByText('Contenido')).toBeInTheDocument();
    expect(screen.getByLabelText('Abrir menú de navegación')).toBeInTheDocument();
    expect(screen.getByText('Panel de Control')).toBeInTheDocument();
  });

  it('omite sidebar y topbar cuando no hay usuario (pantalla de login)', () => {
    usuario = null;
    render(
      conToast(
        <Layout>
          <p>Sin sesion</p>
        </Layout>
      )
    );
    expect(screen.queryByLabelText('Abrir menú de navegación')).not.toBeInTheDocument();
    expect(screen.queryByText('Panel de Control')).not.toBeInTheDocument();
    expect(screen.getByText('Sin sesion')).toBeInTheDocument();
    usuario = { nombre_completo: 'Lic. Fernando Martinez', rol: 'ADMINISTRADOR' };
  });
});
