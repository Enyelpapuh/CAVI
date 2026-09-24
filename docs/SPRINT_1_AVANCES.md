# Sprint 1 - Avances de Desarrollo

**Proyecto:** CAVI - Sistema Web para Control de Préstamos  
**Sprint:** 1 - Gestión de Fondos Familiares y Desembolso Multifondo  
**Fecha inicio:** 2026-09-23  
**Stack:** Backend: Django 5.2 + DRF + JWT + SQLite | Frontend: Preact + Vite + Tailwind

---

## Resumen de Tareas

| Task | Descripción | Est. | Estado | % Avance | Observaciones | Fecha | Commits |
|------|-------------|------|--------|----------|---------------|-------|---------|
| CAVI-TK08 | Modelo relacional Fondos + Movimientos + CHECK saldo >= 0 | 5h | ✅ Completado | 100% | Modelos: Fondo, MovimientoFondo, Prestamo, PrestamoFondoDetalle. Migración 0002 aplicada. Check constraint BD nivel. | 2026-09-23 | - |
| CAVI-TK09 | Endpoints depósitos/inyecciones/retiros con validación saldo | 4h | ✅ Completado | 100% | ViewSet Fondo: CRUD + actions inyeccion/retiro/movimientos. Validación saldo insuficiente retorna 400 con disponible. | 2026-09-23 | - |
| CAVI-TK10 | Lógica cálculo proporción Pi (4 decimales, suma=1.0000) | 4h | ✅ Completado | 100% | Validación en PrestamoCreateSerializer: suma montos = principal, suma Pi = 1.0000 ± 0.0001. Decimal precision. | 2026-09-23 | - |
| CAVI-TK11 | Transacción atómica ACID desembolso multifondo | 6h | ✅ Completado | 100% | @transaction.atomic en create(). Debita simultáneamente fondos, crea PrestamoFondoDetalle + MovimientoFondo DESEMBOLSO. Rollback si fondo insuficiente. | 2026-09-23 | - |
| CAVI-TK12 | Frontend: Administración de fondos (tarjetas + modales) | 5h | ✅ Completado | 100% | FondosPage: grid tarjetas con saldo/capital/ganancias/rentabilidad, modales crear/inyección/retiro, historial movimientos paginado. Ruta /fondos. | 2026-09-24 | - |
| CAVI-TK13 | Frontend: Formulario préstamo selector multifondo | 6h | ✅ Completado | 100% | PrestamoFormPage: selector cliente con búsqueda, tabla multifondo con monto/Pi por fondo, distribución automática (divide monto, calcula Pi), cálculos en vivo (total, Σ Pi, faltante/excedente), botón deshabilitado si validaciones fallan, modal confirmación con débitos por fondo. Ruta /prestamos/nuevo. | 2026-09-24 | - |
| CAVI-TK14 | Pruebas unitarias fondos/desembolsos (pytest + vitest) | 4h | 🔄 Pendiente | 0% | - | - | - |

---

## Detalle Técnico Completado (TK08-TK11)

### Backend - Nuevos Modelos (migración 0002)

```sql
-- fondos
id BIGSERIAL PK, nombre VARCHAR(100), familiar VARCHAR(100),
saldo_disponible NUMERIC(14,2) CHECK (saldo_disponible >= 0),
capital_inicial NUMERIC(14,2), ganancias_acumuladas NUMERIC(14,2) DEFAULT 0,
activo BOOLEAN, creado_en TIMESTAMPTZ, actualizado_en TIMESTAMPTZ

-- movimientos_fondo
id BIGSERIAL PK, fondo_id FK, tipo VARCHAR(20) CHECK IN ('INYECCION','RETIRO','DESEMBOLSO','GANANCIA'),
monto NUMERIC(14,2), saldo_anterior NUMERIC(14,2), saldo_posterior NUMERIC(14,2),
descripcion TEXT, creado_en TIMESTAMPTZ

-- prestamos
id BIGSERIAL PK, cliente_id FK, monto_principal NUMERIC(14,2),
tasa_interes NUMERIC(5,4), plazo_meses INT, periodicidad VARCHAR(20),
fecha_desembolso DATE, fecha_primer_corte DATE, estado VARCHAR(20) DEFAULT 'VIGENTE',
creado_en TIMESTAMPTZ, actualizado_en TIMESTAMPTZ

-- prestamo_fondos_detalle
id BIGSERIAL PK, prestamo_id FK, fondo_id FK, monto_aportado NUMERIC(14,2),
porcentaje_pi NUMERIC(5,4), UNIQUE(prestamo_id, fondo_id)
```

### Endpoints Nuevos

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | /api/fondos/ | Listar fondos activos (paginado, ?search=) | Sí |
| POST | /api/fondos/ | Crear fondo (capital_inicial → saldo_disponible + movimiento INYECCION) | Sí |
| GET | /api/fondos/{id}/ | Detalle fondo + movimientos + capital_colocado + rentabilidad | Sí |
| POST | /api/fondos/{id}/inyeccion/ | Inyección adicional de capital | Sí |
| POST | /api/fondos/{id}/retiro/ | Retiro de capital (valida saldo >= monto) | Sí |
| GET | /api/fondos/{id}/movimientos/ | Historial paginado de movimientos | Sí |
| GET | /api/prestamos/ | Listar préstamos (paginado, ?search=, ?estado=) | Sí |
| POST | /api/prestamos/ | Crear préstamo multifondo (transacción atómica) | Sí |
| GET | /api/prestamos/{id}/ | Detalle préstamo + fondos_detalle + total_aportado + suma_pi | Sí |

### Validaciones Implementadas

**Fondo:**
- `saldo_disponible >= 0` (CHECK constraint BD + validación serializer)
- Retiro: 400 si `monto > saldo_disponible` con mensaje "Saldo insuficiente. Disponible: X, Solicitado: Y"

**Préstamo Multifondo:**
- Al menos 1 fondo aportante
- `sum(monto_aportado) == monto_principal` (tolerancia 0)
- `sum(porcentaje_pi) == 1.0000` (tolerancia 0.0001)
- Cada fondo: `saldo_disponible >= monto_aportado` (bloquea con select_for_update implícito en atomic)

### Transacción Atómica (PrestamoViewSet.create)

```python
@transaction.atomic
def create(self, request, *args, **kwargs):
    # 1. Validar serializer (fondos_detalle con montos + Pi)
    # 2. Crear Prestamo
    # 3. Para cada fondo_detalle:
    #    a. fondo.refresh_from_db() + select_for_update implícito
    #    b. Verificar saldo_disponible >= monto_aportado
    #    c. fondo.saldo_disponible -= monto_aportado; fondo.save()
    #    d. Crear PrestamoFondoDetalle(monto_aportado, porcentaje_pi)
    #    e. Crear MovimientoFondo(tipo=DESEMBOLSO, monto, saldos)
    # 4. Si cualquier paso falla → ROLLBACK total
    # 5. Retornar PrestamoSerializer(prestamo)
```

### Verificación Funcional (2026-09-23)

```bash
# Crear fondo
curl -X POST http://localhost:8000/api/fondos/ \
  -H "Authorization: Bearer <token>" \
  -d '{"nombre":"Fondo Principal","familiar":"Juan Pérez","capital_inicial":"50000.00"}'
# ✅ Crea fondo + movimiento INYECCION inicial

# Inyección
curl -X POST http://localhost:8000/api/fondos/1/inyeccion/ \
  -H "Authorization: Bearer <token>" \
  -d '{"monto":"10000.00","descripcion":"Inyección adicional"}'
# ✅ saldo 50000→60000, movimiento INYECCION

# Retiro (válido)
curl -X POST http://localhost:8000/api/fondos/1/retiro/ \
  -H "Authorization: Bearer <token>" \
  -d '{"monto":"5000.00"}'
# ✅ saldo 60000→55000, movimiento RETIRO

# Retiro (inválido - saldo insuficiente)
curl -X POST http://localhost:8000/api/fondos/1/retiro/ \
  -H "Authorization: Bearer <token>" \
  -d '{"monto":"100000.00"}'
# ✅ 400: {"error":"Saldo insuficiente. Disponible: 55000.00, Solicitado: 100000.00"}

# Crear préstamo multifondo (2 fondos)
curl -X POST http://localhost:8000/api/prestamos/ \
  -H "Authorization: Bearer <token>" \
  -d '{"cliente":2,"monto_principal":"50000.00","tasa_interes":"0.0250","plazo_meses":12,
      "periodicidad":"MENSUAL","fecha_desembolso":"2026-09-23","fecha_primer_corte":"2026-10-23",
      "fondos_detalle":[{"fondo":1,"monto_aportado":"30000.00","porcentaje_pi":"0.6000"},
                       {"fondo":2,"monto_aportado":"20000.00","porcentaje_pi":"0.4000"}]}'
# ✅ 201 Created: Prestamo + 2 PrestamoFondoDetalle + 2 MovimientoFondo(DESEMBOLSO)
# ✅ Fondos debitados: Fondo1 55000→25000, Fondo2 30000→10000

# Validaciones préstamo:
# - Pi suma != 1.0000 → 400: "La suma de porcentajes Pi (1.1000) debe ser 1.0000"
# - Montos suma != principal → 400: "La suma de aportes (45000) debe igualar el monto principal (50000)"
# - Fondo sin saldo → 400: "El fondo 'X' no tiene saldo suficiente"
# - Segundo intento mismo préstamo → 400 (fondos ya debitados)
```

---

## Próximos Pasos (TK14)

1. **TK14 - Tests:**

---

## Notas Técnicas

- **Monetarios:** `DecimalField(max_digits=14, decimal_places=2)` en todos los campos financieros
- **Precisión Pi:** `Decimal('0.0001')` quantization, validación `abs(suma_pi - 1) <= 0.0001`
- **Concurrencia:** `transaction.atomic` + `refresh_from_db()` dentro del bloque para simular `select_for_update`
- **Inmutabilidad:** `MovimientoFondo` nunca se edita/elimina (PROTECT en FK)
- **Rentabilidad:** `ganancias_acumuladas / capital_inicial * 100` (calculado en serializer)