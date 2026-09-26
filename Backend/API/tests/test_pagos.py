import pytest
from decimal import Decimal

from django.contrib.auth import get_user_model

from API.models import Prestamo
from API.services.amortizacion import generar_proyeccion

pytestmark = pytest.mark.django_db

PAGO_URL = '/api/prestamos/{id}/pagos/'


@pytest.fixture
def prestamo_vigente(auth_client, cliente, crear_fondo):
    """Préstamo de 10,000 @ 3% mensual × 6 meses, cortes mensuales."""
    fondo = crear_fondo(capital='50000.00')
    data = {
        'cliente': cliente.id,
        'monto_principal': '10000.00',
        'tasa_interes': '0.0300',
        'plazo_meses': 6,
        'periodicidad': 'MENSUAL',
        'fecha_desembolso': '2026-09-01',
        'fecha_primer_corte': '2026-10-01',
        'fondos_detalle': [
            {'fondo': fondo.id, 'monto_aportado': '10000.00', 'porcentaje_pi': '1.0000'}
        ],
    }
    res = auth_client.post('/api/prestamos/', data, format='json')
    assert res.status_code == 201
    prestamo = Prestamo.objects.get(pk=res.data['id'])
    assert prestamo.saldo_insoluto == Decimal('10000.00')
    return prestamo


def pago_payload(monto, fecha='2026-10-01', metodo='EFECTIVO'):
    return {'monto': str(monto), 'fecha_pago': fecha, 'metodo_pago': metodo}


class TestImputacionArt3180:
    def test_pago_cuota_completa_interes_y_capital(self, auth_client, prestamo_vigente):
        res = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('1845.98'), format='json')
        assert res.status_code == 201
        assert res.data['aplicacion_mora'] == '0.00'
        assert res.data['aplicacion_interes'] == '300.00'
        assert res.data['aplicacion_capital'] == '1545.98'
        prestamo_vigente.refresh_from_db()
        assert str(prestamo_vigente.saldo_insoluto) == '8454.02'
        assert prestamo_vigente.estado == Prestamo.Estado.VIGENTE
        assert res.data['codigo_comprobante'].startswith('PAG-')

    def test_pago_menor_interes_minimo_bloqueado(self, auth_client, prestamo_vigente):
        res = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('299.99'), format='json')
        assert res.status_code == 400
        assert 'interés mínimo' in str(res.data)

    def test_pago_igual_interes_minimo_cubre_solo_interes(self, auth_client, prestamo_vigente):
        res = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('300.00'), format='json')
        assert res.status_code == 201
        assert res.data['aplicacion_interes'] == '300.00'
        assert res.data['aplicacion_capital'] == '0.00'
        prestamo_vigente.refresh_from_db()
        assert str(prestamo_vigente.saldo_insoluto) == '10000.00'

    def test_pago_parcial_tras_interes_amortiza_capital(self, auth_client, prestamo_vigente):
        res = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('500.00'), format='json')
        assert res.status_code == 201
        assert res.data['aplicacion_interes'] == '300.00'
        assert res.data['aplicacion_capital'] == '200.00'
        prestamo_vigente.refresh_from_db()
        assert str(prestamo_vigente.saldo_insoluto) == '9800.00'

    def test_secuencia_dos_cuotas_sigue_proyeccion(self, auth_client, prestamo_vigente):
        fila1, fila2 = generar_proyeccion(prestamo_vigente)['periodos'][:2]

        r1 = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload(fila1['cuota'], '2026-10-01'), format='json')
        assert r1.status_code == 201
        r2 = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload(fila2['cuota'], '2026-10-31'), format='json')
        assert r2.status_code == 201

        prestamo_vigente.refresh_from_db()
        assert str(prestamo_vigente.saldo_insoluto) == str(fila2['saldo_insoluto'])

    def test_sobrepago_se_trunca_y_cancela_prestamo(self, auth_client, prestamo_vigente):
        res = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('20000.00', '2027-04-01'), format='json')
        assert res.status_code == 201
        assert res.data['aplicacion_interes'] == '1075.86'
        assert res.data['aplicacion_capital'] == '10000.00'
        assert res.data['exceso_no_aplicado'] == '8924.14'
        prestamo_vigente.refresh_from_db()
        assert str(prestamo_vigente.saldo_insoluto) == '0.00'
        assert prestamo_vigente.estado == Prestamo.Estado.CANCELADO

    def test_pago_sobre_prestamo_cancelado_es_rechazado(self, auth_client, prestamo_vigente):
        auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('11075.86', '2027-04-01'), format='json')
        res = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('100.00', '2027-04-02'), format='json')
        assert res.status_code == 400

    def test_metodo_transferencia_con_referencia(self, auth_client, prestamo_vigente):
        payload = pago_payload('1845.98', '2026-10-01', metodo='TRANSFERENCIA')
        payload['referencia_bancaria'] = 'REF-123'
        res = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), payload, format='json')
        assert res.status_code == 201
        assert res.data['referencia_bancaria'] == 'REF-123'


class TestPrivacidadRolCobranza:
    def test_cobranza_no_ve_fondos_ni_utilidades(self, api_client, prestamo_vigente):
        cobranza = get_user_model().objects.create_user(
            correo='cobranza@cavi.local',
            nombre_completo='Cajero',
            password='x12345',
            rol='COBRANZA',
        )
        api_client.force_authenticate(user=cobranza)
        res = api_client.get(f'/api/prestamos/{prestamo_vigente.id}/')
        assert res.status_code == 200
        assert 'fondos_detalle' not in res.data
        assert 'total_aportado' not in res.data
        assert 'suma_pi' not in res.data
        assert res.data['saldo_deudor'] is not None

    def test_administrador_si_ve_fondos(self, auth_client, prestamo_vigente):
        res = auth_client.get(f'/api/prestamos/{prestamo_vigente.id}/')
        assert res.status_code == 200
        assert 'fondos_detalle' in res.data
        assert res.data['saldo_deudor'] is not None