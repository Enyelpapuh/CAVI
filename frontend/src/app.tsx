import { Router } from 'preact-router';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ClientesPage } from './pages/ClientesPage';
import { FondosPage } from './pages/FondosPage';
import { PrestamoFormPage } from './pages/PrestamoFormPage';
import { CobrosPage } from './pages/CobrosPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Spinner, ToastProvider } from './components/ui';
import './index.css';

function Routes() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div class="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner size={48} />
      </div>
    );
  }

  return (
    <ToastProvider>
      <Router>
        <ProtectedRoute path="/clientes" component={ClientesPage} requireAuth={true} />
        <ProtectedRoute path="/fondos" component={FondosPage} requireAuth={true} />
        <ProtectedRoute path="/prestamos/nuevo" component={PrestamoFormPage} requireAuth={true} />
        <ProtectedRoute path="/cobros" component={CobrosPage} requireAuth={true} />
        <ProtectedRoute path="/login" component={LoginPage} requireAuth={false} />
        <ProtectedRoute path="/dashboard" component={DashboardPage} requireAuth={true} />
        <ProtectedRoute path="/" component={DashboardPage} requireAuth={true} default />
      </Router>
    </ToastProvider>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}