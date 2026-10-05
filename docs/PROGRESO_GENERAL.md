# CAVI - Progreso General del Proyecto

**Proyecto:** CAVI - Sistema Web para Control de Préstamos  
**Metodología:** Scrum (Sprints de 2 semanas)  
**Stack:** Backend: Django 5.2 + DRF + JWT + SQLite/PostgreSQL | Frontend: Preact + Vite + Tailwind  
**Repositorio:** Git local + GitHub (`origin/main` sincronizado)

---

## Resumen Ejecutivo por Sprint

| Sprint | Tema | Tareas | Estado | % Global | Fechas |
|--------|------|--------|--------|----------|--------|
| **Sprint 0** | Infraestructura Base + Padrón Clientes | 7 (TK01-TK07) | ✅ **COMPLETADO** | 100% | 2026-09-22 |
| **Sprint 1** | Fondos Familiares + Desembolso Multifondo | 7 (TK08-TK14) | ✅ **COMPLETADO** | 100% | 2026-09-23 → 2026-09-24 |
| **Sprint 2** | Motor Amortización + Cobranza + Liquidación 50/50 | 6 (TK15-TK20) | ✅ Completado | 100% | 2026-09-25 |
| **Sprint 3** | Control Mora + PDF Legal + Android | 6 (TK21-TK26) | ⏳ Pendiente | 0% | - |
| **Sprint 4** | Pruebas + Despliegue + Validación Campo | 5 (TK27-TK31) | ⏳ Pendiente | 0% | - |

**Total:** 31 tareas | **Completadas:** 24 | **En progreso:** 0 | **Pendientes:** 7 (Sprint 3: 27h, Sprint 4: 27h)

---

## Sprint 0 - COMPLETADO ✅

**Objetivo:** Infraestructura base, autenticación, modelo conceptual y padrón de clientes

| Task | Descripción | Estado | Commit |
|------|-------------|--------|--------|
| CAVI-TK01 | Django + DRF + JWT + CORS + SQLite + .env | ✅ | 5fed9fb |
| CAVI-TK02 | Migraciones automáticas (Usuario, Cliente) | ✅ | 5fed9fb |
| CAVI-TK03 | Auth JWT + RBAC (ADMINISTRADOR/COBRANZA) | ✅ | 5fed9fb |
| CAVI-TK04 | CRUD Clientes + validación cédula única | ✅ | 5fed9fb |
| CAVI-TK05 | Preact + Vite + Tailwind + Proxy | ✅ | 6eab920 |
| CAVI-TK06 | Login + AuthContext + Axios interceptors | ✅ | 6eab920 |
| CAVI-TK07 | ClientesPage: tabla, búsqueda, modal CRUD | ✅ | 6eab920 |

**Entregables:**
- Backend API funcional en `http://localhost:8000/api/`
- Frontend en `http://localhost:5173`
- Build optimizado: 86 KB JS + 13 KB CSS (gzipped)
- Documentación: `SPRINT_0_AVANCES.md`

---

## Sprint 1 - COMPLETADO ✅ (Backend + Frontend + Tests)

**Objetivo:** Gestión de fondos familiares y desembolso multifondo  
**Estimación total:** 28h | **Completado:** ~34h (7 tareas)

| Task | Descripción | Requisitos | Est. | Estado | Avance |
|------|-------------|------------|------|--------|--------|
| **CAVI-TK08** | Modelo relacional Fondos + Movimientos | FR-01, FR-03, BR-01, CU-01 | 5h | ✅ **Completado** | 100% |
| **CAVI-TK09** | Endpoints depósitos/inyecciones/retiros | FR-02, CU-01 | 4h | ✅ **Completado** | 100% |
| **CAVI-TK10** | Lógica cálculo proporción Pi (4 decimales) | FR-06, BR-02 | 4h | ✅ **Completado** | 100% |
| **CAVI-TK11** | Transacción atómica desembolso multifondo | FR-07, NFR-04, CU-03 | 6h | ✅ **Completado** | 100% |
| **CAVI-TK12** | Frontend: Administración de fondos | UR-01, CU-01 | 5h | ✅ **Completado** | 100% |
| **CAVI-TK13** | Frontend: Formulario préstamo selector multifondo | FR-06, UR-01, CU-03 | 6h | ✅ **Completado** | 100% |
| **CAVI-TK14** | Pruebas unitarias fondos/desembolsos | TC-FND-002, TC-LON-002 | 4h | ✅ **Completado** | 100% |

### Modelo de Datos Sprint 1 (aplicado - migración 0002)

```sql
-- fondos (bolsas de inversión por familiar)
id BIGSERIAL PK, nombre VARCHAR(100), familiar VARCHAR(100),
saldo_disponible NUMERIC(14,2) CHECK (saldo_disponible >= 0),
capital_inicial NUMERIC(14,2), ganancias_acumuladas NUMERIC(14,2),
activo BOOLEAN, creado_en TIMESTAMPTZ

-- movimientos_fondo (historial inmutable)
id BIGSERIAL PK, fondo_id FK, tipo VARCHAR(20) CHECK IN ('INYECCION','RETIRO','DESEMBOLSO','GANANCIA'),
monto NUMERIC(14,2), saldo_anterior NUMERIC(14,2), saldo_posterior NUMERIC(14,2),
descripcion TEXT, creado_en TIMESTAMPTZ

-- prestamos
id BIGSERIAL PK, cliente_id FK, monto_principal NUMERIC(14,2),
tasa_interes NUMERIC(5,4), plazo_meses INT, periodicidad VARCHAR(20),
fecha_desembolso DATE, fecha_primer_corte DATE, estado VARCHAR(20) DEFAULT 'VIGENTE',
creado_en TIMESTAMPTZ

-- prestamo_fondos_detalle (participación Pi por fondo)
id BIGSERIAL PK, prestamo_id FK, fondo_id FK, monto_aportado NUMERIC(14,2),
porcentaje_pi NUMERIC(5,4) -- 4 decimales, ej: 0.3333
UNIQUE(prestamo_id, fondo_id)
```

### Endpoints Sprint 1 (Backend - Funcionales)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/fondos/ | Listar fondos (paginado, ?search=) |
| POST | /api/fondos/ | Crear fondo + movimiento INYECCION inicial |
| GET | /api/fondos/{id}/ | Detalle + movimientos + capital_colocado + rentabilidad% |
| POST | /api/fondos/{id}/inyeccion/ | Inyección adicional capital |
| POST | /api/fondos/{id}/retiro/ | Retiro capital (valida saldo >= monto) |
| GET | /api/fondos/{id}/movimientos/ | Historial paginado |
| GET | /api/prestamos/ | Listar préstamos (paginado, ?search=, ?estado=) |
| POST | /api/prestamos/ | Crear préstamo multifondo (transacción atómica) |
| GET | /api/prestamos/{id}/ | Detalle + fondos_detalle + total_aportado + suma_pi |

### Validaciones Implementadas (Backend)

**Fondo:**
- `saldo_disponible >= 0` (CHECK constraint BD + validación serializer)
- Retiro: 400 si `monto > saldo_disponible` con mensaje detallado

**Préstamo Multifondo:**
- Al menos 1 fondo aportante
- `sum(monto_aportado) == monto_principal` (tolerancia 0)
- `sum(porcentaje_pi) == 1.0000` (tolerancia 0.0001)
- Cada fondo: `saldo_disponible >= monto_aportado` (bloquea con atomic + refresh)

### Transacción Atómica (PrestamoViewSet.create)

```python
@transaction.atomic
def create(self, request, *args, **kwargs):
    # 1. Validar serializer (fondos_detalle con montos + Pi)
    # 2. Crear Prestamo
    # 3. Para cada fondo_detalle:
    #    a. fondo.refresh_from_db()  # Simula select_for_update
    #    b. Verificar saldo_disponible >= monto_aportado
    #    c. fondo.saldo_disponible -= monto_aportado; fondo.save()
    #    d. Crear PrestamoFondoDetalle(monto_aportado, porcentaje_pi)
    #    e. Crear MovimientoFondo(tipo=DESEMBOLSO, monto, saldos)
    # 4. Si cualquier paso falla → ROLLBACK total
    # 5. Retornar PrestamoSerializer(prestamo)
```

---

## Sprint 2 - COMPLETADO ✅ (Backend + Frontend + Tests)

**Objetivo:** Motor amortización (Ley 176), prelación cobros, liquidación 50/50

| Task | Descripción | Requisitos | Est. | Estado | Commit |
|------|-------------|------------|------|--------|--------|
| CAVI-TK15 | Motor amortización interés sobre saldo (Ley 176) | FR-08, BR-03 | 6h | ✅ Completado | 29c1b83 |
| CAVI-TK16 | Prelación cobros: mora → interés → capital | FR-09, CU-04 | 5h | ✅ Completado | 29c1b83 |
| CAVI-TK17 | Liquidación 50/50 + prorrateo a fondos | FR-10, BR-02, CU-04 | 6h | ✅ Completado | 29c1b83 |
| CAVI-TK18 | Frontend: Asentamiento rápido móvil | UR-03, NFR-05 | 6h | ✅ Completado | 29c1b83 |
| CAVI-TK19 | Frontend: Recibo digital desglose | UR-03, CU-04 | 4h | ✅ Completado | 29c1b83 |
| CAVI-TK20 | Pruebas integración consistencia decimal | TC-BIL-001, TC-BIL-002 | 5h | ✅ Completado | 29c1b83 |

**Detalle:** `docs/SPRINT_2_AVANCES.md`

---

## Rediseño UI Stitch - COMPLETADO ✅ (base para Sprint 3)

**Objetivo:** Migrar el diseño Stitch al frontend real con datos del backend, sin alterar reglas legales

| Fase | Entregable | Estado | Commit |
|------|-----------|--------|--------|
| 1 | Design system Material 3 (tokens, Inter, Material Symbols) | ✅ | c484a52 |
| 2 | Primitivos UI (Icon, Button, Card, KpiTile, DataTable, Modal, Field, Toast) | ✅ | (Fase 2) |
| 3 | Shell: sidebar 260px por rol, topbar, drawer móvil, PageHeader | ✅ | 146caf9 |
| 4 | API: agregados dashboard, caja, agenda, simulación de cuota, preview de prelación | ✅ | 08b38aa |
| 5 | `DashboardPage`: KPIs reales, cartera filtrable, tabla responsive | ✅ | 3a8166b |
| 6-7 | `CobrosPage`: agenda, caja propia y modal de abono con prelación en vivo | ✅ | d152e94 |
| 8 | `ClientesPage`, `FondosPage`, `PrestamoFormPage` y `PagoRecibo` migrados + cotizador en vivo | ✅ | b3fda01 |

**Nuevos endpoints (todos con tests):**

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| GET | `/api/dashboard/` | ADMINISTRADOR | KPIs, bolsas, cartera y abonos del día |
| GET | `/api/dashboard/caja/` | Autenticado | Recaudos propios del usuario (Ley 787) |
| GET | `/api/dashboard/agenda/` | Autenticado | Agenda de cobranza sin detalle Pi |
| POST | `/api/prestamos/simular/` | Autenticado | Amortización sin persistir |
| POST | `/api/prestamos/{id}/preview_pago/` | Autenticado | Prelación Art. 3180 sin asentar |

**Decisiones legales aplicadas:**

- `DIAS_GRACIA = 4` compartido entre backend (`services/estados.py`) y frontend (`lib/estadoPrestamo.ts`)
- El semáforo Al Día / En Gracia / En Mora se **calcula**, no se cobra: la mora generadora llega en Sprint 3
- Se conservan únicamente `MENSUAL` y `QUINCENAL` (sin cobro diario)
- `COBRANZA` no recibe fondos, detalle Pi, liquidaciones 50/50 ni ganancias administrativas
- El preview y el pago real comparten `_prelacion()`, por lo que el desglose nunca difiere

**Documentación:** `docs/UI_SISTEMA_DISENO.md`

---

## Sprint 3 - PENDIENTE ⏳ (27h)

**Objetivo:** Control mora, documentos PDF/A legales, empaquetado Android

**Base ya construida (no cuenta como tarea):**

- `services/estados.py` calcula atraso, `DIAS_GRACIA = 4` y el semáforo operativo
- `services/pagos.py` ya aplica la prelación mora → interés → capital con `mora_insoluto = 0.00` fijo
- `PagoRecibo` ya es imprimible (`window.print()`) y lista para slapping en PDF

| Task | Descripción | Requisitos | Est. | Estado |
|------|-------------|------------|------|--------|
| CAVI-TK21 | Motor evaluación mora (4 días gracia) | FR-11, UR-02, CU-04 | 4h | ⏳ Pendiente |
| CAVI-TK22 | Servicio generación PDF/A (WeasyPrint) | FR-12, NFR-07 | 5h | ⏳ Pendiente |
| CAVI-TK23 | Plantilla Pagaré legal (Ley 176, Código Comercio) | FR-13, CU-03 | 6h | ⏳ Pendiente |
| CAVI-TK24 | Dashboard semaforización cobranza | UR-02, CU-04 | 5h | ⏳ Pendiente |
| CAVI-TK25 | Descarga/impresión pagaré | UR-04, FR-12 | 3h | ⏳ Pendiente |
| CAVI-TK26 | Capacitor + build Android .apk | NFR-05 | 4h | ⏳ Pendiente |

**Detalle de TK21:** reemplazar `mora_insoluto = Decimal('0.00')` en `totales_insolutos()`
por el generador real (días vencidos − 4 de gracia) × tasa diaria, y persistir el estado
`EN_MORA` en el préstamo. Requiere agregar la dependencia de PDF (`weasyprint`) en
`Backend/requirements.txt`, que hoy no existe.

---

## Sprint 4 - PENDIENTE ⏳ (27h)

**Objetivo:** Pruebas técnicas, despliegue nube, validación cualitativa

| Task | Descripción | Requisitos | Est. | Estado |
|------|-------------|------------|------|--------|
| CAVI-TK27 | Pruebas rendimiento < 2s | NFR-08 | 4h | ⏳ Pendiente |
| CAVI-TK28 | Pruebas resiliencia cortes red + rollback | NFR-04, TC-REL-002 | 4h | ⏳ Pendiente |
| CAVI-TK29 | Despliegue nube + HTTPS/TLS | NFR-02 | 5h | ⏳ Pendiente |
| CAVI-TK30 | Inmersión operativa + diario campo | Validación Campo | 8h | ⏳ Pendiente |
| CAVI-TK31 | Entrevistas cualitativas usabilidad | Enfoque Mixto | 6h | ⏳ Pendiente |

**Pendientes técnicos sueltos (fuera de sprint, incluidos en el rediseño):**

- Foco atrapado dentro de `Modal` y navegación por teclado en `DataTable`
- Cierre de caja diario y conciliación de diferencias
- Pagaré imprimible en HTML antes del PDF/A de TK23

---

## Métricas de Calidad

| Métrica | Sprint 0 | Sprint 1 | Sprint 2 | Sprint 3 | Sprint 4 |
|---------|----------|----------|----------|----------|----------|
| Cobertura tests backend | 0% | Meta: 80% | Meta: 85% | Meta: 90% | Meta: 90% |
| Cobertura tests frontend | 0% | Meta: 70% | Meta: 75% | Meta: 80% | Meta: 80% |
| Build size (gzipped) | 99 KB | < 200 KB | < 250 KB | < 300 KB | < 300 KB |
| API response time | < 200ms | < 200ms | < 500ms | < 500ms | < 2s (prod) |
| Bugs críticos | 0 | 0 | 0 | 0 | 0 |

---

## Próximos Pasos Inmediatos

1. **Sprint 3 - TK21:** motor de mora real (días vencidos − `DIAS_GRACIA = 4`) en
   `Backend/API/services/pagos.py`, con estado `EN_MORA` persistido y tests
2. **Sprint 3 - TK22/TK23/TK25:** dependencia WeasyPrint, plantilla de pagaré legal y descarga PDF
3. **Sprint 3 - TK24:** semaforización de cobranza en `DashboardPage`
4. **Sprint 3 - TK26:** empaquetado Capacitor
5. **Sprint 4:** pruebas técnicas, despliegue con HTTPS y validación de campo

---

## Notas Técnicas Clave

- **Monetarios:** `DecimalField(max_digits=14, decimal_places=2)` en todos los modelos financieros
- **Precisión Pi:** `Decimal` con `quantize(Decimal('0.0001'))` - 4 decimales exactos
- **Transacciones:** `@transaction.atomic` + `refresh_from_db()` para concurrencia
- **Checks BD:** `saldo_disponible >= 0` a nivel base de datos (CHECK constraint)
- **Zona horaria:** America/Managua (UTC-6) en todos los timestamps
- **CORS:** http://localhost:5173 (dev), configurar dominio prod en Sprint 4
- **Inmutabilidad:** `MovimientoFondo` con `on_delete=PROTECT` - nunca se edita/elimina
- **Rentabilidad:** `ganancias_acumuladas / capital_inicial * 100` (calculado en serializer)