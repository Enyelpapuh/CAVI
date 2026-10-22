import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type {
  AuthTokens,
  ApiError,
  LoginCredentials,
  Usuario,
  Cliente,
  Fondo,
  Prestamo,
  Pago,
  Proyeccion,
  PreviewPago,
  Dashboard,
  CajaCobrador,
  AgendaCobrador,
  ConfiguracionSistema,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Request interceptor: inject access token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const accessToken = localStorage.getItem('access_token');
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 and token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: AxiosError) => void;
}> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const response = await axios.post<{ access: string }>(
          `${API_BASE_URL}/auth/refresh/`,
          { refresh: refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        );

        const newAccessToken = response.data.access;
        localStorage.setItem('access_token', newAccessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }

        processQueue(null, newAccessToken);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Auth endpoints
export const authService = {
  login: async (credentials: LoginCredentials): Promise<AuthTokens> => {
    const response = await api.post<AuthTokens>('/auth/login/', credentials);
    return response.data;
  },

  refresh: async (): Promise<{ access: string }> => {
    const refreshToken = localStorage.getItem('refresh_token');
    const response = await api.post<{ access: string }>('/auth/refresh/', { refresh: refreshToken });
    return response.data;
  },
};

// Usuario endpoints
export const usuarioService = {
  list: async (params?: { search?: string; page?: number }) => {
    const response = await api.get('/usuarios/', { params });
    return response.data;
  },

  create: async (data: Omit<Usuario, 'id' | 'creado_en' | 'actualizado_en' | 'ultimo_login'> & { password?: string }): Promise<Usuario> => {
    const response = await api.post('/usuarios/', data);
    return response.data;
  },

  get: async (id: number): Promise<Usuario> => {
    const response = await api.get(`/usuarios/${id}/`);
    return response.data;
  },

  update: async (id: number, data: Partial<Usuario> & { password?: string }): Promise<Usuario> => {
    const response = await api.patch(`/usuarios/${id}/`, data);
    return response.data;
  },
};

// Cliente endpoints
export const clienteService = {
  list: async (params?: { search?: string; page?: number }) => {
    const response = await api.get('/clientes/', { params });
    return response.data;
  },

  create: async (data: Omit<Cliente, 'id' | 'creado_en' | 'actualizado_en'>): Promise<Cliente> => {
    const response = await api.post('/clientes/', data);
    return response.data;
  },

  get: async (id: number): Promise<Cliente> => {
    const response = await api.get(`/clientes/${id}/`);
    return response.data;
  },

  update: async (id: number, data: Partial<Cliente>): Promise<Cliente> => {
    const response = await api.patch(`/clientes/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/clientes/${id}/`);
  },
};

// Fondo endpoints
export const fondoService = {
  list: async (params?: { search?: string; page?: number }) => {
    const response = await api.get('/fondos/', { params });
    return response.data;
  },

  create: async (data: { nombre: string; familiar: string; capital_inicial: string; activo?: boolean }): Promise<Fondo> => {
    const response = await api.post('/fondos/', data);
    return response.data;
  },

  get: async (id: number): Promise<Fondo> => {
    const response = await api.get(`/fondos/${id}/`);
    return response.data;
  },

  inyeccion: async (id: number, data: { monto: string; descripcion?: string }): Promise<Fondo> => {
    const response = await api.post(`/fondos/${id}/inyeccion/`, data);
    return response.data;
  },

  retiro: async (id: number, data: { monto: string; descripcion?: string }): Promise<Fondo> => {
    const response = await api.post(`/fondos/${id}/retiro/`, data);
    return response.data;
  },

  movimientos: async (id: number, params?: { page?: number }) => {
    const response = await api.get(`/fondos/${id}/movimientos/`, { params });
    return response.data;
  },

  informeFinanciero: async (params?: { mes?: number; anio?: number; fondo?: number }) => {
    const response = await api.get('/fondos/informe_financiero/', { params });
    return response.data;
  },
};

// Prestamo endpoints
export const prestamoService = {
  list: async (params?: { search?: string; page?: number; estado?: string }) => {
    const response = await api.get('/prestamos/', { params });
    return response.data;
  },

  create: async (data: {
    cliente: number;
    monto_principal: string;
    tasa_interes: string;
    plazo_meses: number;
    periodicidad: 'MENSUAL' | 'QUINCENAL';
    fecha_desembolso: string;
    fecha_primer_corte: string;
    fondos_detalle: Array<{ fondo: number; monto_aportado: string; porcentaje_pi: string }>;
  }): Promise<Prestamo> => {
    const response = await api.post('/prestamos/', data);
    return response.data;
  },

  get: async (id: number): Promise<Prestamo> => {
    const response = await api.get(`/prestamos/${id}/`);
    return response.data;
  },

  amortizacion: async (id: number): Promise<Proyeccion> => {
    const response = await api.get(`/prestamos/${id}/amortizacion/`);
    return response.data;
  },

  /** Simula la cuota de un crédito SIN persistirlo (cotizador del panel). */
  simular: async (data: {
    monto_principal: string;
    tasa_interes: string;
    plazo_meses: number;
    periodicidad: 'MENSUAL' | 'QUINCENAL';
    fecha_primer_corte?: string;
  }): Promise<Proyeccion> => {
    const response = await api.post('/prestamos/simular/', data);
    return response.data;
  },

  /** Desglose de prelación del Art. 3180 sin asentar el pago. */
  previewPago: async (id: number, monto: string): Promise<PreviewPago> => {
    const response = await api.post(`/prestamos/${id}/preview_pago/`, { monto });
    return response.data;
  },

  pagar: async (
    id: number,
    data: {
      monto: string;
      fecha_pago: string;
      metodo_pago: string;
      referencia_bancaria?: string;
    }
  ): Promise<Pago> => {
    const response = await api.post(`/prestamos/${id}/pagos/`, data);
    return response.data;
  },

  /**
   * Descarga el pagaré legal (TK25).
   *
   * Devuelve el PDF como blob junto con el nombre de archivo que impone el
   * servidor y la variante real del PDF (`PDF/A-2b` solo con WeasyPrint).
   */
  pagarPagare: async (id: number): Promise<{ blob: Blob; nombre: string; variante: string }> => {
    const response = await api.get(`/prestamos/${id}/pagare/`, { responseType: 'blob' });
    const disposicion = String(response.headers['content-disposition'] ?? '');
    const coincidencia = /filename="?([^";]+)"?/.exec(disposicion);
    return {
      blob: response.data as Blob,
      nombre: coincidencia?.[1] ?? `Pagare-${id}.pdf`,
      variante: String(response.headers['x-pdf-variante'] ?? 'PDF'),
    };
  },

  /** Abre el pagaré en HTML para imprimirlo sin pasar por el PDF. */
  abrirPagareHtml: async (id: number): Promise<string> => {
    const response = await api.get(`/prestamos/${id}/pagare/`, {
      params: { formato: 'html' },
      responseType: 'text',
    });
    return response.data as string;
  },
};

// Pago endpoints
export const pagoService = {
  list: async (params?: { page?: number; prestamo?: number; cliente?: number; fecha?: string; usuario?: number }) => {
    const response = await api.get('/pagos/', { params });
    return response.data;
  },

  getRecibo: async (id: number): Promise<Pago> => {
    const response = await api.get(`/pagos/${id}/`);
    return response.data;
  },
};

// Dashboard endpoints
export const dashboardService = {
  /** Solo ADMINISTRADOR: agregados de cartera, bolsas y abonos del dia. */
  resumen: async (): Promise<Dashboard> => {
    const response = await api.get('/dashboard/');
    return response.data;
  },

  /** Cualquier autenticado: recaudos propios del usuario (Ley 787). */
  caja: async (fecha?: string): Promise<CajaCobrador> => {
    const response = await api.get('/dashboard/caja/', { params: fecha ? { fecha } : undefined });
    return response.data;
  },

  /** Agenda de cobranza: sin detalle Pi ni montos de fondos. */
  agenda: async (params?: { search?: string }): Promise<AgendaCobrador> => {
    const response = await api.get('/dashboard/agenda/', { params });
    return response.data;
  },
};

// Configuracion endpoints
export const configuracionService = {
  get: async (): Promise<ConfiguracionSistema> => {
    const response = await api.get('/configuracion/');
    return response.data;
  },

  update: async (data: Partial<ConfiguracionSistema>): Promise<ConfiguracionSistema> => {
    const response = await api.post('/configuracion/', data);
    return response.data;
  },
};

export default api;