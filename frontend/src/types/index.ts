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
  saldo_insoluto: string;
  saldo_deudor: number;
  interes_minimo_ciclo: number;
  proxima_cuota: {
    fecha_vencimiento: string;
    cuota: number;
    interes: number;
    capital: number;
    periodo: number;
  } | null;
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

export interface Pago {
  id: number;
  codigo_comprobante: string;
  prestamo: number;
  prestamo_cliente: string;
  prestamo_monto: string;
  monto_total: string;
  fecha_pago: string;
  metodo_pago: 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO';
  metodo_pago_display: string;
  referencia_bancaria: string;
  aplicacion_mora: string;
  aplicacion_interes: string;
  aplicacion_capital: string;
  interes_administracion?: string;
  interes_fondos?: string;
  saldo_insoluto_tras_pago: string;
  saldo_deudor_tras_pago?: number;
  usuario_nombre: string;
  creado_en: string;
  exceso_no_aplicado?: string;
  fondos_detalle?: PagoFondoDetalle[];
  ganancia_administracion?: number;
}

export interface PagoFondoDetalle {
  id: number;
  fondo: number;
  fondo_nombre: string;
  fondo_familiar: string;
  porcentaje_pi: string;
  capital_reintegrado: string;
  ganancia: string;
}

export interface PeriodoCuota {
  periodo: number;
  fecha_vencimiento: string;
  cuota: number;
  interes: number;
  capital: number;
  saldo_insoluto: number;
}

export interface Proyeccion {
  prestamo: number;
  cliente: number;
  monto_principal: string;
  tasa_periodica: string;
  periodicidad: 'MENSUAL' | 'QUINCENAL';
  plazo_meses: number;
  total_periodos: number;
  total_interes: string;
  total_cuotas: string;
  periodos: PeriodoCuota[];
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