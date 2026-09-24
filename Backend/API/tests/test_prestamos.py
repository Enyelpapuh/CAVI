import pytest
from decimal import Decimal

from API.models import Prestamo, PrestamoFondoDetalle, MovimientoFondo

pytestmark = pytest.mark.django_db

PRESTAMO_URL = '/api/prestamos/'
BASE_DATA = {
    'monto_principal': '50000.00',
    'tasa_interes': '0.0250',
    'plazo_meses': 12,
    'periodicidad': 'MENSUAL',
    'fecha_desembolso': '2026-09-23',
    'fecha_primer_corte': '2026-10-23',
}


def payload(cliente_id, fondos):
    data = dict(BASE_DATA)
    data['cliente'] = cliente_id
    data['fondos_detalle'] = fondos
    return data


class TestCrearPrestamo:
    def test_crear_prestamo_un_fondo(self, auth_client, cliente, crear_fondo):
        fondo = crear_fondo(capital='50000.00')
        res = auth_client.post(PRESTAMO_URL, payload(cliente.id, [
            {'fondo': fondo.id, 'monto_aportado': '50000.00', 'porcentaje_pi': '1.0000'}
        ]), format='json')

        assert res.status_code == 201
        prestamo = Prestamo.objects.get(pk=res.data['id'])
        assert prestamo.estado == Prestamo.Estado.VIGENTE
        fondo.refresh_from_db()
        assert str(fondo.saldo_disponible) == '0.00'
        detalle = prestamo.fondos_detalle.first()
        assert detalle.fondo_id == fondo.id
        assert str(detalle.monto_aportado) == '50000.00'
        assert str(detalle.porcentaje_pi) == '1.0000'

    def test_crear_prestamo_multifondo_debita_todos(self, auth_client, cliente, crear_fondo):
        f1 = crear_fondo(nombre='Fondo A', capital='30000.00')
        f2 = crear_fondo(nombre='Fondo B', capital='30000.00')

        res = auth_client.post(PRESTAMO_URL, payload(cliente.id, [
            {'fondo': f1.id, 'monto_aportado': '30000.00', 'porcentaje_pi': '0.6000'},
            {'fondo': f2.id, 'monto_aportado': '20000.00', 'porcentaje_pi': '0.4000'},
        ]), format='json')

        assert res.status_code == 201
        f1.refresh_from_db()
        f2.refresh_from_db()
        assert str(f1.saldo_disponible) == '0.00'
        assert str(f2.saldo_disponible) == '10000.00'

        prestamo = Prestamo.objects.get(pk=res.data['id'])
        assert prestamo.fondos_detalle.count() == 2
        assert Decimal(str(res.data['total_aportado'])) == Decimal('50000.00')
        assert abs(Decimal(str(res.data['suma_pi'])) - Decimal('1.0000')) < Decimal('0.0001')

    def test_crear_prestamo_cuatro_fondos(self, auth_client, cliente, crear_fondo):
        fondos = [
            crear_fondo(nombre=f'Fondo {i}', capital='50000.00') for i in range(4)
        ]
        res = auth_client.post(PRESTAMO_URL, payload(cliente.id, [
            {'fondo': fondos[0].id, 'monto_aportado': '12500.00', 'porcentaje_pi': '0.2500'},
            {'fondo': fondos[1].id, 'monto_aportado': '12500.00', 'porcentaje_pi': '0.2500'},
            {'fondo': fondos[2].id, 'monto_aportado': '12500.00', 'porcentaje_pi': '0.2500'},
            {'fondo': fondos[3].id, 'monto_aportado': '12500.00', 'porcentaje_pi': '0.2500'},
        ]), format='json')

        assert res.status_code == 201
        assert PrestamoFondoDetalle.objects.filter(prestamo_id=res.data['id']).count() == 4
        assert MovimientoFondo.objects.filter(tipo=MovimientoFondo.TipoMovimiento.DESEMBOLSO).count() == 4

    def test_crear_prestamo_sin_fondos_es_error(self, auth_client, cliente):
        res = auth_client.post(PRESTAMO_URL, payload(cliente.id, []), format='json')
        assert res.status_code == 400


class TestValidaciones:
    def test_suma_pi_invalida(self, auth_client, cliente, crear_fondo):
        fondo = crear_fondo(capital='50000.00')
        res = auth_client.post(PRESTAMO_URL, payload(cliente.id, [
            {'fondo': fondo.id, 'monto_aportado': '50000.00', 'porcentaje_pi': '1.1000'}
        ]), format='json')
        assert res.status_code == 400
        assert 'porcentajes Pi' in str(res.data['fondos_detalle'])

    def test_suma_montos_no_igual_principal(self, auth_client, cliente, crear_fondo):
        fondo = crear_fondo(capital='50000.00')
        res = auth_client.post(PRESTAMO_URL, payload(cliente.id, [
            {'fondo': fondo.id, 'monto_aportado': '45000.00', 'porcentaje_pi': '0.9000'}
        ]), format='json')
        assert res.status_code == 400
        assert 'suma de aportes' in str(res.data['fondos_detalle'])

    def test_fondo_sin_saldo_suficiente(self, auth_client, cliente, crear_fondo):
        fondo = crear_fondo(capital='10000.00')
        req = dict(BASE_DATA)
        req['cliente'] = cliente.id
        req['monto_principal'] = '15000.00'
        req['fondos_detalle'] = [
            {'fondo': fondo.id, 'monto_aportado': '15000.00', 'porcentaje_pi': '1.0000'}
        ]
        res = auth_client.post(PRESTAMO_URL, req, format='json')
        assert res.status_code == 400
        assert 'saldo suficiente' in str(res.data['fondos_detalle']).lower() or 'no tiene saldo' in str(res.data['fondos_detalle'])

    def test_suma_pi_tolerancia_acepta_margen_0_0001(self, auth_client, cliente, crear_fondo):
        f1 = crear_fondo(nombre='Fondo A', capital='50000.00')
        f2 = crear_fondo(nombre='Fondo B', capital='50000.00')
        res = auth_client.post(PRESTAMO_URL, payload(cliente.id, [
            {'fondo': f1.id, 'monto_aportado': '25000.00', 'porcentaje_pi': '0.5000'},
            {'fondo': f2.id, 'monto_aportado': '25000.00', 'porcentaje_pi': '0.5001'},
        ]), format='json')
        assert res.status_code == 201

    def test_suma_pi_excede_tolerancia_rechazada(self, auth_client, cliente, crear_fondo):
        f1 = crear_fondo(nombre='Fondo A', capital='50000.00')
        f2 = crear_fondo(nombre='Fondo B', capital='50000.00')
        res = auth_client.post(PRESTAMO_URL, payload(cliente.id, [
            {'fondo': f1.id, 'monto_aportado': '25000.00', 'porcentaje_pi': '0.5000'},
            {'fondo': f2.id, 'monto_aportado': '25000.00', 'porcentaje_pi': '0.5005'},
        ]), format='json')
        assert res.status_code == 400


class TestTransaccionAtomica:
    def test_rollback_total_si_segundo_fondo_insuficiente(self, auth_client, cliente, crear_fondo):
        f1 = crear_fondo(nombre='Fondo Rico', capital='50000.00')
        f2 = crear_fondo(nombre='Fondo Pobre', capital='1000.00')

        res = auth_client.post(PRESTAMO_URL, payload(cliente.id, [
            {'fondo': f1.id, 'monto_aportado': '40000.00', 'porcentaje_pi': '0.8000'},
            {'fondo': f2.id, 'monto_aportado': '10000.00', 'porcentaje_pi': '0.2000'},
        ]), format='json')

        assert res.status_code == 400
        assert Prestamo.objects.count() == 0
        assert PrestamoFondoDetalle.objects.count() == 0
        assert MovimientoFondo.objects.count() == 0
        f1.refresh_from_db()
        assert str(f1.saldo_disponible) == '50000.00'

    def test_rollback_total_si_validacion_pi_falla(self, auth_client, cliente, crear_fondo):
        f1 = crear_fondo(nombre='Fondo A', capital='40000.00')
        f2 = crear_fondo(nombre='Fondo B', capital='40000.00')

        res = auth_client.post(PRESTAMO_URL, payload(cliente.id, [
            {'fondo': f1.id, 'monto_aportado': '30000.00', 'porcentaje_pi': '0.7000'},
            {'fondo': f2.id, 'monto_aportado': '20000.00', 'porcentaje_pi': '0.5000'},
        ]), format='json')

        assert res.status_code == 400
        assert Prestamo.objects.count() == 0
        f1.refresh_from_db()
        assert str(f1.saldo_disponible) == '40000.00'

    def test_saldo_consistente_tras_exito_y_fallo_parcial(self, auth_client, cliente, crear_fondo):
        f1 = crear_fondo(nombre='Fondo A', capital='60000.00')
        f2 = crear_fondo(nombre='Fondo B', capital='60000.00')

        ok = auth_client.post(PRESTAMO_URL, payload(cliente.id, [
            {'fondo': f1.id, 'monto_aportado': '30000.00', 'porcentaje_pi': '0.6000'},
            {'fondo': f2.id, 'monto_aportado': '20000.00', 'porcentaje_pi': '0.4000'},
        ]), format='json')
        assert ok.status_code == 201
        assert Prestamo.objects.count() == 1

        fallido = auth_client.post(PRESTAMO_URL, payload(cliente.id, [
            {'fondo': f1.id, 'monto_aportado': '35000.00', 'porcentaje_pi': '0.7000'},
            {'fondo': f2.id, 'monto_aportado': '15000.00', 'porcentaje_pi': '0.3000'},
        ]), format='json')
        assert fallido.status_code == 400
        assert Prestamo.objects.count() == 1

        f1.refresh_from_db()
        f2.refresh_from_db()
        assert str(f1.saldo_disponible) == '30000.00'
        assert str(f2.saldo_disponible) == '40000.00'
        assert MovimientoFondo.objects.filter(tipo=MovimientoFondo.TipoMovimiento.DESEMBOLSO).count() == 2