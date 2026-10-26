import pytest
from API.models import Fondo, MovimientoFondo

pytestmark = pytest.mark.django_db

FONDO_URL = '/api/fondos/'


class TestCrearFondo:
    def test_crear_fondo_crea_inyeccion_inicial(self, auth_client):
        res = auth_client.post(FONDO_URL, {
            'nombre': 'Fondo Inversión',
            'familiar': 'Familia López',
            'capital_inicial': '25000.00',
        }, format='json')

        assert res.status_code == 201
        fondo = Fondo.objects.get(pk=res.data['id'])
        assert str(fondo.saldo_disponible) == '25000.00'
        mov = fondo.movimientos.first()
        assert mov.tipo == MovimientoFondo.TipoMovimiento.INYECCION
        assert str(mov.monto) == '25000.00'
        assert str(mov.saldo_anterior) == '0.00'
        assert str(mov.saldo_posterior) == '25000.00'

    def test_crear_fondo_sin_capital_inicial_es_error(self, auth_client):
        res = auth_client.post(FONDO_URL, {
            'nombre': 'Fondo Sin Capital',
            'familiar': 'Familia X',
        }, format='json')
        assert res.status_code == 400

    def test_crear_fondo_persona_natural(self, auth_client):
        res = auth_client.post(FONDO_URL, {
            'nombre': 'Bolsa Morales Familiar',
            'tipo_persona': 'NATURAL',
            'identificacion': '001-150490-0001A',
            'nombres_titular': 'Roberto',
            'apellidos_titular': 'Morales Gómez',
            'telefono_contacto': '8888-1234',
            'direccion_legal': 'Reparto San Juan, Managua',
            'parentesco_relacion': 'Hermano del Administrador',
            'capital_inicial': '30000.00',
        }, format='json')

        assert res.status_code == 201
        assert res.data['tipo_persona'] == 'NATURAL'
        assert res.data['identificacion'] == '001-150490-0001A'
        assert res.data['familiar'] == 'Roberto Morales Gómez'
        fondo = Fondo.objects.get(pk=res.data['id'])
        assert fondo.nombres_titular == 'Roberto'
        assert fondo.parentesco_relacion == 'Hermano del Administrador'

    def test_crear_fondo_persona_juridica(self, auth_client):
        res = auth_client.post(FONDO_URL, {
            'nombre': 'Inversiones Mercantiles S.A.',
            'tipo_persona': 'JURIDICA',
            'razon_social': 'Inversiones del Pacífico S.A.',
            'ruc': 'J0310000123456',
            'representante_legal': 'Dra. María Auxiliadora Silva',
            'cedula_representante': '001-201080-0005M',
            'telefono_contacto': '2255-9900',
            'direccion_legal': 'Km 4.5 Carretera a Masaya',
            'capital_inicial': '100000.00',
        }, format='json')

        assert res.status_code == 201
        assert res.data['tipo_persona'] == 'JURIDICA'
        assert res.data['ruc'] == 'J0310000123456'
        assert res.data['familiar'] == 'Inversiones del Pacífico S.A.'
        fondo = Fondo.objects.get(pk=res.data['id'])
        assert fondo.representante_legal == 'Dra. María Auxiliadora Silva'



class TestInyeccion:
    def test_inyeccion_aumenta_saldo(self, auth_client, crear_fondo):
        fondo = crear_fondo(capital='50000.00')
        res = auth_client.post(f'{FONDO_URL}{fondo.id}/inyeccion/', {
            'monto': '10000.00',
        }, format='json')

        assert res.status_code == 200
        assert str(res.data['saldo_disponible']) == '60000.00'
        mov = fondo.movimientos.first()
        assert mov.tipo == MovimientoFondo.TipoMovimiento.INYECCION
        assert str(mov.monto) == '10000.00'

    def test_inyeccion_monto_cero_es_error(self, auth_client, crear_fondo):
        fondo = crear_fondo()
        res = auth_client.post(f'{FONDO_URL}{fondo.id}/inyeccion/', {
            'monto': '0.00',
        }, format='json')
        assert res.status_code == 400

    def test_inyeccion_monto_negativo_es_error(self, auth_client, crear_fondo):
        fondo = crear_fondo()
        res = auth_client.post(f'{FONDO_URL}{fondo.id}/inyeccion/', {
            'monto': '-500.00',
        }, format='json')
        assert res.status_code == 400


class TestRetiro:
    def test_retiro_valido_disminuye_saldo(self, auth_client, crear_fondo):
        fondo = crear_fondo(capital='50000.00')
        res = auth_client.post(f'{FONDO_URL}{fondo.id}/retiro/', {
            'monto': '5000.00',
        }, format='json')

        assert res.status_code == 200
        assert str(res.data['saldo_disponible']) == '45000.00'
        mov = fondo.movimientos.first()
        assert mov.tipo == MovimientoFondo.TipoMovimiento.RETIRO
        assert str(mov.monto) == '5000.00'
        assert str(mov.saldo_posterior) == '45000.00'

    def test_retiro_saldo_insuficiente_rechazado(self, auth_client, crear_fondo):
        fondo = crear_fondo(capital='10000.00')
        res = auth_client.post(f'{FONDO_URL}{fondo.id}/retiro/', {
            'monto': '15000.00',
        }, format='json')

        assert res.status_code == 400
        assert 'Saldo insuficiente' in res.data['error']

    def test_retiro_total_saldo_llega_zero(self, auth_client, crear_fondo):
        fondo = crear_fondo(capital='10000.00')
        res = auth_client.post(f'{FONDO_URL}{fondo.id}/retiro/', {
            'monto': '10000.00',
        }, format='json')
        assert res.status_code == 200
        assert str(res.data['saldo_disponible']) == '0.00'


class TestMovimientos:
    def test_listar_movimientos_paginado(self, auth_client, crear_fondo):
        fondo = crear_fondo(capital='10000.00')
        auth_client.post(f'{FONDO_URL}{fondo.id}/inyeccion/', {'monto': '500.00'}, format='json')
        auth_client.post(f'{FONDO_URL}{fondo.id}/inyeccion/', {'monto': '800.00'}, format='json')

        res = auth_client.get(f'{FONDO_URL}{fondo.id}/movimientos/')
        assert res.status_code == 200
        assert res.data['count'] == 2
        tipos = [m['tipo'] for m in res.data['results']]
        assert tipos == ['INYECCION', 'INYECCION']

    def test_listar_fondos_solo_activos(self, auth_client, crear_fondo):
        activo = crear_fondo(nombre='Activo', capital='100.00')
        inactivo = crear_fondo(nombre='Inactivo', capital='100.00')
        inactivo.activo = False
        inactivo.save()

        res = auth_client.get(FONDO_URL)
        ids = [f['id'] for f in res.data['results']]
        assert activo.id in ids
        assert inactivo.id not in ids