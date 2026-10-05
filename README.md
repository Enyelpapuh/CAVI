# CAVI - Control, Administración y Vinculación de Inversiones Crediticias

## 📖 Descripción General
**CAVI** es un sistema web especializado en la administración de micropréstamos independientes operados bajo un modelo de multifondos familiares en Nicaragua. El sistema garantiza precisión financiera, cumplimiento de normativas locales (Ley 176) y control estricto sobre los desembolsos, cobros y distribución de ganancias.

## 🛠️ Stack Tecnológico

### Backend
- **Framework:** Python con Django (versión 5.2) y Django REST Framework (DRF).
- **Autenticación:** JWT (JSON Web Tokens) con Control de Acceso Basado en Roles (RBAC: ADMINISTRADOR y COBRANZA).
- **Base de Datos:** SQLite (Desarrollo) / PostgreSQL (Producción).
- **Lógica Financiera:** Uso estricto de tipos `Decimal` (Python) y `NUMERIC(14,2)` / `NUMERIC(5,4)` (SQL) para precisión absoluta sin redondeos de coma flotante.

### Frontend
- **Framework:** Preact + Vite.
- **Estilos:** Tailwind CSS con diseño basado en Material Design 3 (UI ultra-ligera optimizada para dispositivos móviles).
- **Arquitectura UI:** Modular con manejo de estado global (AuthContext), y componentes interactivos como KPI Tiles, Modales y DataTables.

### Móvil y Herramientas Adicionales
- **Empaquetado Android:** Capacitor para la generación de archivos `.apk`.
- **Documentación Legal:** WeasyPrint para la generación de pagarés a la orden en formato PDF/A.

## 💼 Reglas de Negocio Clave
1. **Regla 50/50:** De los intereses cobrados, el 50% se asigna por administración y el otro 50% se distribuye entre los fondos participantes de manera proporcional a su aporte ($P_i$).
2. **Ley 176 (Nicaragua):** Cálculo de intereses estrictamente sobre el saldo restante insoluto. Prohibición de anatocismo.
3. **Mora y Tolerancia:** 4 días de gracia antes de entrar en mora automática al 5to día.
4. **Transaccionalidad Atómica:** Toda operación que afecte múltiples fondos (desembolsos multifondo) respeta el principio de atomicidad (ACID) con validación estricta de saldos disponibles.

## 🚀 Progreso del Desarrollo (Por Sprints)
- **Sprint 0:** Infraestructura Base + Padrón Clientes ✅
- **Sprint 1:** Gestión de Fondos Familiares + Desembolso Multifondo ✅
- **Sprint 2:** Motor de Amortización + Prelación de Cobros + Liquidación 50/50 ✅
- **Sprint 3:** Control de Mora + Generación de PDF Legal + Empaquetado Android ⏳ (En progreso)
- **Sprint 4:** Pruebas Técnicas + Despliegue en Nube + Validación Cualitativa ⏳ (Pendiente)

Para más detalles, consulta los documentos en el directorio `/docs`.

---

## 📂 Distribución del Proyecto (Estructura de Directorios)

### 🖥️ Backend (Django REST Framework)
La API RESTful está alojada en el directorio `/Backend`, con una estructura modularizada basada en aplicaciones Django:

```text
Backend/
├── CAVI_API/            # Configuración principal de Django (settings.py, urls.py root)
├── API/                 # Aplicación principal de lógica de negocio
│   ├── migrations/      # Historial de control de versiones de esquema de Base de Datos
│   ├── services/        # Lógica de dominio puro (Motores financieros, cálculos de mora, Ley 176)
│   ├── tests/           # Suite de pruebas unitarias y de integración (Pytest)
│   ├── models.py        # Definición de entidades ORM (Usuario, Cliente, Fondo, Prestamo, Pago)
│   ├── views.py         # Controladores (ViewSets) que exponen endpoints HTTP
│   ├── serializers.py   # Transformación de datos ORM a JSON y validaciones de entrada
│   ├── urls.py          # Enrutador local de endpoints
│   └── permissions.py   # Reglas de Acceso Basado en Roles (RBAC) para el sistema
├── requirements.txt     # Dependencias de Python (Django, DRF, PyJWT, WeasyPrint)
├── manage.py            # CLI manager de Django
└── .env                 # Variables de entorno (Credenciales, JWT Secret, DB URI)
```

### 🎨 Frontend (Preact + Vite + Tailwind CSS)
La interfaz de usuario tipo SPA (Single Page Application) reside en `/frontend`, usando arquitectura de componentes:

```text
frontend/
├── src/                 # Código fuente de la aplicación UI
│   ├── assets/          # Recursos estáticos (imágenes, iconos vectoriales, tipografías)
│   ├── components/      # Componentes UI reutilizables (Botones, Modales, Tablas de Datos)
│   ├── context/         # Estado Global React (ej. AuthContext para manejar sesión JWT y Rol)
│   ├── hooks/           # Custom Hooks para abstraer lógica de ciclo de vida de UI
│   ├── lib/             # Lógica utilitaria (cálculos financieros en frontend, utils estado)
│   ├── pages/           # Controladores de Vistas (DashboardPage, ClientesPage, FondosPage)
│   ├── services/        # Capa de integración con API externa (Peticiones Axios, Interceptors)
│   ├── types/           # Interfaces estrictas TypeScript alineadas al backend
│   ├── app.tsx          # Enrutador principal de la navegación
│   └── main.tsx         # Punto de montaje en el DOM del navegador
├── public/              # Archivos expuestos directamente al público y manifest
├── tailwind.config.js   # Tokens de diseño visual, colores corporativos y tipografía
├── vite.config.ts       # Configuración del empaquetador Vite (Proxy, Plugins)
└── package.json         # Registro de librerías y scripts de Node.js
```
