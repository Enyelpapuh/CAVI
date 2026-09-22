export interface Usuario {
  id: number;
  nombre_completo: string;
  correo: string;
  rol: 'ADMINISTRADOR' | 'COBRANZA';
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
  ultimo_login: string | null;
}

export interface Cliente {
  id: number;
  cedula: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  direccion: string;
  actividad_economica: string | null;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface LoginCredentials {
  correo: string;
  password: string;
}

export interface AuthTokens {
  access: string;
  refresh: string;
  user: Usuario;
}

export interface ApiError {
  detail?: string;
  non_field_errors?: string[];
  [key: string]: string | string[] | undefined;
}