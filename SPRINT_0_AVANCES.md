# Sprint 0 - Avances de Desarrollo

**Proyecto:** CAVI - Sistema Web para Control de Préstamos  
**Sprint:** 0 - Infraestructura Base, Modelo Conceptual y Padrón de Clientes  
**Fecha inicio:** 2026-09-22  
**Stack:** Backend: Django 5.2 + DRF + JWT + SQLite | Frontend: Preact + Vite + Tailwind

---

## Resumen de Tareas

| Task | Descripción | Est. | Estado | % Avance | Observaciones | Fecha | Commits |
|------|-------------|------|--------|----------|---------------|-------|---------|
| CAVI-TK01 | Configuración entorno backend Django + conexión PostgreSQL/SQLite, variables de entorno, tipos monetarios NUMERIC(14,2) | 4h | ✅ Completado | 100% | Django 5.2.4, DRF, SimpleJWT, CORS, python-dotenv, psycopg2 instalados. Settings configurados con JWT, CORS, zona horaria America/Managua, idioma es-ni. Modelo Usuario personalizado (AUTH_USER_MODEL). | 2026-09-22 | - |
| CAVI-TK02 | Configuración migraciones automáticas + migración inicial esquema | 2h | ✅ Completado | 100% | Migraciones creadas y aplicadas: Usuario (rol enum ADMINISTRADOR/COBRANZA), Cliente (cedula unique, índices). DB SQLite funcionando. | 2026-09-22 | - |
| CAVI-TK03 | Autenticación JWT y Roles (RBAC) | 6h | ✅ Completado | 100% | Endpoints: POST /api/auth/login/, POST /api/auth/refresh/. Custom TokenObtainPairSerializer retorna user info + rol. Passwords con hash bcrypt (Django default). Middleware JWT + permisos por rol. | 2026-09-22 | - |
| CAVI-TK04 | API REST CRUD Clientes con validación cédula única | 5h | ✅ Completado | 100% | ViewSet Cliente: list/create/retrieve/update/destroy. Validación unique cedula en serializer (HTTP 400). Paginación PageNumberPagination (20/page). Búsqueda ?search= por nombre/apellido/cedula. | 2026-09-22 | - |
| CAVI-TK05 | Inicialización Frontend Preact + Vite + Tailwind | 3h | ✅ Completado | 100% | Preact + TypeScript + Vite + TailwindCSS 3 configurado. Proxy Vite a backend puerto 8000. Build optimizado (86 KB JS gzipped, 13 KB CSS). | 2026-09-22 | - |
| CAVI-TK06 | Interfaz Login + almacenamiento seguro token + redirect por rol | 4h | ✅ Completado | 100% | Vista Login responsiva. AuthContext con JWT en localStorage (access + refresh). Interceptor axios auto-refresh token. Redirect según rol (ADMINISTRADOR/COBRANZA). Protección rutas con ProtectedRoute. | 2026-09-22 | - |
| CAVI-TK07 | Pantalla registro/consulta clientes responsiva | 5h | ✅ Completado | 100% | ClientesPage: Tabla paginada con búsqueda en tiempo real (?search=). Modal formulario crear/editar con validación. Botón deshabilitar (soft delete). Responsive mobile-first. Conectado a /api/clientes/. | 2026-09-22 | - |

---

## Detalle Técnico Completado (TK01-TK07)

### Backend - Estructura
```
backend/
├── CAVI_API/          # Configuración proyecto
│   ├── settings.py    # JWT, CORS, zona horaria, custom user model
│   ├── urls.py        # Rutas principales + admin
│   └── wsgi/asgi.py
├── API/               # App principal
│   ├── models.py      # Usuario (AbstractBaseUser), Cliente, Fondo, MovimientoFondo, Prestamo, PrestamoFondoDetalle
│   ├── serializers.py # UsuarioSerializer, ClienteSerializer, Login, FondoSerializer, PrestamoSerializer
│   ├── views.py       # UsuarioViewSet, ClienteViewSet, FondoViewSet, PrestamoViewSet, JWT views
│   ├── urls.py        # Router DRF + auth endpoints
│   └── migrations/
│       ├── 0001_initial.py
│       └── 0002_fondo_movimientofondo_prestamo_prestamofondodetalle.py
├── manage.py
├── requirements.txt
├── .env               # Variables locales (gitignored)
└── .env.example       # Template
```

### Frontend - Estructura
```
frontend/
├── src/
│   ├── components/    # Layout, ProtectedRoute
│   ├── context/       # AuthContext (JWT + refresh)
│   ├── pages/         # LoginPage, ClientesPage
│   ├── services/      # api.ts (axios + interceptors)
│   ├── types/         # TypeScript interfaces
│   ├── App.tsx        # Router + AuthProvider
│   ├── main.tsx       # Entry point
│   └── index.css      # Tailwind directives
├── index.html
├── package.json
├── vite.config.ts     # Proxy /api -> localhost:8000
├── tailwind.config.js
├── tsconfig.json
└── .env               # VITE_API_URL
```

### Endpoints Disponibles (Sprint 0 + Sprint 1 Backend)

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| POST | /api/auth/login/ | Login JWT (retorna access + refresh + user) | No |
| POST | /api/auth/refresh/ | Renovar access token | No |
| GET | /api/usuarios/ | Listar usuarios | Sí (ADMIN) |
| POST | /api/usuarios/ | Crear usuario | Sí (ADMIN) |
| GET | /api/usuarios/me/ | Perfil usuario actual | Sí |
| GET | /api/clientes/ | Listar clientes (paginado, ?search=) | Sí |
| POST | /api/clientes/ | Crear cliente | Sí |
| GET | /api/clientes/{id}/ | Detalle cliente | Sí |
| PUT/PATCH | /api/clientes/{id}/ | Actualizar cliente | Sí |
| DELETE | /api/clientes/{id}/ | Deshabilitar cliente | Sí |
| GET | /api/fondos/ | Listar fondos activos (paginado, ?search=) | Sí |
| POST | /api/fondos/ | Crear fondo (capital_inicial → INYECCION inicial) | Sí |
| GET | /api/fondos/{id}/ | Detalle + movimientos + capital_colocado + rentabilidad | Sí |
| POST | /api/fondos/{id}/inyeccion/ | Inyección adicional capital | Sí |
| POST | /api/fondos/{id}/retiro/ | Retiro capital (valida saldo) | Sí |
| GET | /api/fondos/{id}/movimientos/ | Historial paginado movimientos | Sí |
| GET | /api/prestamos/ | Listar préstamos (paginado, ?search=, ?estado=) | Sí |
| POST | /api/prestamos/ | Crear préstamo multifondo (transacción atómica) | Sí |
| GET | /api/prestamos/{id}/ | Detalle + fondos_detalle + total_aportado + suma_pi | Sí |

### Modelo de Datos (aplicado en SQLite)
```sql
-- usuarios
id BIGSERIAL PK, nombre_completo VARCHAR(120), correo VARCHAR(120) UNIQUE,
password_hash VARCHAR(255), rol VARCHAR(20) CHECK IN ('ADMINISTRADOR','COBRANZA'),
activo BOOLEAN, creado_en TIMESTAMPTZ, actualizado_en TIMESTAMPTZ, ultimo_login TIMESTAMPTZ

-- clientes
id BIGSERIAL PK, cedula VARCHAR(20) UNIQUE, nombres VARCHAR(100), apellidos VARCHAR(100),
telefono VARCHAR(20), direccion TEXT, actividad_economica VARCHAR(120),
activo BOOLEAN, creado_en TIMESTAMPTZ, actualizado_en TIMESTAMPTZ
INDEX idx_clientes_cedula (cedula), INDEX idx_clientes_nombre (nombres, apellidos)

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

### Credenciales de Prueba
- **Admin:** admin@cavi.local / admin123 (rol: ADMINISTRADOR)
- **Usuario cobranza:** crear via POST /api/usuarios/ con rol COBRANZA

---

## Verificación Funcional (2026-09-22 a 2026-09-23)

### Backend API Tests - Sprint 0
```bash
# Login
curl -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"correo":"admin@cavi.local","password":"admin123"}'
# ✅ Retorna access, refresh, user {id, nombre_completo, correo, rol}

# Listar clientes (con token)
curl -X GET http://localhost:8000/api/clientes/ \
  -H "Authorization: Bearer <access_token>"
# ✅ Retorna {count, next, previous, results: []}

# Crear cliente
curl -X POST http://localhost:8000/api/clientes/ \
  -H "Authorization: Bearer <access_token>" \
  -d '{"cedula":"001-123456-7","nombres":"Juan","apellidos":"Perez",...}'
# ✅ 201 Created con cliente creado

# Duplicado cédula
curl -X POST ... (misma cédula)
# ✅ 400 Bad Request: {"cedula":["Ya existe cliente con este cédula."]}
```

### Backend API Tests - Sprint 1 (TK08-TK11)
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

### Frontend Tests
- ✅ `npm run build` exitoso (dist/ generado)
- ✅ `npm run dev` levanta en http://localhost:5173
- ✅ Login con admin@cavi.local / admin123 redirige a /clientes
- ✅ Tabla clientes muestra datos, búsqueda funciona
- ✅ Modal "Nuevo Cliente" crea registro via API
- ✅ Validación cédula duplicada muestra error en UI
- ✅ Editar/Deshabilitar funcionan
- ✅ Logout limpia localStorage y redirige a /login

---

## Próximos Pasos (Sprint 1 - Frontend + Tests)

1. **CAVI-TK12:** Frontend FondosPage - tarjetas + modales inyección/retiro
2. **CAVI-TK13:** Frontend PrestamoFormPage - selector multifondo con Pi en vivo
3. **CAVI-TK14:** Tests pytest (fondos, retiros, desembolso multifondo, rollback) + vitest

---

## Notas Técnicas

- **Monetarios:** Usar `DecimalField(max_digits=14, decimal_places=2)` en modelos futuros (fondos, préstamos, pagos)
- **PostgreSQL:** Cambiar DATABASES en settings.py y .env para producción
- **CORS:** Configurado para http://localhost:5173 (Vite default)
- **Zona horaria:** America/Managua (UTC-6)
- **Idioma:** es-ni (español Nicaragua)
- **Bundle size:** 86 KB JS + 13 KB CSS (gzipped) - bien bajo el límite 200 KB
- **Precisión Pi:** `Decimal` con 4 decimales, validación suma = 1.0000 ± 0.0001
- **Transacciones:** `@transaction.atomic` + `refresh_from_db()` para concurrencia
- **Checks BD:** `saldo_disponible >= 0` a nivel base de datos (CHECK constraint)