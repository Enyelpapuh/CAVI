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
| CAVI-TK16 | Algoritmo de imputación de pagos (Art. 3180 Código Civil) | 5h | ⏳ Pendiente | 0% | Prelación mora→interés→capital, bloqueo < interés mínimo, truncado, CANCELADO. | - | - |
| CAVI-TK17 | Transacción de liquidación 50/50 y trazabilidad (Ley 977) | 6h | ⏳ Pendiente | 0% | PagoFondoDetalle, GananciaAdministracion, MovimientoFondo.pago, REINTEGRO. | - | - |
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

## Próximos Pasos

1. **TK16:** Imputación de pagos (Art. 3180): prelación mora → interés corriente → capital, bloqueo de pagos menores al interés mínimo del ciclo, truncado de sobrepagos, estado CANCELADO al saldo 0. POST /api/prestamos/{id}/pagos/.
2. **TK17:** Liquidación 50/50 + trazabilidad UAF y reintegro de capital por Pi.
3. **TK18-TK19:** Frontend de cobros y recibo.
4. **TK20:** Pruebas de integración.