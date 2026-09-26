# CAVI - Sistema de Diseno UI (Material 3 + Stitch)

**Base:** `stitch_cavi_microcr_ditos_platform/code.html` y `DESIGN.md`
**Estado:** Migracion completada (Fases 1-7)
**Alcance:** Solo capa visual. El backend y la base de datos conservan la verdad legal.

---

## 1. Principios

1. **El diseno no cambia la regla legal.** El motor de amortizacion (Ley 176), la prelacion
   (Art. 3180 C.C.) y la liquidacion 50/50 viven en `Backend/API/services/`. La UI solo
   las presenta.
2. **Privacidad por rol (Ley 787).** El rol `COBRANZA` nunca recibe fondos, detalle Pi,
   liquidaciones 50/50 ni ganancias administrativas. No se oculta con CSS: el backend no
   lo envia.
3. **Un solo idioma de estado.** `DIAS_GRACIA = 4` esta duplicado a proposito en
   `Backend/API/services/estados.py` y `frontend/src/lib/estadoPrestamo.ts`. Si se cambia
   uno, hay que cambiar el otro (cubierto por tests en ambos lados).
4. **El preview nunca escribe.** `preview_pago` reutiliza `_prelacion()`, la misma funcion
   que usa `aplicar_pago()`, de modo que el desglose mostrado y el asentado no pueden divergir.

---

## 2. Tokens (Tailwind local, sin librerias de UI)

`frontend/tailwind.config.js` extiende el tema con los roles semanticos de Material 3:

| Grupo | Ejemplos |
|-------|----------|
| Color | `bg-surface`, `text-on-surface`, `text-body-md`, `border-outline` |
| Tipografia | `text-headline-md`, `text-title-lg`, `text-body-sm`, `text-label-xs` |
| Espacio | `space-xs/sm/md/lg/xl` |
| Sombra | `shadow-card`, `shadow-modal` |
| Radio | `rounded-sm/md/lg` + `rounded-full` |

**Fuentes self-hosted:**

- `@fontsource-variable/inter@5.3.0` (pesos variables, subconjunto latino)
- `@material-symbols/font-400@0.47.5` (iconos-outline, nombres validados por `IconName.ts`)

Nada se carga desde CDN: el build funciona sin salida a internet.

**Correccion aplicada al diseno original:** el HTML Stitch sobrescribia `borderRadius` en
todos los elementos y rompia los `rounded-full`. CAVI conserva el radio por defecto de
Tailwind (`9999px`) para que las píldoras, avatares y badges sigan siendo círculos perfectos.

---

## 3. Primitivos (`frontend/src/components/ui/`)

| Componente | Uso |
|-----------|-----|
| `Icon` | Material Symbols tipado; `IconName.ts` es la lista blanca |
| `Button` | `primary` / `secondary` / `ghost` / `destructive` + `loading` |
| `Card` | Contenedor de sección con `title`, `subtitle`, `action` |
| `KpiTile` | Métrica del panel: degradado ámbar/índigo/esmeralda/rosa |
| `StatusBadge` | Semáforo Al Día / En Gracia / En Mora / Liquidado |
| `DataTable` | Tabla densa con `columnas` tipadas |
| `Modal` | Diálogo responsive (hoja inferior en móvil) con foco y Escape |
| `Campo`/`Input`/`Select`/`Textarea` | Formularios con label, hint y error accesibles |
| `Toast` / `Spinner` / `EmptyState` | Feedback de acciones, carga y estados vacíos |

---

## 4. Shell (`frontend/src/components/Layout.tsx`)

- Sidebar oscuro de **260 px** con navegación filtrada por rol (`layout/navegacion.ts`)
- Topbar con usuario, estado de sesión y cierre de sesión
- Drawer móvil con el mismo menú
- `Layout` mantiene la firma `{ children }` y acepta `titulo`, por lo que las páginas
  existentes siguen montando sin cambios
- Módulos de Sprint 3 (mora, PDF, reportes) aparecen deshabilitados, sin enlaces rotos

---

## 5. Pantallas migradas

### `DashboardPage` (`/` y `/dashboard`, solo ADMINISTRADOR)

- 4 KPIs: clientes activos, bolsas de fondo, créditos vigentes, abonos del día
- Resumen: cartera total, créditos en mora, en gracia y % saneada
- Tabla de cartera con filtro por estado y búsqueda sin acentos (`normalizar`)
- En móvil la tabla se sustituye por tarjetas (`CarteraCard`)
- Un rol `COBRANZA` ve un estado de acceso restringido y **no** se ejecuta la llamada

### `CobrosPage` (`/cobros`, ambos roles)

- Cabecera con KPIs de cobranza: cobros de hoy, por cobrar, en mora, en gracia
- Pestañas **Agenda** / **Mi Caja**
  - Agenda: tarjetas con deuda, cuota, vencimiento, periodo y botón `Registrar Cobro`
  - Mi Caja: recaudos propios, desglose por método de pago y número de recibos
- Modal de abono con **prelación en vivo** (debounce de 350 ms contra `preview_pago`):
  muestra mora → interés → capital, exceso no aplicado y deuda restante
- Aviso de restricción de privacidad para el rol `COBRANZA`

---

## 6. Endpoints agregados

| Método | Ruta | Rol | Uso en la UI |
|--------|------|-----|--------------|
| GET | `/api/dashboard/` | ADMINISTRADOR | `DashboardPage` |
| GET | `/api/dashboard/caja/` | Autenticado | KPI "Cobros Hoy" y pestaña "Mi Caja" |
| GET | `/api/dashboard/agenda/` | Autenticado | Lista de cobranza (sin `bolsas`) |
| POST | `/api/prestamos/simular/` | Autenticado | Cotizador (siguiente iteración) |
| POST | `/api/prestamos/{id}/preview_pago/` | Autenticado | Prelación en vivo del modal |

Permisos en `Backend/API/permissions.py` (`EsAdministrador`); los agregados de caja y
agenda se calculan por usuario, no son globales.

---

## 7. Verificación

```powershell
# Frontend
cd frontend
npx vitest run          # 48 tests
npm run build           # tsc -b + vite build

# Backend
$env:DJANGO_SETTINGS_MODULE='CAVI_API.settings'
& "Backend\venv\Scripts\python.exe" -m pytest Backend\API\tests -q   # 65 tests
```

Cobertura de los casos sensibles:

- `test_dashboard.py`: agregados, cuarentena de privacidad, no escritura del preview,
  equivalencia preview ↔ pago real, filtro sin acentos, mora sin recargo.
- `test_prestamos.py::TestEstadoEfectivoEnListado`: semáforo en el listado.
- `DashboardPage.test.tsx` / `CobrosPage.test.tsx`: KPIs, filtros, bloqueo por rol,
  prelación en vivo, validación del interés mínimo y referencia bancaria obligatoria.

---

## 8. Pendiente

- Migrar `ClientesPage`, `FondosPage` y `PrestamoFormPage` al shell y primitivos nuevos
- Sustituir las tablas densas por `DataTable` donde aporte
- Conectar el cotizador a `POST /api/prestamos/simular/` en la UI de crédito
- PDF/A del recibo y pagaré (Sprint 3)
