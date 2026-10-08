# Sección III: Modelado Estructural en UML

En esta sección se define y formaliza el modelo conceptual e interno del sistema CAVI, identificando las clases de análisis organizadas por estereotipos, las relaciones entre las entidades que conforman la lógica de negocio y un diccionario funcional detallado.

---

## 1. Arquitectura de Clases y Estereotipos

El patrón arquitectónico de CAVI se divide funcionalmente en tres niveles de análisis según el patrón Modelo-Vista-Controlador (MVC / API-Rest). A continuación, se clasifican las clases identificadas:

### A. Clases de Frontera / Interfaz (Boundary)
Manejan la interacción directa con el usuario final (vistas de Preact).
* **UI_Login:** Pantalla de autenticación y acceso.
* **UI_Dashboard:** Panel principal de KPIs, agenda de cobros y métricas globales.
* **UI_Clientes:** Gestión del padrón de prestatarios.
* **UI_Fondos:** Administración de bolsas de inversión, inyecciones y retiros.
* **UI_Prestamos:** Formulario dinámico de desembolsos multifondo y simulador de cuotas.
* **UI_Cobros:** Terminal de asentamiento de pagos y desglose de prelación (mora, interés, capital).

### B. Clases de Control (Control)
Orquestan la lógica de negocio, reglas financieras y transacciones atómicas (ViewSets y Services en Django).
* **AuthService:** Emisión, validación y expiración de tokens JWT.
* **ClienteController:** Validación de cédula única y formato de información del usuario.
* **FondoController:** Validaciones de transacciones de caja, inyecciones, retiros y actualización de saldos disponibles.
* **PrestamoController:** Transacciones atómicas de desembolso, validación de participación ($P_i$) de multifondos y generación de cuotas de amortización.
* **CobroController:** Lógica del motor financiero (Ley 176), prelación de cobros y cálculo de distribución de ganancias 50/50.
* **MoraService:** Job de verificación de 4 días de gracia y semaforización de atrasos.

### C. Clases de Entidad (Entity)
Estructuras persistentes de la base de datos (Modelos de Django) que almacenan la información del sistema.
* **Usuario:** Operadores del sistema (roles: ADMINISTRADOR, COBRANZA).
* **Cliente:** Perfil de prestatarios.
* **Fondo:** Bolsa de inversión familiar.
* **MovimientoFondo:** Registro inmutable del historial financiero de un fondo.
* **Prestamo:** Encabezado del crédito otorgado.
* **PrestamoFondoDetalle:** Tabla pivote con la participación y porcentaje ($P_i$) de los fondos en un préstamo.
* **Pago:** Transacción de abono.
* **PagoDistribucionFondo:** Tabla de liquidación y distribución de retornos y ganancias 50/50.

---

## 2. Diagrama de Clases del Sistema

A continuación se presenta el diagrama de clases en formato UML, definiendo atributos principales, operaciones y sus relaciones de cardinalidad, asociación y agregación.

```mermaid
classDiagram
    class Usuario {
        -BigInt id
        -String username
        -String password
        -String rol
        +autenticar() boolean
        +obtener_permisos() list
    }

    class Cliente {
        -BigInt id
        -String cedula
        -String nombres
        -String apellidos
        -String telefono
        -String direccion
        -Date creado_en
        +obtener_historial_credito()
    }

    class Fondo {
        -BigInt id
        -String nombre
        -String familiar
        -Numeric saldo_disponible
        -Numeric capital_inicial
        -Numeric ganancias_acumuladas
        -Boolean activo
        +inyectar_capital(monto)
        +retirar_capital(monto)
        +registrar_ganancia(monto)
    }

    class MovimientoFondo {
        -BigInt id
        -String tipo
        -Numeric monto
        -Numeric saldo_anterior
        -Numeric saldo_posterior
        -String descripcion
        -Date creado_en
    }

    class Prestamo {
        -BigInt id
        -Numeric monto_principal
        -Numeric tasa_interes
        -Int plazo_meses
        -String periodicidad
        -Date fecha_desembolso
        -Date fecha_primer_corte
        -String estado
        +simular_amortizacion()
        +liquidar()
        +evaluar_mora()
    }

    class PrestamoFondoDetalle {
        -BigInt id
        -Numeric monto_aportado
        -Numeric porcentaje_pi
    }

    class Pago {
        -BigInt id
        -Date fecha_pago
        -Numeric monto_recibido
        -Numeric capital_pagado
        -Numeric interes_pagado
        -Numeric mora_pagada
        +procesar_prelacion()
        +generar_recibo()
    }

    class PagoDistribucionFondo {
        -BigInt id
        -Numeric monto_capital_recuperado
        -Numeric monto_ganancia_fondo
    }

    Usuario "1" --> "*" Pago : registra
    Cliente "1" -- "*" Prestamo : solicita
    Fondo "1" *-- "*" MovimientoFondo : registra
    Fondo "1" -- "*" PrestamoFondoDetalle : invierte_en
    Prestamo "1" *-- "*" PrestamoFondoDetalle : estructurado_por
    Prestamo "1" *-- "*" Pago : recibe
    Pago "1" *-- "*" PagoDistribucionFondo : distribuye_a
    Fondo "1" -- "*" PagoDistribucionFondo : recibe_rendimiento
```

---

## 3. Diccionario de Clases por Módulos

El presente diccionario desglosa el alcance, visibilidad y naturaleza de datos de las entidades del dominio de negocio.

### Módulo de Usuarios y Clientes
| Clase | Atributos (Visibilidad : Tipo) | Responsabilidad Funcional |
| :--- | :--- | :--- |
| **Usuario** | `- id : BigInt`<br>`- username : String`<br>`- password : String`<br>`- rol : Enum(ADMIN, COBRANZA)` | Gestión de acceso y seguridad RBAC. Define qué acciones puede realizar un operador en caja o configuración. |
| **Cliente** | `- id : BigInt`<br>`- cedula : String`<br>`- nombres : String`<br>`- apellidos : String`<br>`- telefono : String`<br>`- direccion : String`<br>`- creado_en : Date` | Entidad prestataria principal. Almacena la identidad y contacto, vinculándose unívocamente por su número de cédula nicaragüense. |

### Módulo de Gestión de Capitales
| Clase | Atributos (Visibilidad : Tipo) | Responsabilidad Funcional |
| :--- | :--- | :--- |
| **Fondo** | `- id : BigInt`<br>`- nombre : String`<br>`- familiar : String`<br>`- saldo_disponible : Numeric(14,2)`<br>`- capital_inicial : Numeric(14,2)`<br>`- ganancias_acumuladas : Numeric(14,2)`<br>`- activo : Boolean` | Abstracción de una bolsa de inversión. Restringe desembolsos superiores al `saldo_disponible`. Controla la rentabilidad histórica. |
| **MovimientoFondo** | `- id : BigInt`<br>`- tipo : Enum(INYECCION, RETIRO, DESEMBOLSO, GANANCIA)`<br>`- monto : Numeric(14,2)`<br>`- saldo_anterior : Numeric(14,2)`<br>`- saldo_posterior : Numeric(14,2)`<br>`- creado_en : Date` | Historial inmutable de auditoría (Ledger). Asegura rastreabilidad sobre el flujo de efectivo entrante y saliente del Fondo. |

### Módulo de Colocación y Cobranza
| Clase | Atributos (Visibilidad : Tipo) | Responsabilidad Funcional |
| :--- | :--- | :--- |
| **Prestamo** | `- id : BigInt`<br>`- monto_principal : Numeric(14,2)`<br>`- tasa_interes : Numeric(5,4)`<br>`- plazo_meses : Int`<br>`- periodicidad : Enum(MENSUAL, QUINCENAL)`<br>`- estado : Enum(VIGENTE, MORA, LIQUIDADO)` | Contenedor principal de deuda. Aplica Ley 176 para cálculo de interés sobre saldo y delega la partición a detalles. |
| **PrestamoFondoDetalle** | `- monto_aportado : Numeric(14,2)`<br>`- porcentaje_pi : Numeric(5,4)` | Representación matemática fraccionaria del aporte de un Fondo a un Préstamo. `porcentaje_pi` controla las distribuciones futuras. |
| **Pago** | `- monto_recibido : Numeric(14,2)`<br>`- capital_pagado : Numeric(14,2)`<br>`- interes_pagado : Numeric(14,2)`<br>`- mora_pagada : Numeric(14,2)` | Transacción de abono del Cliente. Su controlador aplica la prelación Art. 3180 (mora → interés → capital). |
| **PagoDistribucionFondo** | `- monto_capital_recuperado : Numeric(14,2)`<br>`- monto_ganancia_fondo : Numeric(14,2)` | Representa el "50%" final asignado a la familia. Se calcula como `(interes_pagado * 0.5) * porcentaje_pi`. |

---

## 4. Modelado Dinámico y Comportamental

En esta sección se modela el comportamiento dinámico del sistema para sus flujos más críticos, evidenciando las interacciones entre los componentes y la lógica algorítmica aplicada.

### A. Diagramas de Secuencia
Representación de las llamadas y el intercambio de mensajes en el tiempo para los casos de uso transaccionales clave.

#### Flujo 1: Desembolso Multifondo (Transacción Atómica)
Este diagrama ilustra cómo el sistema asegura el principio ACID cuando un préstamo es fondeado por múltiples bolsas familiares.

```mermaid
sequenceDiagram
    actor Admin
    participant UI as Frontend
    participant API as PrestamoViewSet
    participant DB as Base de Datos

    Admin->>UI: Configura préstamo y selecciona N fondos aportantes
    UI->>API: POST /api/prestamos/ (cliente, montos_aportados)
    activate API
    API->>DB: BEGIN TRANSACTION (transaction.atomic)
    activate DB
    loop Por cada fondo aportante
        API->>DB: SELECT FOR UPDATE (Bloqueo concurrente)
        DB-->>API: Retorna Saldo Disponible Actual
        alt Saldo < Monto Aportado
            API->>DB: ROLLBACK TRANSACTION
            API-->>UI: 400 Bad Request (Fondos insuficientes)
            UI-->>Admin: Muestra error de validación
        else Saldo >= Monto Aportado
            API->>DB: UPDATE Fondo (Resta saldo_disponible)
            API->>DB: INSERT MovimientoFondo (Tipo: DESEMBOLSO)
        end
    end
    API->>DB: INSERT Prestamo (Cabecera)
    API->>DB: INSERT PrestamoFondoDetalle
    DB-->>API: COMMIT TRANSACTION
    deactivate DB
    API-->>UI: 201 Created (Préstamo generado)
    deactivate API
    UI-->>Admin: Redirección al detalle del crédito
```

#### Flujo 2: Asentamiento de Pago y Liquidación 50/50
Representación de la aplicación de la prelación (Ley 176) y la posterior distribución de dividendos hacia los fondos participantes.

```mermaid
sequenceDiagram
    actor Cobrador
    participant UI as Frontend
    participant API as PagoViewSet
    participant Motor as CobroService
    participant DB as Base de Datos

    Cobrador->>UI: Registra abono de un prestatario
    UI->>API: POST /api/pagos/ (prestamo_id, monto_recibido)
    activate API
    API->>Motor: procesar_pago(prestamo_id, monto_recibido)
    activate Motor
    Motor->>DB: Consulta saldo insoluto y evalúa mora
    Motor->>Motor: Aplica Prelación (1º Mora, 2º Interés, 3º Capital)
    Motor->>DB: INSERT Pago (Desglose de lo cobrado)
    loop Por cada PrestamoFondoDetalle (Participante)
        Motor->>Motor: Calcula cap_recuperado = capital * P_i
        Motor->>Motor: Calcula ganancia_fondo = (interes * 0.5) * P_i
        Motor->>DB: UPDATE Fondo (Suma capital recuperado + ganancia)
        Motor->>DB: INSERT PagoDistribucionFondo
        Motor->>DB: INSERT MovimientoFondo (INYECCION y GANANCIA)
    end
    Motor-->>API: Transacción completada y saldos actualizados
    deactivate Motor
    API-->>UI: 200 OK (Datos del recibo)
    deactivate API
    UI-->>Cobrador: Visualiza e imprime Recibo de Pago
```

### B. Diagrama de Actividades
Modelado del flujo de trabajo algorítmico y procedimental que rige el motor de cobranza del sistema, desde la evaluación de mora hasta el desembolso de ganancias.

#### Proceso: Evaluación de Mora y Distribución de Cobros
```mermaid
flowchart TD
    A([Inicio: Cliente realiza Pago]) --> B{¿Días de atraso?}
    
    B -- <= 0 días --> C[Estado: Al Día]
    B -- 1 a 4 días --> D[Estado: Período de Gracia]
    B -- > 4 días --> E[Estado: En Mora]

    C --> F[Cálculo de Interés Regular s/ Saldo Insoluto]
    D --> F
    E --> G[Cálculo de Interés Regular + Interés Moratorio]

    F --> H[Recepción del Monto del Cliente]
    G --> H

    H --> I[Aplicar Prelación de Cobro Art. 3180]
    I --> J[1º Cubrir Mora]
    J --> K[2º Cubrir Intereses]
    K --> L[3º Cubrir Capital]

    L --> M[Fase de Liquidación de Ganancias]
    M --> N[Retener 50% del Interés para Administración]
    M --> O[Asignar 50% de Interés + Capital a Fondos Familiares]
    
    O --> P{Distribución Proporcional al coeficiente Pi}
    P --> Q[Actualizar Saldos en Base de Datos]
    N --> Q
    
    Q --> R[Generar Recibo de Pago Digital]
    R --> S([Fin del Proceso])
```
