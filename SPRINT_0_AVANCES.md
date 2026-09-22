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
| CAVI-TK05 | Inicialización Frontend Preact + Vite + Tailwind | 3h | 🔄 Pendiente | 0% | - | - | - |
| CAVI-TK06 | Interfaz Login + almacenamiento seguro token + redirect por rol | 4h | 🔄 Pendiente | 0% | - | - | - |
| CAVI-TK07 | Pantalla registro/consulta clientes responsiva | 5h | 🔄 Pendiente | 0% | - | - | - |

---

## Detalle Técnico Completado (TK01-TK04)

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

## Próximos Pasos (TK05-TK07)

1. **TK05:** `cd frontend && npm create vite@latest . -- --template preact-ts && npm install && npm install -D tailwindcss postcss autoprefixer && npx tailwindcss init -p`
2. **TK06:** Vista Login, httpOnly cookie o localStorage seguro, decode JWT para redirect
3. **TK07:** Formulario Cliente + Tabla con búsqueda, conectar a /api/clientes/

---

## Notas Técnicas

- **Monetarios:** Usar `DecimalField(max_digits=14, decimal_places=2)` en modelos futuros (fondos, préstamos, pagos)
- **PostgreSQL:** Cambiar DATABASES en settings.py y .env para producción
- **CORS:** Configurado para http://localhost:5173 (Vite default)
- **Zona horaria:** America/Managua (UTC-6)
- **Idioma:** es-ni (español Nicaragua)