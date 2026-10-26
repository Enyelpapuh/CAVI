import { createContext } from 'preact';
import { useContext, useState, useEffect } from 'preact/hooks';
import { authService } from '../services/api';
import type { Usuario } from '../types';

interface AuthContextType {
  user: Usuario | null;
  accessToken: string | null;
  login: (correo: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasRole: (role: 'ADMINISTRADOR' | 'COBRANZA') => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: any }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = () => {
      const storedAccess = localStorage.getItem('access_token');
      const storedUser = localStorage.getItem('user');

      if (storedAccess && storedUser) {
        try {
          setAccessToken(storedAccess);
          setUser(JSON.parse(storedUser));
        } catch {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user');
        }
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const login = async (correo: string, password: string) => {
    const { access, refresh, user: userData } = await authService.login({ correo, password });
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    localStorage.setItem('user', JSON.stringify(userData));
    setAccessToken(access);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setAccessToken(null);
    setUser(null);
  };

  const hasRole = (role: 'ADMINISTRADOR' | 'COBRANZA') => {
    return user?.rol === role;
  };

  return (
    <AuthContext.Provider value={{ user, accessToken, login, logout, isLoading, isAuthenticated: !!user, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: null,
      accessToken: null,
      login: async () => {},
      logout: () => {},
      isLoading: false,
      isAuthenticated: false,
      hasRole: () => false,
    };
  }
  return context;
}