# CAVI - Control, Administracion y Vinculacion de Inversiones Crediticias

## 1. Descripcion General

CAVI es una plataforma web y movil disenada para la administracion integral de microprestamos independientes operados bajo un modelo de multifondos de capital familiar en Nicaragua. 

El sistema digitaliza y automatiza el ciclo de vida del credito: originacion multifondo, calculo matematico de cuotas sobre saldo restante (Ley N° 176), imputacion de cobros con prelacion legal estricta (Art. 3180 del Codigo Civil), distribucion de rendimientos 50/50, evaluacion de periodos de gracia y emision de pagares a la orden en formato de preservacion digital PDF/A-2b.

---

## 2. Stack Tecnologico

### Backend (Servicios RESTful API)
- Framework: Python con Django (5.2) y Django REST Framework (DRF).
- Autenticacion: JSON Web Tokens (SimpleJWT) con control de acceso basado en roles (RBAC: ADMINISTRADOR y COBRANZA).
- Base de Datos: SQLite3 para desarrollo local y pruebas unitarias; PostgreSQL 16 para entornos de produccion.
- Precision Numerica: Manejo estricto de tipos Decimal de Python y campos NUMERIC(14,2) / NUMERIC(5,4) en base de datos para eliminar descuadres por redondeo de coma flotante.
- Documentacion Legal: Generacion de titulos ejecutivos y pagares en estandar PDF/A-2b con WeasyPrint (requiere librerias del sistema Cairo y Pango).
- Servidor de Produccion: Gunicorn WSGI con 2 a 4 workers asincronos y WhiteNoise para la distribucion de archivos estaticos.

### Frontend (Cliente Web SPA)
- Framework: Preact 10 con TypeScript y empaquetador Vite.
- Estilos: Tailwind CSS implementado bajo lineamientos de Material Design 3.
- Fuentes e Iconos: Tipografia Inter y glifos Material Symbols autohospedados localmente (sin dependencias de CDN externas).
- Arquitectura UI: Modulos desacoplados, componentes de alta densidad informativa (KPI Tiles, DataTables paginadas, modales de prelacion en vivo) y contexto de autenticacion global (AuthContext).

### Aplicacion Movil
- Empaquetado Hibrido: Capacitor para la distribucion de archivos ejecutables Android (.apk).

---

## 3. Marco Normativo y Reglas de Negocio Clave

1. Regla 50/50 de Intereses: Del interes mensual cobrado en cada cuota o abono, el 50% se asigna a la administracion del sistema y el 50% restante se distribuye entre los fondos participantes en proporcion directa a su aporte de capital (factor Pi).
2. Ley N° 176 (Prestamos entre Particulares de Nicaragua): Calculo de intereses ordinarios estrictamente sobre el saldo restante insoluto. Queda prohibido el anatocismo (cobro de intereses sobre intereses vencidos o capitalizacion de intereses).
3. Articulo 3180 del Codigo Civil de Nicaragua (Prelacion Forzosa de Imputacion): Todo abono realizado por el prestatario se imputa en orden riguroso:
   - Primer orden: Recargo por mora devengado.
   - Segundo orden: Intereses corrientes adeudados.
   - Tercer orden: Reduccion del capital principal insoluto.
4. Politica de Tolerancia y Mora: Margen de 4 dias de gracia tras la fecha de corte. Al quinto dia sin pago, el credito entra en mora automatica y devenga recargos diarios segun la tasa configurada.
5. Transaccionalidad ACID y Bloqueo Pesimista: Todas las operaciones de desembolso multifondo y amortizacion se encapsulan en transacciones atomicas de base de datos (`transaction.atomic()`) con bloqueo pesimista de fila (`select_for_update()`), evitando sobregiros en bolsas o desfases contables.

---

## 4. Configuracion de Variables de Entorno y Claves Secretas

El sistema requiere configuraciones independientes para el Backend y el Frontend mediante archivos `.env`.

### 4.1. Backend (`Backend/.env`)
Crea el archivo `Backend/.env` copiando la plantilla `Backend/.env.example`:

```bash
cp Backend/.env.example Backend/.env
```

Parametros de configuracion:

| Variable | Tipo / Ejemplo | Descripcion |
| :--- | :--- | :--- |
| `DJANGO_SECRET_KEY` | `str` (hash de 50+ caracteres) | Clave criptografica utilizada por Django y SimpleJWT para firmar sesiones y tokens. |
| `DEBUG` | `True` o `False` | `True` en desarrollo local; obligatoriamente `False` en entornos de produccion. |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1,.onrender.com` | Nombres de dominio e IPs autorizadas para recibir solicitudes HTTP. |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | Cadena de conexion a PostgreSQL. Si se deja vacia, Django usa SQLite automaticamente. |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,https://cavi.vercel.app` | URLs del frontend autorizadas para realizar peticiones HTTP a la API. |
| `CORS_ALLOW_ALL_ORIGINS` | `False` | Habilita orígenes abiertos. Usar solo en pruebas tempranas. |
| `TASA_MAXIMA_LEGAL` | `0.0300` | Tasa mensual maxima fijada por el Banco Central de Nicaragua (3% mensual). |

Para generar una clave secreta segura desde la terminal:
```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

### 4.2. Frontend (`frontend/.env`)
Crea el archivo `frontend/.env` copiando la plantilla `frontend/.env.example`:

```bash
cp frontend/.env.example frontend/.env
```

Parametros de configuracion:

| Variable | Tipo / Ejemplo | Descripcion |
| :--- | :--- | :--- |
| `VITE_API_URL` | `http://localhost:8000/api` | Endpoint base del API RESTful consumido por el cliente web. |

En produccion con Vercel, esta variable debe apuntar a la URL publica del backend en Render (ej. `https://cavi-backend.onrender.com/api`).

---

## 5. Instalacion y Ejecucion en Desarrollo Local

### Requisitos Previos
- Python 3.12 o superior.
- Node.js 20 o superior y npm.
- (Opcional en Windows para pagarés WeasyPrint nativos) GTK3-Runtime. Si no se dispone de GTK, el sistema utiliza xhtml2pdf como respaldo automatico.

### 5.1. Puesta en Marcha del Backend
1. Navegar al directorio del backend:
   ```bash
   cd Backend
   ```
2. Crear y activar un entorno virtual:
   ```bash
   python -m venv venv
   # En Windows:
   .\venv\Scripts\activate
   # En Linux / macOS:
   source venv/bin/activate
   ```
3. Instalar las dependencias de Python:
   ```bash
   pip install -r requirements.txt
   ```
4. Configurar variables de entorno iniciales:
   ```bash
   cp .env.example .env
   ```
5. Aplicar las migraciones a la base de datos:
   ```bash
   python manage.py migrate
   ```
6. (Opcional) Crear una cuenta de administrador inicial:
   ```bash
   python manage.py createsuperuser
   ```
7. Iniciar el servidor de desarrollo:
   ```bash
   python manage.py runserver
   ```
   La API quedara disponible en: `http://localhost:8000/api/`

### 5.2. Puesta en Marcha del Frontend
1. Navegar al directorio del frontend en una nueva terminal:
   ```bash
   cd frontend
   ```
2. Instalar los paquetes de Node:
   ```bash
   npm install
   ```
3. Configurar variables de entorno:
   ```bash
   cp .env.example .env
   ```
4. Iniciar el servidor de desarrollo Vite:
   ```bash
   npm run dev
   ```
   El cliente web quedara accesible en: `http://localhost:5173/`

### 5.3. Ejecucion de Pruebas Automatizadas
- Pruebas del Backend (Pytest):
  ```bash
  cd Backend
  pytest
  ```
- Pruebas del Frontend (Vitest):
  ```bash
  cd frontend
  npm test
  ```

---

## 6. Guia de Despliegue en Produccion (Opcion A: Vercel + Render + Neon)

Esta arquitectura desacoplada garantiza compatibilidad absoluta con WeasyPrint en contenedores Linux y distribucion CDN global a costo cero ($0.00 USD/mes).

```
[ Frontend: Vercel (SPA) ] ---> HTTPS / JWT ---> [ Backend: Render (Docker) ] ---> SSL ---> [ DB: Neon (PostgreSQL 16) ]
```

### Paso 1: Base de Datos PostgreSQL Gestionada (Neon.tech)
1. Registrate de forma gratuita en Neon.tech (o Supabase).
2. Crea un proyecto llamado `cavi-production` en la region US East.
3. Copia la cadena de conexion con pooling y SSL (`DATABASE_URL`):
   ```text
   postgresql://usuario:password@ep-xyz.us-east-2.aws.neon.tech/cavi_db?sslmode=require
   ```

### Paso 2: Despliegue del Backend en Render (Web Service con Docker)
El repositorio incluye un `Backend/Dockerfile` que instala de manera nativa las librerias `libcairo2` y `libpango-1.0-0` necesarias para WeasyPrint.

1. Inicia sesion en Render.com con tu cuenta de GitHub.
2. Crea un nuevo **Web Service** y conecta el repositorio `CAVI`.
3. Establece los siguientes parametros de construccion:
   - Name: `cavi-backend`
   - Region: `US East`
   - Language / Environment: `Docker`
   - Root Directory: `Backend`
   - Dockerfile Path: `Dockerfile`
   - Instance Type: `Free`
4. En la seccion **Environment Variables**, registra:
   - `DJANGO_SECRET_KEY`: Tu clave secreta aleatoria de 50 caracteres.
   - `DEBUG`: `False`
   - `ALLOWED_HOSTS`: `.onrender.com,localhost`
   - `DATABASE_URL`: La URL copiada de Neon.tech.
   - `CORS_ALLOW_ALL_ORIGINS`: `True` (o la URL de tu frontend en Vercel).
5. Haz clic en **Create Web Service**. Render compilara el contenedor, ejecutara `migrate` e iniciara Gunicorn en:
   ```text
   https://cavi-backend.onrender.com
   ```

### Paso 3: Despliegue del Frontend en Vercel (Edge CDN)
El frontend cuenta con `frontend/vercel.json` configurado para manejar el enrutamiento SPA sin errores 404 al recargar paginas.

1. Inicia sesion en Vercel.com con tu cuenta de GitHub.
2. Agrega un nuevo proyecto seleccionando el repositorio `CAVI`.
3. Configura los parametros del proyecto:
   - Framework Preset: `Vite`
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. En **Environment Variables**, agrega:
   - `VITE_API_URL` = `https://cavi-backend.onrender.com/api`
5. Haz clic en **Deploy**. La aplicacion estara operativa en segundos en:
   ```text
   https://cavi-app.vercel.app
   ```

---

## 7. Estructura del Repositorio

```text
CAVI/
├── Backend/
│   ├── API/                   # Logica de negocio y servicios de dominio
│   │   ├── migrations/        # Historial de migraciones del esquema relacional
│   │   ├── services/          # Motores matematicos: amortizacion, mora, legal y pagos
│   │   ├── tests/             # Bateria de pruebas de integracion y unitarias
│   │   ├── models.py          # Entidades ORM: Usuario, Cliente, Fondo, Prestamo, Pago
│   │   ├── serializers.py     # Validacion y transformacion de datos DRF
│   │   ├── views.py           # Controladores ViewSets de la API REST
│   │   └── urls.py            # Enrutamiento local de endpoints
│   ├── CAVI_API/              # Configuracion central de Django (settings.py, wsgi.py)
│   ├── .dockerignore          # Exclusion de archivos temporales de imagen Docker
│   ├── .env.example           # Plantilla de variables de entorno del backend
│   ├── Dockerfile             # Definicion de contenedor Docker con WeasyPrint y Gunicorn
│   ├── manage.py              # Gestor de comandos de Django
│   ├── pytest.ini             # Configuracion de ejecucion de pruebas Pytest
│   └── requirements.txt       # Dependencias de Python para produccion y desarrollo
├── frontend/
│   ├── public/                # Manifiesto y recursos publicos
│   ├── src/
│   │   ├── components/        # Componentes UI reutilizables (layout, tablas, modales)
│   │   ├── context/           # Estado global de sesion y autenticacion (AuthContext)
│   │   ├── lib/               # Utilidades financieras y validacion de cedula nicaraguense
│   │   ├── pages/             # Vistas de la aplicacion (Dashboard, Clientes, Cobros, etc.)
│   │   ├── services/          # Cliente HTTP Axios y contratos de peticiones hacia la API
│   │   ├── types/             # Definiciones e interfaces TypeScript
│   │   ├── app.tsx            # Enrutador principal de navegacion
│   │   └── main.tsx           # Punto de entrada de la aplicacion Preact
│   ├── .env.example           # Plantilla de variables de entorno del frontend
│   ├── package.json           # Dependencias y scripts de Node.js
│   ├── tailwind.config.js     # Configuracion de tokens de diseno y colores
│   ├── vercel.json            # Reglas de reescritura de rutas para despliegue en Vercel
│   └── vite.config.ts         # Configuracion del empaquetador Vite y proxy local
├── docs/                      # Documentacion de diseno, auditorias y entregables ISO
└── README.md                  # Manual central y documentacion del proyecto
```

---

## 8. Estado del Proyecto por Sprints

- Sprint 0: Infraestructura base, migraciones relacionales, autenticacion JWT y catalogo de clientes (Completado).
- Sprint 1: Cartera de fondos familiares, calculo de factor Pi y desembolso multifondo con transacciones ACID (Completado).
- Sprint 2: Motor financiero sobre saldo (Ley 176), imputacion de cobros con prelacion Art. 3180 y liquidacion 50/50 (Completado).
- Sprint 3: Control de periodos de gracia, calculo supletorio de mora, generacion de pagares en PDF/A-2b y wizard interactivo de prestamos (Completado).
- Sprint 4: Evaluacion de normalizacion 3NF de bases de datos, despliegue en nube (Vercel + Render) y pruebas de resiliencia (En progreso).
