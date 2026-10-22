import { useState, useEffect } from 'preact/hooks';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Spinner, ToastProvider } from './components/ui';
import { RouterProvider, useRouter } from './lib/router';
import './index.css';

// Lazy loader helper
function lazy(importFunc: () => Promise<any>) {
  return function LazyComponent(props: any) {
    const [Component, setComponent] = useState<any>(null);

    useEffect(() => {
      importFunc().then(module => {
        const Comp = module.default || Object.values(module)[0];
        setComponent(() => Comp);
      });
    }, []);

    if (!Component) {
      return (
        <div class="flex min-h-screen items-center justify-center bg-slate-50">
          <div class="flex flex-col items-center opacity-60">
            <Spinner size={32} />
          </div>
        </div>
      );
    }
    return <Component {...props} />;
  };
}

// Lazy loaded pages
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const ClientesPage = lazy(() => import('./pages/ClientesPage').then(m => ({ default: m.ClientesPage })));
const FondosPage = lazy(() => import('./pages/FondosPage').then(m => ({ default: m.FondosPage })));
const PrestamoFormPage = lazy(() => import('./pages/PrestamoFormPage').then(m => ({ default: m.PrestamoFormPage })));
const CobrosPage = lazy(() => import('./pages/CobrosPage').then(m => ({ default: m.CobrosPage })));

// Nuevas vistas
const UsuariosPage = lazy(() => import('./pages/UsuariosPage').then(m => ({ default: m.UsuariosPage })));
const PermisosPage = lazy(() => import('./pages/PermisosPage').then(m => ({ default: m.PermisosPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const EstadosCuentaPage = lazy(() => import('./pages/EstadosCuentaPage').then(m => ({ default: m.EstadosCuentaPage })));
const InformeBolsasPage = lazy(() => import('./pages/InformeBolsasPage').then(m => ({ default: m.InformeBolsasPage })));
const ArqueoPage = lazy(() => import('./pages/ArqueoPage').then(m => ({ default: m.ArqueoPage })));

function AppContent() {
  const { path: currentPath, navigate } = useRouter();
  const { isLoading, isAuthenticated } = useAuth();

  // Redirect logic
  useEffect(() => {
    if (isLoading) return;
    
    if (!isAuthenticated && currentPath !== '/login') {
      navigate('/login');
    } else if (isAuthenticated && currentPath === '/login') {
      navigate('/');
    }
  }, [isLoading, isAuthenticated, currentPath]);

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
    if (currentPath === '/clientes') PageComponent = ClientesPage;
    else if (currentPath === '/fondos') PageComponent = FondosPage;
    else if (currentPath === '/prestamos/nuevo') PageComponent = PrestamoFormPage;
    else if (currentPath === '/cobros') PageComponent = CobrosPage;
    else if (currentPath === '/reportes/estados-cuenta') PageComponent = EstadosCuentaPage;
    else if (currentPath === '/reportes/financiero' || currentPath === '/reportes/bolsas') PageComponent = InformeBolsasPage;
    else if (currentPath === '/reportes/arqueo') PageComponent = ArqueoPage;
    else if (currentPath === '/seguridad/usuarios') PageComponent = UsuariosPage;
    else if (currentPath === '/seguridad/permisos') PageComponent = PermisosPage;
    else if (currentPath === '/seguridad/settings') PageComponent = SettingsPage;
    else if (currentPath === '/' || currentPath === '/dashboard') PageComponent = DashboardPage;
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