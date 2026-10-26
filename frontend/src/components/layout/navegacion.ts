import type { IconName } from '../ui/IconName';

export type RolUsuario = 'ADMINISTRADOR' | 'COBRANZA';

export interface ItemNav {
  path?: string;
  label: string;
  icon: IconName;
  roles: RolUsuario[];
  badge?: string;
  /** Modulo planificado en un sprint posterior: se muestra deshabilitado. */
  pendiente?: string;
}

export interface SeccionNav {
  titulo: string;
  items: ItemNav[];
}

const AMBOS: RolUsuario[] = ['ADMINISTRADOR', 'COBRANZA'];
const SOLO_ADMIN: RolUsuario[] = ['ADMINISTRADOR'];

export const SECCIONES_NAV: SeccionNav[] = [
  {
    titulo: 'Operación',
    items: [
      { path: '/', label: 'Inicio', icon: 'dashboard', roles: AMBOS },
      { path: '/cobros', label: 'Abonos y Cobranza', icon: 'credit_card', roles: AMBOS },
      { path: '/prestamos/nuevo', label: 'Nuevo Préstamo', icon: 'add_circle', roles: AMBOS },
      { path: '/clientes', label: 'Clientes', icon: 'person_add', roles: AMBOS },
      { path: '/fondos', label: 'Bolsas de Capital', icon: 'savings', roles: SOLO_ADMIN },
    ],
  },
  {
    titulo: 'Reportes',
    items: [
      { path: '/reportes/estados-cuenta', label: 'Estados de Cuenta', icon: 'receipt_long', roles: SOLO_ADMIN },
      { path: '/reportes/financiero', label: 'Informes Financieros', icon: 'analytics', roles: SOLO_ADMIN },
      { path: '/reportes/arqueo', label: 'Arqueo y Liquidación', icon: 'point_of_sale', roles: SOLO_ADMIN },
    ],
  },
  {
    titulo: 'Auditoría',
    items: [
      { path: '/auditoria', label: 'Auditoría', icon: 'history', roles: AMBOS },
    ],
  },
  {
    titulo: 'Sistema y Seguridad',
    items: [
      { path: '/seguridad/usuarios', label: 'Usuarios', icon: 'group', roles: SOLO_ADMIN },
      { path: '/seguridad/permisos', label: 'Permisos', icon: 'shield', roles: SOLO_ADMIN },
      { path: '/seguridad/settings', label: 'App Settings', icon: 'settings', roles: SOLO_ADMIN },
    ],
  },
];

export const seccionesVisibles = (rol: RolUsuario | undefined, secciones = SECCIONES_NAV): SeccionNav[] =>
  secciones
    .map((seccion) => ({ ...seccion, items: seccion.items.filter((item) => !rol || item.roles.includes(rol)) }))
    .filter((seccion) => seccion.items.length > 0);

export const TITULOS_RUTA: Record<string, string> = {
  '/': 'Inicio',
  '/clientes': 'Clientes',
  '/fondos': 'Bolsas de Capital',
  '/prestamos/nuevo': 'Nuevo Préstamo',
  '/cobros': 'Abonos y Cobranza',
  '/auditoria': 'Auditoría',
  '/reportes/estados-cuenta': 'Estados de Cuenta',
  '/reportes/financiero': 'Informes Financieros',
  '/reportes/bolsas': 'Informes Financieros',
};
