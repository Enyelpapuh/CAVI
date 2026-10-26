from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CustomTokenObtainPairView,
    CustomTokenRefreshView,
    UsuarioViewSet,
    ClienteViewSet,
    FondoViewSet,
    PrestamoViewSet,
    PagoViewSet,
    DashboardViewSet,
    ConfiguracionViewSet,
    CatalogoViewSet,
    PermisoViewSet,
    SesionCajaViewSet,
    AuditoriaViewSet,
)

router = DefaultRouter()
router.register(r'usuarios', UsuarioViewSet, basename='usuario')
router.register(r'clientes', ClienteViewSet, basename='cliente')
router.register(r'fondos', FondoViewSet, basename='fondo')
router.register(r'prestamos', PrestamoViewSet, basename='prestamo')
router.register(r'pagos', PagoViewSet, basename='pago')
router.register(r'dashboard', DashboardViewSet, basename='dashboard')
router.register(r'configuracion', ConfiguracionViewSet, basename='configuracion')
router.register(r'catalogos', CatalogoViewSet, basename='catalogo')
router.register(r'permisos', PermisoViewSet, basename='permiso')
router.register(r'cajas', SesionCajaViewSet, basename='caja')
router.register(r'auditoria', AuditoriaViewSet, basename='auditoria')

urlpatterns = [
    path('auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', CustomTokenRefreshView.as_view(), name='token_refresh'),
    path('', include(router.urls)),
]