import { useAuth } from '../context/AuthContext';
import { Link } from 'preact-router/match';

interface LayoutProps {
  children: any;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout, hasRole } = useAuth();

  return (
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white shadow-sm border-b border-gray-200">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between items-center h-16">
            <div class="flex items-center">
              <h1 class="text-xl font-bold text-gray-900">CAVI</h1>
            </div>
            <nav class="flex items-center space-x-4">
              {user && (
                <>
                  <Link
                    path="/clientes"
                    activeClassName="text-blue-600 font-medium"
                    class="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    Clientes
                  </Link>
                  {hasRole('ADMINISTRADOR') && (
                    <Link
                      path="/fondos"
                      activeClassName="text-blue-600 font-medium"
                      class="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                    >
                      Fondos
                    </Link>
                  )}
                  <span class="text-sm text-gray-500">{user.nombre_completo} ({user.rol})</span>
                  <button
                    onClick={logout}
                    class="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    Cerrar sesión
                  </button>
                </>
              )}
            </nav>
          </div>
        </div>
      </header>
      <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}