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
      { path: '/', label: 'Panel de Control', icon: 'dashboard', roles: AMBOS },
      { path: '/cobros', label: 'Créditos y Abonos', icon: 'credit_card', roles: AMBOS },
      { path: '/prestamos/nuevo', label: 'Nuevo Préstamo', icon: 'add_circle', roles: AMBOS },
      { path: '/clientes', label: 'Clientes', icon: 'person_add', roles: AMBOS, badge: '+ Alta' },
      { path: '/fondos', label: 'Bolsas de Capital', icon: 'savings', roles: SOLO_ADMIN, badge: 'Fondeo' },
    ],
  },
  {
    titulo: 'Reportes',
    items: [
      { label: 'Estados de Cuenta', icon: 'receipt_long', roles: SOLO_ADMIN, pendiente: 'Sprint 3' },
      { label: 'Arqueo y Liquidación', icon: 'point_of_sale', roles: SOLO_ADMIN, pendiente: 'Sprint 3' },
    ],
  },
  {
    titulo: 'Sistema y Seguridad',
    items: [
      { label: 'Usuarios', icon: 'group', roles: SOLO_ADMIN, pendiente: 'Sprint 3' },
      { label: 'Permisos', icon: 'shield', roles: SOLO_ADMIN, pendiente: 'Sprint 3' },
      { label: 'App Settings', icon: 'settings', roles: SOLO_ADMIN, pendiente: 'Sprint 3' },
    ],
  },
];

export const seccionesVisibles = (rol: RolUsuario | undefined, secciones = SECCIONES_NAV): SeccionNav[] =>
  secciones
    .map((seccion) => ({ ...seccion, items: seccion.items.filter((item) => !rol || item.roles.includes(rol)) }))
    .filter((seccion) => seccion.items.length > 0);

export const TITULOS_RUTA: Record<string, string> = {
  '/': 'Panel de Control',
  '/clientes': 'Clientes',
  '/fondos': 'Bolsas de Capital',
  '/prestamos/nuevo': 'Nuevo Préstamo',
  '/cobros': 'Créditos y Abonos',
};
