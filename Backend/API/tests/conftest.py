import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from API.models import Cliente, Fondo


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    Usuario = get_user_model()
    return Usuario.objects.create_user(
        correo='test@cavi.local',
        nombre_completo='Test Admin',
        password='test12345',
        rol='ADMINISTRADOR',
    )


@pytest.fixture
def auth_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def cliente(db):
    return Cliente.objects.create(
        cedula='001-111222-3',
        nombres='Juan',
        apellidos='Perez',
        telefono='8888-8888',
        direccion='Managua, Nicaragua',
        actividad_economica='Comercio',
    )


@pytest.fixture
def crear_fondo(db):
    def _crear(nombre='Fondo Principal', familiar='Familiar 1', capital='50000.00'):
        return Fondo.objects.create(
            nombre=nombre,
            familiar=familiar,
            capital_inicial=capital,
            saldo_disponible=capital,
            ganancias_acumuladas='0.00',
        )
    return _crear