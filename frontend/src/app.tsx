import { useEffect } from 'preact/hooks';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Spinner, ToastProvider } from './components/ui';
import { RouterProvider, useRouter } from './lib/router';
import './index.css';

// Vistas del sistema
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ClientesPage } from './pages/ClientesPage';
import { FondosPage } from './pages/FondosPage';
import { PrestamoFormPage } from './pages/PrestamoFormPage';
import { CobrosPage } from './pages/CobrosPage';
import { UsuariosPage } from './pages/UsuariosPage';
import { PermisosPage } from './pages/PermisosPage';
import { SettingsPage } from './pages/SettingsPage';
import { EstadosCuentaPage } from './pages/EstadosCuentaPage';
import { InformeBolsasPage } from './pages/InformeBolsasPage';
import { ArqueoPage } from './pages/ArqueoPage';
import { AuditoriaPage } from './pages/AuditoriaPage';

function AppContent() {
  const { pathname, navigate } = useRouter();
  const { isLoading, isAuthenticated } = useAuth();

  // Redirect logic
  useEffect(() => {
    if (isLoading) return;
    
    if (!isAuthenticated && pathname !== '/login') {
      navigate('/login');
    } else if (isAuthenticated && pathname === '/login') {
      navigate('/');
    }
  }, [isLoading, isAuthenticated, pathname]);

  if (isLoading) {
    return (
      <div class="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner size={48} />
      </div>
    );
  }

  // Router matching
  let PageComponent = DashboardPage; // default
  
  if (!isAuthenticated) {
    PageComponent = LoginPage;
  } else {
    if (pathname === '/clientes') PageComponent = ClientesPage;
    else if (pathname === '/fondos') PageComponent = FondosPage;
    else if (pathname === '/prestamos/nuevo') PageComponent = PrestamoFormPage;
    else if (pathname === '/cobros') PageComponent = CobrosPage;
    else if (pathname === '/auditoria') PageComponent = AuditoriaPage;
    else if (pathname === '/reportes/estados-cuenta') PageComponent = EstadosCuentaPage;
    else if (pathname === '/reportes/financiero' || pathname === '/reportes/bolsas') PageComponent = InformeBolsasPage;
    else if (pathname === '/reportes/arqueo') PageComponent = ArqueoPage;
    else if (pathname === '/seguridad/usuarios') PageComponent = UsuariosPage;
    else if (pathname === '/seguridad/permisos') PageComponent = PermisosPage;
    else if (pathname === '/seguridad/settings') PageComponent = SettingsPage;
    else if (pathname === '/' || pathname === '/dashboard') PageComponent = DashboardPage;
    // fallback
    else PageComponent = DashboardPage;
  }

  return (
    <ToastProvider>
      <PageComponent />
    </ToastProvider>
  );
}

export function App() {
  return (
    <AuthProvider>
      <RouterProvider>
        <AppContent />
      </RouterProvider>
    </AuthProvider>
  );
}