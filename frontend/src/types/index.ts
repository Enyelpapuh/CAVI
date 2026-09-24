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

export interface Fondo {
  id: number;
  nombre: string;
  familiar: string;
  saldo_disponible: string;
  capital_inicial: string;
  ganancias_acumuladas: string;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
  movimientos?: MovimientoFondo[];
  capital_colocado?: number;
  rentabilidad?: number;
}

export interface MovimientoFondo {
  id: number;
  fondo: number;
  tipo: 'INYECCION' | 'RETIRO' | 'DESEMBOLSO' | 'GANANCIA';
  tipo_display: string;
  monto: string;
  saldo_anterior: string;
  saldo_posterior: string;
  descripcion: string;
  creado_en: string;
}

export interface PrestamoFondoDetalle {
  id: number;
  fondo: number;
  fondo_nombre: string;
  fondo_familiar: string;
  fondo_saldo_disponible: string;
  monto_aportado: string;
  porcentaje_pi: string;
}

export interface Prestamo {
  id: number;
  cliente: number;
  cliente_nombre: string;
  monto_principal: string;
  tasa_interes: string;
  plazo_meses: number;
  periodicidad: 'MENSUAL' | 'QUINCENAL';
  fecha_desembolso: string;
  fecha_primer_corte: string;
  estado: 'VIGENTE' | 'EN_GRACIA' | 'EN_MORA' | 'CANCELADO';
  creado_en: string;
  actualizado_en: string;
  fondos_detalle: PrestamoFondoDetalle[];
  total_aportado: number;
  suma_pi: number;
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