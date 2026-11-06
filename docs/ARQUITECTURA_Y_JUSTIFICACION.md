# CAVI — Arquitectura y Justificación Técnica

> Documento de apoyo para defensa técnica, revisión académica y continuidad del proyecto.
> Explica **qué es CAVI**, **por qué existe**, **qué arquitectura usa** y **por qué esa
> arquitectura es la correcta para este contexto** (incluida la pregunta obligada:
> *“¿cuántas personas van a usar el sistema?”*).

---

## 1. Resumen ejecutivo

CAVI (*Control, Administración y Vinculación de Inversiones Crediticias*) es una
plataforma web y móvil para administrar **micropréstamos operados con multifondos de
capital familiar** en Nicaragua. Digitaliza el ciclo completo del crédito: originación
multifondo, cálculo de cuotas sobre saldo insoluto, cobranza con prelación legal,
distribución de rendimientos 50/50, control de mora y emisión de pagarés en PDF/A.

La arquitectura elegida es un **monolito modular** (Django + DRF) con un **frontend SPA
desacoplado** (Preact), empaquetable como aplicación Android mediante Capacitor.

Esta decisión **no es una limitación técnica ni una carencia**: es la respuesta correcta
al tamaño real de la operación (pocos usuarios, bajo volumen, un solo equipo de
desarrollo) y a los requisitos del dominio (consistencia transaccional fuerte, precisión
decimal y trazabilidad legal). Un monolito modular bien separado por dominios es más
seguro, más económico y más mantenible que una arquitectura distribuida para un sistema
que no la necesita.

---

## 2. ¿Por qué existe CAVI? (el problema)

Antes del sistema, la operación de los fondos familiares se gestionaba de forma manual
(hojas de cálculo, cuadernos o memoria del cobrador). Ese esquema produce problemas
concretos y verificables:

1. **Errores de cálculo financiero.** El interés compuesto mal aplicado o el redondeo con
   coma flotante generan descuadres y cobros indebidos.
2. **Riesgo legal.** La ley nicaragüense exige calcular intereses solo sobre saldo
   insoluto (Ley N.º 176) y aplicar los pagos en un orden específico (Art. 3180 del
   Código Civil). Hacerlo “a mano” no garantiza cumplimiento ni trazabilidad.
3. **Falta de control sobre los fondos.** Sin registro auditable es imposible saber cuánto
   capital aportó cada familiar, cuánto interés le corresponde y cuánto está en calle.
4. **Cobranza sin visibilidad.** No hay alertas tempranas de atraso, mora ni estado real
   de cada crédito.
5. **Pérdida de documentos.** Los pagarés y recibos en papel se extravían o se emiten sin
   los requisitos formales de un título valor.

CAVI convierte ese proceso artesanal en un **sistema verificable, auditable y legalmente
defendible**.

---

## 3. ¿Qué hace el software? (alcance)

| Módulo | Función principal |
| --- | --- |
| **Padrón de clientes** | Registro único por cédula, búsqueda y control de estado. |
| **Fondos familiares** | Capital inicial, saldos, inyecciones, retiros, movimientos y rendimientos por fondo. |
| **Originación multifondo** | Un préstamo puede financiarse con varios fondos, distribuyendo el capital según el factor **Pi** (proporción de aporte, 4 decimales). |
| **Motor de amortización** | Cuota francesa calculada estrictamente sobre el saldo insoluto, sin anatocismo (Ley N.º 176). |
| **Cobranza** | Registro de pagos con prelación forzosa: **mora → interés corriente → capital** (Art. 3180). |
| **Mora y tolerancia** | 4 días de gracia; al quinto día el crédito entra en mora y devenga recargo diario. Cálculo idempotente y persistente. |
| **Distribución 50/50** | Del interés cobrado, 50 % a la administración y 50 % a los fondos, en proporción a su aporte. |
| **Pagarés y recibos** | Documentos legales en PDF/A-2b (con respaldo imprimible en HTML si el entorno no soporta PDF/A). |
| **Dashboard y reportería** | Semáforo de cobranza, cartera, caja del cobrador, informe financiero por fondo y comparativas mes a mes. |
| **Seguridad** | Autenticación JWT, roles ADMINISTRADOR y COBRANZA, y restricciones de privacidad (Ley N.º 787). |
| **Movilidad** | Empaquetado Android con Capacitor para cobranza en campo. |

---

## 4. La pregunta clave: ¿cuántas personas usarán el sistema?

Esta es la pregunta que define la arquitectura, y la respuesta es **muy pocas**.

### 4.1 Perfil real de usuarios

| Rol | Cantidad estimada | Uso típico |
| --- | --- | --- |
| Administrador / dueño de los fondos | 1 | Configuración, desembolsos, reportes, mora |
| Cobradores | 2 a 5 | Cobro diario en ruta, recibos, pagarés |
| Consulta familiar (opcional) | 1 a 2 | Revisión de rendimientos de su fondo |
| **Total** | **4 a 8 personas** | Operación diaria |

### 4.2 Carga y volumen estimados

- **Concurrencia real:** 1 a 3 usuarios simultáneos; picos de 5.
- **Créditos nuevos:** decenas por mes (no miles por hora).
- **Pagos:** cientos por mes.
- **Datos históricos:** miles de registros al año, no millones.
- **Disponibilidad esperada:** horario comercial; se tolera mantenimiento nocturno.

### 4.3 Conclusión arquitectónica

Con 4–8 usuarios y esa carga, **un monolito modular es la opción técnicamente superior**:

- No hay necesidad de escalar componentes de forma independiente.
- No hay equipos separados que justifiquen límites de servicio.
- No hay picos de tráfico que exijan autoescalado por microservicio.
- El costo de infraestructura puede ser mínimo (un solo servicio + una base de datos).

Dicho de forma directa: **elegir microservicios aquí sería sobredimensionar la solución**,
aumentando complejidad, costo y puntos de falla sin beneficio real. La arquitectura debe
ajustarse al problema, no a la moda.

---

## 5. Arquitectura adoptada

### 5.1 Vista general

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTES                              │
│   Navegador web (SPA Preact)      App Android (Capacitor)     │
└───────────────┬───────────────────────────┬─────────────────┘
                │  HTTPS / JSON (JWT)       │
                ▼                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND — MONOLITO MODULAR                │
│                     Django 5.2 + DRF                         │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐   │
│  │ Auth/RBAC│ │ Clientes │ │  Fondos  │ │  Préstamos    │   │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐   │
│  │  Pagos   │ │   Mora   │ │Dashboard │ │ Documentos PDF│   │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘   │
│                                                              │
│        Capa de servicios de dominio (lógica de negocio)      │
│        Transacciones ACID · Decimal · Auditoría              │
└───────────────────────────┬─────────────────────────────────┘
                            │
                ┌───────────▼───────────┐
                │  Base de datos única  │
                │  SQLite (dev)         │
                │  PostgreSQL (prod)    │
                └───────────────────────┘
```

### 5.2 ¿Por qué es un monolito *modular* y no un “monolito de bolas de barro”?

Porque el código está separado por **dominios funcionales** y por una **capa de servicios**
que concentra las reglas de negocio:

- `services/amortizacion.py` — motor financiero.
- `services/mora.py` — devengo y acumulación de mora.
- `services/pagos.py` — prelación legal y distribución.
- `services/estados.py` — estados efectivos del crédito.
- `services/dashboard.py` — agregados y semáforo.
- `services/pdf.py` y `services/pagare.py` — documentos legales.

Los ViewSets solo orquestan: validan entrada, delegan en servicios y serializan salida.
Esto permite **extraer un módulo a un servicio independiente en el futuro** sin reescribir
la lógica de negocio. Es un monolito **preparado para evolucionar**, no un bloque
inseparable.

### 5.3 Frontend desacoplado (SPA)

El frontend (Preact + TypeScript + Vite) consume una API REST. Esta separación aporta:

- Reutilización del mismo backend para web y Android.
- Desarrollo independiente de interfaz y lógica.
- Posibilidad de reemplazar la interfaz sin tocar el dominio.

No se trata de “microservicios”: es **un backend y un cliente**, dos piezas, no diez
servicios coordinados.

---

## 6. ¿Por qué esta arquitectura y no otra?

### 6.1 ¿Por qué no microservicios?

| Criterio | Monolito modular | Microservicios |
| --- | --- | --- |
| Usuarios | 4–8 | Miles |
| Equipos de desarrollo | 1 | Varios por servicio |
| Consistencia de datos | Fuerte, transaccional | Eventual, requiere sagas |
| Complejidad operativa | Baja | Alta (orquestación, red, observabilidad) |
| Costo de infraestructura | Bajo | Alto |
| Riesgo de fallos distribuidos | Nulo | Alto |
| Tiempo de despliegue | Minutos | Pipeline complejo |
| Ajuste al proyecto | **Alto** | Bajo |

En un dominio financiero con reglas legales, la **consistencia transaccional** es crítica.
Un monolito con transacciones ACID garantiza que un desembolso multifondo o un pago se
registren completos o no se registren (todo o nada). En microservicios eso exige patrones
complejos (sagas, compensaciones) que aumentan el riesgo justo donde no se puede fallar.

### 6.2 ¿Por qué no una arquitectura serverless por función?

Porque el sistema tiene reglas de negocio entrelazadas (un pago toca préstamo, fondos,
mora, estados y recibos en una sola transacción). Fragmentar eso en funciones stateless
complica la atomicidad y el rendimiento en frío, sin beneficio para 4–8 usuarios.

### 6.3 ¿Por qué Django + DRF?

- **Madurez y seguridad:** ORM, autenticación, migraciones y protección contra ataques
  comunes vienen resueltos.
- **Transacciones y bloqueo pesimista:** `transaction.atomic()` y `select_for_update()`
  evitan sobregiros en fondos y desfases contables.
- **Precisión decimal:** `DecimalField` con `NUMERIC(14,2)` y `NUMERIC(5,4)` elimina los
  errores de coma flotante.
- **Velocidad de desarrollo:** un solo desarrollador puede sostener el sistema completo.

### 6.4 ¿Por qué Preact?

- API compatible con React, pero **mucho más liviano** (~3 KB), ideal para dispositivos
  modestos y redes móviles.
- Compilación rápida con Vite y tipado con TypeScript.
- Empaquetable con Capacitor para Android sin reescribir la interfaz.

### 6.5 ¿Por qué SQLite en desarrollo y PostgreSQL en producción?

- **SQLite:** cero configuración, pruebas rápidas y reproducibles.
- **PostgreSQL:** concurrencia, integridad y respaldo en producción.
- El ORM abstrae la diferencia; las migraciones son las mismas.

### 6.6 ¿Por qué PDF/A-2b con motor enchufable?

El pagaré es un **título valor** y debe conservarse a largo plazo. PDF/A-2b es el estándar
de preservación digital. WeasyPrint lo genera, pero depende de librerías nativas (Pango y
Cairo) que no siempre existen. Por eso el sistema usa un **motor enchufable**:

- Con WeasyPrint → PDF/A-2b conforme (producción Linux/Docker).
- Sin WeasyPrint → xhtml2pdf (PDF 1.4) y **HTML imprimible** como respaldo.

Así el cobrador **nunca se queda sin documento**, aunque el entorno no soporte PDF/A.

---

## 7. Decisiones de arquitectura (resumen tipo ADR)

| # | Decisión | Motivo |
| --- | --- | --- |
| 1 | Monolito modular | Pocos usuarios, un equipo, consistencia fuerte, bajo costo. |
| 2 | SPA desacoplada | Reutilización web/móvil y separación de responsabilidades. |
| 3 | Capa de servicios de dominio | Reglas legales centralizadas, testeables y extraíbles. |
| 4 | Transacciones ACID + bloqueo pesimista | Evitar sobregiros y desfases contables. |
| 5 | Decimal en todo el flujo financiero | Eliminar errores de redondeo. |
| 6 | JWT + RBAC | Seguridad sin sesiones de servidor, roles claros. |
| 7 | PDF/A con fallback | Cumplimiento legal con resiliencia operativa. |
| 8 | Capacitor | Móvil Android sin duplicar el frontend. |
| 9 | SQLite dev / PostgreSQL prod | Rapidez de desarrollo sin sacrificar producción. |

---

## 8. ¿Qué pasa si el sistema crece?

El diseño modular permite una evolución ordenada **sin reescribir**:

1. **Crecimiento moderado (decenas de usuarios):** escalar verticalmente el servicio y
   añadir caché para reportes. El monolito sigue siendo adecuado.
2. **Crecimiento por dominio (p. ej. cobranza móvil masiva):** extraer el módulo de
   cobranza como servicio independiente, reutilizando su capa de servicios.
3. **Crecimiento de lectura (reportes pesados):** réplica de lectura de PostgreSQL.
4. **Crecimiento geográfico:** CDN para el frontend y balanceo del backend.

La regla es simple: **no distribuir antes de necesitarlo**. El costo de un microservicio
innecesario se paga todos los días; el de extraer un módulo cuando haga falta se paga una
sola vez.

---

## 9. Preguntas frecuentes (defensa)

**“¿Cuántas personas usarán el sistema?”**
Entre 4 y 8 (1 administrador, 2–5 cobradores y consultas familiares), con 1–3 usuarios
simultáneos. Por eso se eligió un monolito modular: es la arquitectura proporcionada al
tamaño real de la operación.

**“¿No es un monolito, entonces es una arquitectura pobre?”**
No. Es un **monolito modular**: dominios separados, capa de servicios y transacciones
fuertes. La calidad no la define el número de servicios, sino la separación de
responsabilidades y la mantenibilidad. Los microservicios son una herramienta para
organizaciones grandes, no un requisito de calidad.

**“¿Por qué no microservicios?”**
Porque añadirían complejidad operativa, latencia de red y consistencia eventual en un
dominio donde la atomicidad es obligatoria, sin resolver ningún problema real: no hay
miles de usuarios ni equipos independientes.

**“¿Soportará más usuarios si crece?”**
Sí. El monolito escala verticalmente y puede balancearse. Y si un módulo necesita escalar
solo, su capa de servicios ya está aislada para extraerlo.

**“¿Por qué no todo en la nube con servicios gestionados?”**
Se puede desplegar en la nube (Render/Vercel) sin cambiar la arquitectura. La nube es
infraestructura, no arquitectura; el monolito modular sigue siendo válido allí.

**“¿Cómo garantizan que no se pierdan datos en un pago?”**
Con `transaction.atomic()` y `select_for_update()`: el pago, la mora, la distribución y los
saldos se confirman juntos o se revierten juntos.

**“¿Cómo garantizan el cumplimiento legal?”**
Reglas codificadas y probadas: interés sobre saldo insoluto (Ley N.º 176), prelación
mora → interés → capital (Art. 3180), gracia de 4 días y pagaré en PDF/A.

**“¿Qué evidencia hay de que funciona?”**
Suite automatizada: **134 pruebas de backend** y **83 de frontend**, además del build de
producción verificado.

---

## 10. Evidencia técnica y calidad

| Indicador | Estado |
| --- | --- |
| Pruebas backend | 134 aprobadas |
| Pruebas frontend | 83 aprobadas |
| Build de producción | Correcto |
| Cobertura funcional | Originación, cobranza, mora, PDF, dashboard, reportes |
| Seguridad | JWT, RBAC y privacidad por rol |
| Despliegue | Vercel (frontend) + Render (backend) con HTTPS |

---

## 11. Glosario

- **Monolito modular:** una sola unidad desplegable, internamente dividida en módulos por
  dominio con límites claros.
- **SPA:** aplicación de una sola página; el navegador carga una vez y consume una API.
- **ACID:** atomicidad, consistencia, aislamiento y durabilidad de las transacciones.
- **Factor Pi:** proporción de capital que aporta cada fondo a un préstamo.
- **Prelación:** orden legal de imputación de un pago.
- **Anatocismo:** cobro de intereses sobre intereses; prohibido por la Ley N.º 176.
- **PDF/A:** estándar ISO de preservación digital de documentos.
- **RBAC:** control de acceso basado en roles.

---

## 12. Cierre

CAVI demuestra que una arquitectura **sencilla, coherente y bien separada** puede resolver
un problema financiero real con garantías legales, sin la complejidad de un sistema
distribuido. La elección del monolito modular responde a un análisis explícito de usuarios
(4–8), carga (baja), equipo (uno) y dominio (consistencia crítica). Es una decisión de
ingeniería, no una limitación: la arquitectura correcta es la que resuelve el problema con
el menor costo total, y para CAVI esa arquitectura es el monolito modular.

---

*Documento vivo. Si cambian los supuestos de usuarios, volumen o equipo, este documento
debe actualizarse junto con la arquitectura.*
