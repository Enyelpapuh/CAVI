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
│   ├── models.py      # Usuario (AbstractBaseUser), Cliente
│   ├── serializers.py # UsuarioSerializer, ClienteSerializer, Login
│   ├── views.py       # UsuarioViewSet, ClienteViewSet, JWT views
│   ├── urls.py        # Router DRF + auth endpoints
│   └── migrations/
│       └── 0001_initial.py
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

### Endpoints Disponibles
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
INDEX idx_clientes_cedula (cedula)
INDEX idx_clientes_nombre (nombres, apellidos)
```

### Credenciales de Prueba
- **Admin:** admin@cavi.local / admin123 (rol: ADMINISTRADOR)
- **Usuario cobranza:** crear via POST /api/usuarios/ con rol COBRANZA

---

## Verificación Funcional (2026-09-22)

### Backend API Tests
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

## Próximos Pasos (Sprint 1)

1. **CAVI-TK08:** Modelo relacional Fondos + Movimientos
2. **CAVI-TK09:** Endpoints depósitos/retiros/inyecciones
3. **CAVI-TK10:** Lógica cálculo proporción Pi
4. **CAVI-TK11:** Transacción atómica desembolso multifondo
5. **CAVI-TK12:** Frontend módulo administración fondos
6. **CAVI-TK13:** Formulario creación préstamos selector multifondo
7. **CAVI-TK14:** Pruebas unitarias fondos/desembolsos

---

## Notas Técnicas

- **Monetarios:** Usar `DecimalField(max_digits=14, decimal_places=2)` en modelos futuros (fondos, préstamos, pagos)
- **PostgreSQL:** Cambiar DATABASES en settings.py y .env para producción
- **CORS:** Configurado para http://localhost:5173 (Vite default)
- **Zona horaria:** America/Managua (UTC-6)
- **Idioma:** es-ni (español Nicaragua)
- **Bundle size:** 86 KB JS + 13 KB CSS (gzipped) - bien bajo el límite 200 KB