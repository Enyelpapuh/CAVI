# Sprint 2 - Avances de Desarrollo

**Proyecto:** CAVI - Sistema Web para Control de Préstamos  
**Sprint:** 2 - Motor de Cobranza: Amortización, Imputación Legal y Liquidación 50/50  
**Fecha inicio:** 2026-09-26  
**Stack:** Backend: Django 5.2 + DRF + JWT + SQLite | Frontend: Preact + Vite + Tailwind

---

## Resumen de Tareas

| Task | Descripción | Est. | Estado | % Avance | Observaciones | Fecha | Commits |
|------|-------------|------|--------|----------|---------------|-------|---------|
| CAVI-TK15 | Motor de amortización interés sobre saldo insoluto (Ley 176) | 6h | ✅ Completado | 100% | Cuota constante francesa, tope usura BCN configurable (`.env` TASA_MAXIMA_LEGAL, default 0.0300), prohibición anatocismo, MENSUAL/QUINCENAL, último período ajusta saldo a 0. Endpoint GET /api/prestamos/{id}/amortizacion/. | 2026-09-26 | - |
| CAVI-TK16 | Algoritmo de imputación de pagos (Art. 3180 Código Civil) | 5h | ✅ Completado | 100% | Prelación mora→interés corriente→capital, bloqueo 400 si pago < interés mínimo del ciclo vencido, truncado de sobrepagos a la deuda, CANCELADO automático al saldo 0. Código único PAG-XXXXX. Modelo Pago + migración 0003 + saldo_insoluto (backfill). Serializer role-aware: COBRANZA no ve fondos/utilidades (Ley 787). 10 tests pytest nuevos. | 2026-09-26 | - |
| CAVI-TK17 | Transacción de liquidación 50/50 y trazabilidad (Ley 977) | 6h | ✅ Completado | 100% | 50% interés → GananciaAdministracion, 50% → fondos según Pi; reintegro capital por Pi con saldo_disponible/ganancias; movimientos GANANCIA/REINTEGRO con pago FK (rastro immutable UAF); PagoFondoDetalle. GET /api/pagos/{id}/ recibo. 5 tests nuevos (total 38). | 2026-09-26 | - |
| CAVI-TK18 | Pantalla móvil de asentamiento de cobros + privacidad (Ley 787) | 6h | ⏳ Pendiente | 0% | Flujo ≤4 toques, rol COBRANZA oculta utilidades/fondos. | - | - |
| CAVI-TK19 | Componente recibo digital de pago (Ley 842) | 4h | ⏳ Pendiente | 0% | Desglose, código único, imprimir PDF. | - | - |
| CAVI-TK20 | Pruebas integración consistencia decimal en pagos parciales | 5h | ⏳ Pendiente | 0% | pytest + vitest. | - | - |

---

## Detalle Técnico Completado (TK15)

### Configuración

```python
# Backend/CAVI_API/settings.py
TASA_MAXIMA_LEGAL = Decimal(str(os.getenv('TASA_MAXIMA_LEGAL', '0.0300')))
```

### Motor de Amortización (`Backend/API/services/amortizacion.py`)

- **`validar_tasa(tasa)`**: rechaza tasas `> TASA_MAXIMA_LEGAL` → DRF `ValidationError` (HTTP 400). Prohibición legal de usura (Ley 176).
- **`tasa_periodica(tasa_mensual, periodicidad)`**: MENSUAL = tasa mensual; QUINCENAL = mensual / 2 (redondeo 0.0001).
- **`generar_proyeccion(prestamo)`**: tabla francesa de cuota constante sobre saldo insoluto:
  - `C = P·i / (1 - (1+i)^-n)`
  - Interés por período = `saldo_insoluto × i` (sobre el **remanente**, nunca sobre intereses = sin anatocismo).
  - Último período ajusta capital a saldo restante → saldo insoluto final exacto `0.00`.
  - Devuelve: `prestamo, cliente, monto_principal, tasa_periodica, periodicidad, plazo_meses, total_periodos, total_interes, total_cuotas, periodos[]`.

### Endpoint Nuevo

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | /api/prestamos/{id}/amortizacion/ | Proyección de cuotas e intereses sobre saldo | Sí |

### Verificación Funcional

```python
# 10,000 @ 3% mensual × 6 meses (MENSUAL)
# cuota = 1,845.98 | total intereses = 1,075.86 | total cuotas = 11,075.86
# periodo 1: interes 300.00 capital 1545.98 saldo 8454.02
# periodo 2: interes 253.62 capital 1592.36 saldo 6861.66
# ultimo saldo: 0.00 ✅

# 5,000 @ 3% mensual × 3 meses (QUINCENAL) → i=0.0150, n=6, saldo final 0.00 ✅

# validar_tasa(0.0350) → 400: "La tasa de interés mensual 0.0350 supera el
#   límite legal de usura del BCN (0.0300)." ✅
```

- `pytest`: 23/23 tests Sprint 1 siguen pasando tras los cambios.

---

## Detalle Técnico Completado (TK16)

### Modelo Pago (migración `0003`)

```sql
-- prestamos: + saldo_insoluto NUMERIC(14,2) DEFAULT 0.00 (backfill = monto_principal)
-- pagos
prestamo_id FK, monto_total NUMERIC(14,2) (montro aplicado tras truncado),
fecha_pago DATE, metodo_pago VARCHAR(20) (EFECTIVO/TRANSFERENCIA/CHEQUE/OTRO),
referencia_bancaria VARCHAR(100), codigo_comprobante VARCHAR(30) UNIQUE (PAG-XXXXX),
aplicacion_mora / aplicacion_interes / aplicacion_capital NUMERIC(14,2),
interes_administracion / interes_fondos NUMERIC(14,2) (preparados para TK17),
usuario_id FK, creado_en TIMESTAMPTZ
```

### Motor de Imputación (`Backend/API/services/pagos.py`)

- **Prelación (Art. 3180):** un abono insuficiente cubre primero **mora** (aún 0, Sprint 3), luego **interés corriente devengado**, y solo el resto amortiza **capital**.
- **Interés sobre saldo (solo devengado):** se adeuda únicamente el interés de cortes cuya fecha de vencimiento ya llegó (`interes_minimo_vencido`), descontando lo ya pagado. No se cobra interés futuro no devengado.
- **Bloqueo:** `monto < interés mínimo del ciclo vencido` → HTTP 400 con mensaje citando Art. 3180. Ej: préstamo 10,000 @3%: pagar 299.99 en el primer corte es rechazado (mínimo 300.00).
- **Truncado:** si `monto > deuda_total`, se aplica solo la deuda y el `exceso_no_aplicado` se devuelve en la respuesta (nunca se capitaliza).
- **CANCELADO automático:** al quedar `deuda_restante = 0` el préstamo pasa a `CANCELADO` y rechaza cobros posteriores.
- **Código único (Ley 842):** `PAG-{id:05d}` asignado tras guardar, inmutable y único.

### Endpoint Nuevo

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| POST | /api/prestamos/{id}/pagos/ | Asienta cobro con imputación legal (monto, fecha_pago, metodo_pago, referencia_bancaria) | Sí |

### Privacidad por Rol (Ley 787)

PrestamoSerializer ahora expone `saldo_deudor`, `saldo_insoluto`, `interes_minimo_ciclo` y `proxima_cuota`. Para el rol **COBRANZA** se eliminan `fondos_detalle`, `total_aportado` y `suma_pi` (no ve origen de fondos ni utilidades).

### Verificación

- 33/33 pytest (23 Sprint 1 + 10 nuevos de imputación y privacidad).
- Casos cubiertos: cuota completa, bloqueo menor al mínimo, pago solo-interés, parcial, secuencia de 2 cuotas vs proyección, sobrepago truncado + CANCELADO, cobro post-cancelación rechazado, transferencia con referencia.

---

## Detalle Técnico Completado (TK17)

### Modelos (migración `0004`)

```sql
-- movimientos_fondo: + pago_id FK NULL (trazabilidad UAF), tipo ahora incluye 'REINTEGRO'
-- pago_fondos_detalle: pago_id FK, fondo_id FK, porcentaje_pi, capital_reintegrado, ganancia
-- ganancias_administracion: pago_id FK (OneToOne), monto, fecha
```

### Liquidación 50/50 dentro de la misma transacción ACID

1. El interés corriente imputado al pago se divide: **50% administración** (`interes_administracion`, registrado en `GananciasAdministracion` como acumulador global) y **50% fondos** (`interes_fondos`).
2. Para cada fondo participante (Pi del préstamo):
   - `ganancia = interes_fondos × Pi` → `fondo.ganancias_acumuladas += ganancia`.
   - `capital_reintegrado = capital_aplicado × Pi` → `fondo.saldo_disponible += capital_reintegrado`.
   - Se crea `PagoFondoDetalle` (rastro inmutable por pago/fondo).
   - Se crean `MovimientoFondo` **GANANCIA** y **REINTEGRO** con `pago` FK y descripción `Liquidación PAG-XXXXX …`.
3. División proporcional con absorción del remanente en la última parte (`_split_proporcional`): la suma siempre cuadra al centavo exacto; nunca se pierde ni se inventa dinero.
4. Todo dentro de `@transaction.atomic` → rollback total si falla (fondos insuficientes, etc.).

### Endpoint Nuevo

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | /api/pagos/ | Listar pagos (paginado, ?prestamo=ID) | Sí |
| GET | /api/pagos/{id}/ | Recibo completo con PagoFondoDetalle + GananciaAdministracion | Sí |

### Privacidad recibo (Ley 787)

El recibo (PagoReciboSerializer) oculta para rol **COBRANZA**: `fondos_detalle`, `ganancia_administracion`, `interes_administracion` e `interes_fondos` (no ve utilidades ni origen de fondos). Los demás datos del desglose legal sí.

### Verificación

- 38/38 pytest.
- Casos: 50/50 justo, reintegro capital + ganancia con Pi 1.0000, multifondo sin perder centavos, cancelación con saldo de fondos íntegro, recibo (admin vs cobranza), trazabilidad por pago.

---

## Próximos Pasos

1. **TK18-TK19:** Frontend de cobros (CobrosPage móvil) y recibo digital (Ley 842).
2. **TK20:** Pruebas de integración de consistencia decimal en pagos parciales.