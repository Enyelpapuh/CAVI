import pytest
from decimal import Decimal

from django.contrib.auth import get_user_model

from API.models import Prestamo, Pago, MovimientoFondo
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


class TestLiquidacion50y50:
    def test_reintegro_ganancias_y_trazabilidad(self, auth_client, prestamo_vigente):
        res = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('1845.98'), format='json')
        assert res.status_code == 201
        # 50/50 sobre interés corriente del corte (300.00)
        assert res.data['interes_administracion'] == '150.00'
        assert res.data['interes_fondos'] == '150.00'

        pago = Pago.objects.get(pk=res.data['id'])
        assert pago.prestamo.saldo_insoluto == Decimal('8454.02')

        # Reintegro de capital + ganancia en el único fondo (Pi 1.0000)
        detalle = pago.fondos_detalle.get()
        assert detalle.capital_reintegrado == Decimal('1545.98')
        assert detalle.ganancia == Decimal('150.00')

        fondo = detalle.fondo
        assert fondo.saldo_disponible == Decimal('50000.00') - Decimal('10000.00') + Decimal('1545.98')
        assert fondo.ganancias_acumuladas == Decimal('150.00')

        # Ganancia de administración global
        assert pago.ganancia_administracion.monto == Decimal('150.00')

        # Trazabilidad UAF: movimientos GANANCIA y REINTEGRO referencian el pago
        assert MovimientoFondo.objects.filter(pago=pago, tipo=MovimientoFondo.TipoMovimiento.GANANCIA).count() == 1
        assert MovimientoFondo.objects.filter(pago=pago, tipo=MovimientoFondo.TipoMovimiento.REINTEGRO).count() == 1
        mov = MovimientoFondo.objects.filter(pago=pago).first()
        assert mov.descripcion.startswith('Liquidación') or mov.descripcion.startswith('Reintegro')

    def test_multifondo_reparte_por_pi_sin_perder_centavos(self, auth_client, cliente, crear_fondo):
        f1 = crear_fondo(nombre='Fondo A', capital='30000.00')
        f2 = crear_fondo(nombre='Fondo B', capital='30000.00')
        data = {
            'cliente': cliente.id,
            'monto_principal': '10000.00',
            'tasa_interes': '0.0300',
            'plazo_meses': 6,
            'periodicidad': 'MENSUAL',
            'fecha_desembolso': '2026-09-01',
            'fecha_primer_corte': '2026-10-01',
            'fondos_detalle': [
                {'fondo': f1.id, 'monto_aportado': '6000.00', 'porcentaje_pi': '0.6000'},
                {'fondo': f2.id, 'monto_aportado': '4000.00', 'porcentaje_pi': '0.4000'},
            ],
        }
        prestamo = Prestamo.objects.get(pk=auth_client.post('/api/prestamos/', data, format='json').data['id'])

        res = auth_client.post(PAGO_URL.format(id=prestamo.id), pago_payload('1845.98'), format='json')
        assert res.status_code == 201

        pago = Pago.objects.get(pk=res.data['id'])
        detalles = list(pago.fondos_detalle.order_by('fondo_id'))
        assert len(detalles) == 2
        total_capital = sum(d.capital_reintegrado for d in detalles)
        total_ganancia = sum(d.ganancia for d in detalles)
        assert total_capital == Decimal('1545.98')
        assert total_ganancia == Decimal('150.00')

        f1.refresh_from_db(); f2.refresh_from_db()
        assert f1.saldo_disponible == Decimal('30000.00') - Decimal('6000.00') + Decimal('927.59')
        assert f2.saldo_disponible == Decimal('30000.00') - Decimal('4000.00') + Decimal('618.39')
        assert f1.ganancias_acumuladas + f2.ganancias_acumuladas == Decimal('150.00')
        assert MovimientoFondo.objects.filter(pago=pago, tipo=MovimientoFondo.TipoMovimiento.REINTEGRO).count() == 2

    def test_fondos_terminan_consistentes_con_cancelacion(self, auth_client, cliente, crear_fondo):
        # Liquida todo en un abono; los fondos recuperan el 100% del capital.
        f1 = crear_fondo(nombre='Fondo A', capital='20000.00')
        data = {
            'cliente': cliente.id,
            'monto_principal': '10000.00',
            'tasa_interes': '0.0300',
            'plazo_meses': 6,
            'periodicidad': 'MENSUAL',
            'fecha_desembolso': '2026-09-01',
            'fecha_primer_corte': '2026-10-01',
            'fondos_detalle': [
                {'fondo': f1.id, 'monto_aportado': '10000.00', 'porcentaje_pi': '1.0000'},
            ],
        }
        prestamo = Prestamo.objects.get(pk=auth_client.post('/api/prestamos/', data, format='json').data['id'])
        res = auth_client.post(PAGO_URL.format(id=prestamo.id), pago_payload('11075.86', '2027-04-01'), format='json')
        assert res.status_code == 201

        f1.refresh_from_db()
        assert f1.saldo_disponible == Decimal('20000.00')  # capital totalmente reintegrado
        assert f1.ganancias_acumuladas == Decimal('537.93')

        prestamo.refresh_from_db()
        assert prestamo.estado == Prestamo.Estado.CANCELADO


class TestAtomicidadYConsistencia:
    def test_fallo_a_mitad_de_liquidacion_revierte_todo(self, auth_client, prestamo_vigente, monkeypatch):
        """Si falla la trazabilidad/reintegro, el pago entero se revierte (ROBUSTEZ)."""
        from API.services import pagos as pagos_service

        fondo = prestamo_vigente.fondos_detalle.get().fondo
        saldo_fondo = fondo.saldo_disponible
        ganancias_fondo = fondo.ganancias_acumuladas
        pago_id = None

        def reventar_create(*args, **kwargs):
            raise RuntimeError('fallo inyectado en movimientos')

        monkeypatch.setattr(
            pagos_service.MovimientoFondo.objects, 'create', reventar_create)

        with pytest.raises(RuntimeError):
            auth_client.post(
                PAGO_URL.format(id=prestamo_vigente.id),
                pago_payload('1845.98'), format='json')

        assert Pago.objects.count() == 0
        assert MovimientoFondo.objects.filter(pago__isnull=False).count() == 0

        prestamo_vigente.refresh_from_db()
        assert prestamo_vigente.saldo_insoluto == Decimal('10000.00')
        assert prestamo_vigente.estado == Prestamo.Estado.VIGENTE

        fondo.refresh_from_db()
        assert fondo.saldo_disponible == saldo_fondo
        assert fondo.ganancias_acumuladas == ganancias_fondo

    def test_pagos_divididos_del_mismo_corte_no_duplican_interes(
            self, auth_client, prestamo_vigente):
        """Dos abonos en fecha de corte: el 2º no vuelve a cobrar interés del corte."""
        r1 = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('300.00', '2026-10-01'), format='json')
        assert r1.status_code == 201
        assert r1.data['aplicacion_interes'] == '300.00'
        assert r1.data['aplicacion_capital'] == '0.00'

        # El siguiente abono cubre solo capital (el interés del corte ya está pagado).
        r2 = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('1545.98', '2026-10-01'), format='json')
        assert r2.status_code == 201
        assert r2.data['aplicacion_interes'] == '0.00'
        assert r2.data['aplicacion_capital'] == '1545.98'

        prestamo_vigente.refresh_from_db()
        assert str(prestamo_vigente.saldo_insoluto) == '8454.02'


class TestRecibo:
    def test_recibo_serializa_detalle_y_ganancias(self, auth_client, prestamo_vigente):
        creado = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('1845.98'), format='json')
        pago_id = creado.data['id']
        res = auth_client.get(f'/api/pagos/{pago_id}/')
        assert res.status_code == 200
        assert res.data['codigo_comprobante'].startswith('PAG-')
        assert len(res.data['fondos_detalle']) == 1
        assert res.data['ganancia_administracion'] == '150.00'

    def test_recibo_para_cobranza_omite_fondos_y_utilidades(self, prestamo_vigente, api_client):
        # Cobranza asienta el pago vía endpoint normal
        cobranza = get_user_model().objects.create_user(
            correo='cajero@cavi.local', nombre_completo='Cajera', password='x12345', rol='COBRANZA')
        api_client.force_authenticate(user=cobranza)
        creado = api_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('1845.98'), format='json')
        assert creado.status_code == 201

        res = api_client.get(f'/api/pagos/{creado.data["id"]}/')
        assert res.status_code == 200
        assert 'fondos_detalle' not in res.data
        assert 'ganancia_administracion' not in res.data
        assert 'interes_administracion' not in res.data
        assert res.data['aplicacion_interes'] == '300.00'