export interface Usuario {
  id: number;
  nombre_completo: string;
  correo: string;
  rol: 'ADMINISTRADOR' | 'COBRANZA';
  is_superuser?: boolean;
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
  departamento?: number | null;
  departamento_nombre?: string;
  municipio?: number | null;
  municipio_nombre?: string;
  actividad_catalogo?: number | null;
  actividad_catalogo_nombre?: string;
  estado_cliente?: number | null;
  estado_cliente_nombre?: string;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface Fondo {
  id: number;
  nombre: string;
  familiar: string;
  tipo_persona?: 'NATURAL' | 'JURIDICA';
  tipo_persona_display?: string;
  identificacion?: string | null;
  nombres_titular?: string | null;
  apellidos_titular?: string | null;
  razon_social?: string | null;
  ruc?: string | null;
  representante_legal?: string | null;
  cedula_representante?: string | null;
  telefono_contacto?: string | null;
  direccion_legal?: string | null;
  parentesco_relacion?: string | null;
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
  alertas_anulaciones?: Array<{
    id: number;
    codigo: string;
    monto: string;
    cliente: string;
    anulado_por: string;
    motivo: string;
    anulado_en: string;
  }>;
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
  banco?: number | null;
  banco_nombre?: string;
  referencia_bancaria: string;
  efectivo_recibido?: string | null;
  cambio_devuelto?: string | null;
  aplicacion_mora: string;
  aplicacion_interes: string;
  aplicacion_capital: string;
  interes_administracion?: string;
  interes_fondos?: string;
  saldo_insoluto_tras_pago: string;
  saldo_deudor_tras_pago?: number;
  usuario_nombre: string;
  creado_en: string;
  codigo_seguridad?: string;
  estado?: 'VALIDO' | 'ANULADO';
  motivo_anulacion?: string;
  anulado_en?: string | null;
  anulado_por_nombre?: string | null;
  qr_data?: string;
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

export interface DesgloseFondoPeriodo {
  fondo_id: number;
  nombre: string;
  familiar: string;
  saldo_actual: string;
  capital_reintegrado: string;
  ganancia_interes: string;
  total_acreditado: string;
  desembolsos_mes: string;
  flujo_neto: string;
  cantidad_abonos: number;
}

export interface VariacionMoM {
  actual: string;
  anterior: string;
  diferencia: string;
  porcentaje: string;
}

export interface TransaccionPeriodo {
  pago_id: number;
  codigo_comprobante: string;
  fecha_pago: string;
  cliente: string;
  prestamo_id: number;
  fondo_id: number;
  fondo_nombre: string;
  porcentaje_pi: string;
  capital_reintegrado: string;
  ganancia_interes: string;
  monto_total?: string;
  aplicacion_capital?: string;
  aplicacion_interes?: string;
  aplicacion_mora?: string;
  metodo_pago: string;
  referencia_bancaria: string;
}

export interface TransaccionCanceladaPeriodo {
  pago_id: number;
  codigo_comprobante: string;
  codigo_seguridad?: string;
  fecha_pago: string;
  fecha_anulacion: string;
  cliente: string;
  prestamo_id: number;
  monto_total: string;
  aplicacion_capital: string;
  aplicacion_interes: string;
  motivo_anulacion: string;
  anulado_por_nombre: string;
}

export interface InformeFinancieroResponse {
  mes: number;
  anio: number;
  resumen: {
    total_recaudado: string;
    capital_retornado: string;
    interes_total: string;
    interes_fondos: string;
    interes_admin: string;
    mora_total: string;
    desembolsos_mes: string;
    flujo_neto: string;
    cantidad_pagos: number;
  };
  comparativa_mes_anterior?: {
    mes_anterior: number;
    anio_anterior: number;
    total_recaudado: VariacionMoM;
    capital_retornado: VariacionMoM;
    interes_total: VariacionMoM;
    interes_fondos: VariacionMoM;
    interes_admin: VariacionMoM;
    mora_total: VariacionMoM;
    desembolsos_mes: VariacionMoM;
    cantidad_pagos: VariacionMoM;
  };
  seccion_cancelados?: {
    cantidad: number;
    total_revertido: string;
    capital_revertido: string;
    interes_revertido: string;
    transacciones_canceladas: TransaccionCanceladaPeriodo[];
  };
  desglose_fondos: DesgloseFondoPeriodo[];
  transacciones: TransaccionPeriodo[];
}

export interface ConfiguracionSistema {
  id: number;
  modo_estricto: boolean;
  permitir_superar_usura: boolean;
  tasa_maxima_legal: string;
  dias_gracia: number;
  permitir_plazo_indefinido: boolean;
  tasa_mora_diaria: string;
  horas_tolerancia_anulacion?: number;
  actualizado_en: string;
}

export interface CatDepartamento {
  id: number;
  codigo: string;
  nombre: string;
}

export interface CatMunicipio {
  id: number;
  departamento: number;
  departamento_nombre?: string;
  codigo: string;
  nombre: string;
}

export interface CatActividadEconomica {
  id: number;
  codigo: string;
  nombre: string;
  sector: string;
}

export interface CatBanco {
  id: number;
  codigo: string;
  nombre: string;
  requiere_titular: boolean;
  activo: boolean;
}

export interface CatEstadoPrestamo {
  id: number;
  codigo: string;
  nombre: string;
  es_activo: boolean;
  es_mora: boolean;
  orden_flujo: number;
  descripcion: string;
}

export interface CatEstadoCuota {
  id: number;
  codigo: string;
  nombre: string;
  requiere_cobro: boolean;
  descripcion: string;
}

export interface CatEstadoCliente {
  id: number;
  codigo: string;
  nombre: string;
  permite_credito: boolean;
  descripcion: string;
}

export interface CatEstadoCaja {
  id: number;
  codigo: string;
  nombre: string;
  permite_movimientos: boolean;
}

export interface CatPermiso {
  id: number;
  modulo: string;
  codigo: string;
  nombre: string;
  descripcion: string;
}

export interface PermisosResponse {
  permisos: CatPermiso[];
  roles: Array<{ codigo: string; nombre: string }>;
  matriz: Record<string, Record<string, boolean>>;
}

export interface SesionCaja {
  id: number;
  usuario: number;
  usuario_nombre: string;
  fecha_apertura: string;
  fecha_cierre: string | null;
  saldo_inicial_efectivo: string;
  total_cobrado_efectivo: string;
  total_cobrado_banco: string;
  efectivo_declarado: string;
  diferencia: string;
  estado: string;
  supervisor_cierre: number | null;
  supervisor_nombre: string | null;
  observaciones: string;
}

export interface BitacoraActividad {
  id: number;
  modulo: string;
  codigo_evento: string;
  nivel_severidad: 'INFORMATIVO' | 'ADVERTENCIA' | 'CRITICO';
  tipo_actividad?: number | null;
  tipo_actividad_nombre?: string | null;
  usuario?: number | null;
  usuario_nombre?: string | null;
  usuario_rol?: string | null;
  cliente?: number | null;
  cliente_nombre?: string | null;
  prestamo?: number | null;
  pago?: number | null;
  codigo_comprobante?: string | null;
  fondo?: number | null;
  direccion_ip?: string | null;
  agente_usuario?: string | null;
  datos_anteriores?: Record<string, any> | null;
  datos_nuevos?: Record<string, any> | null;
  diferencial_cambios?: Record<string, { antes: any; despues: any }> | null;
  observaciones: string;
  creado_en: string;
}

export interface AuditoriaResumen {
  total_eventos_mes: number;
  total_eventos_hoy: number;
  total_criticos_mes: number;
  total_advertencias_mes: number;
  recibos_anulados_mes: number;
  monto_anulado_mes: string;
  clientes_modificados_mes: number;
  alertas_anulaciones_recientes: Array<{
    id: number;
    codigo: string;
    monto: string;
    cliente: string;
    anulado_por: string;
    motivo: string;
    fecha: string | null;
  }>;
  es_admin: boolean;
}