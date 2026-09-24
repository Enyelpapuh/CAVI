import { Router } from 'preact-router';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { ClientesPage } from './pages/ClientesPage';
import { FondosPage } from './pages/FondosPage';
import { PrestamoFormPage } from './pages/PrestamoFormPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import './index.css';

function Routes() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div class="min-h-screen flex items-center justify-center bg-gray-50">
        <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <Router>
      <ProtectedRoute path="/clientes" component={ClientesPage} requireAuth={true} />
      <ProtectedRoute path="/fondos" component={FondosPage} requireAuth={true} />
      <ProtectedRoute path="/prestamos/nuevo" component={PrestamoFormPage} requireAuth={true} />
      <ProtectedRoute path="/login" component={LoginPage} requireAuth={false} />
      <ProtectedRoute path="/" component={ClientesPage} requireAuth={true} default />
    </Router>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}