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
  dias_atraso: number;
  dias_gracia: number;
  estado_efectivo: EstadoEfectivo;
  tasa_interes: string;
  /** Tasa mensual de mora; `null` aplica la mitad de la tasa pactada. */
  tasa_mora: string | null;
  /** Días vencidos fuera de gracia que ya generaron mora. */
  dias_mora: number;
  /** Mora exigible y aún impaga. */
  mora_pendiente: string;
  mora_detalle: {
    tasa_mora_mensual: string;
    tasa_mora_diaria: string;
    dias_mora: number;
    dias_gracia: number;
    mora_pendiente: string;
    mora_aplicada: string;
  };
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

export type EstadoEfectivo = 'AL_DIA' | 'EN_GRACIA' | 'EN_MORA' | 'CANCELADO';

/** Fila de la tabla de cartera del panel de control (agregado del backend). */
export interface CarteraFila {
  id: number;
  cliente: number;
  cliente_nombre: string;
  cliente_direccion: string;
  cliente_telefono: string;
  estado: 'VIGENTE' | 'EN_GRACIA' | 'EN_MORA' | 'CANCELADO';
  estado_efectivo: EstadoEfectivo;
  dias_atraso: number;
  dias_gracia: number;
  /** Días fuera de gracia que ya generaron mora. */
  dias_mora: number;
  /** Interés corriente de cortes vencidos e impagos. */
  interes_vencido: string;
  /** Mora exigible por el atraso acumulado. */
  mora_pendiente: string;
  mora_acumulada: string;
  tasa_mora: string;
  saldo_deudor: string;
  saldo_insoluto: string;
  cuota: string | null;
  cuota_fecha: string | null;
  cuota_periodo: number | null;
  total_periodos: number;
  /** Vacío para el rol COBRANZA (privacidad Ley 787). */
  bolsas: { id: number; nombre: string; porcentaje_pi: string }[];
}

export interface ResumenCartera {
  cantidad: number;
  saldo_total: string;
  porcentaje_sano: string;
  al_dia: number;
  en_mora: number;
  en_gracia: number;
  /** Saldo deudor de los créditos en mora. */
  saldo_en_mora: string;
  /** Mora exigible acumulada de toda la cartera. */
  mora_total: string;
  interes_vencido_total: string;
  dias_gracia: number;
  filas: CarteraFila[];
}

export interface Dashboard {
  fecha: string;
  clientes_activos: number;
  bolsas: { cantidad: number; capital_en_calle: string };
  creditos_vigentes: {
    cantidad: number;
    saldo_total: string;
    porcentaje_sano?: string;
    al_dia?: number;
    en_mora?: number;
    en_gracia?: number;
    saldo_en_mora?: string;
    mora_total?: string;
    interes_vencido_total?: string;
  };
  /** Semáforo de cobranza (opcional, en desuso en el panel principal). */
  cartera_semaforo?: {
    al_dia: number;
    en_gracia: number;
    en_mora: number;
    dias_gracia: number;
    saldo_en_mora: string;
    mora_total: string;
  };
  abonos_del_dia: { monto: string; cantidad: number };
  cartera?: CarteraFila[];
}

export interface CajaCobrador {
  fecha: string;
  usuario: string;
  total_recaudado: string;
  recibos_emitidos: number;
  por_metodo: Record<string, { label: string; monto: string }>;
  creditos_vigentes: number;
}

export interface AgendaCobrador {
  resumen: Omit<ResumenCartera, 'filas'>;
  filas: CarteraFila[];
}

/** Desglose de prelación calculado sin asentar el pago (Art. 3180). */
export interface PreviewPago {
  monto_recibido: string;
  monto_aplicado: string;
  exceso_no_aplicado: string;
  minimo_ciclo: string;
  capital_insoluto: string;
  interes_insoluto: string;
  mora_insoluto: string;
  deuda_total: string;
  aplicacion_mora: string;
  aplicacion_interes: string;
  aplicacion_capital: string;
  interes_administracion: string;
  interes_fondos: string;
  saldo_insoluto_tras_pago: string;
  deuda_tras_pago: string;
  deuda_liquidada: boolean;
  /** Detalle del recargo por atraso (Art. 3180 / Art. 3184). */
  detalle_mora: {
    tasa_mora_mensual: string;
    tasa_mora_diaria: string;
    dias_mora: number;
    dias_nuevos?: number;
    dias_gracia: number;
    mora_acumulada: string;
    mora_no_persistida: string;
    mora_aplicada: string;
    mora_pendiente: string;
  };
  es_valido: boolean;
  error: { monto?: string } | null;
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