"""Pruebas de integración del motor financiero (TK20).

Cubre usura (Ley 176), french loan / cuota constante, sin anatocismo,
periodicidad quincenal y consistencia al centavo entre proyección y DB.
"""
import pytest
from decimal import Decimal

from django.conf import settings

from API.models import Prestamo

pytestmark = pytest.mark.django_db

AMORTIZACION_URL = '/api/prestamos/{id}/amortizacion/'
PAGO_URL = '/api/prestamos/{id}/pagos/'


def d2(valor):
    """Normaliza a 2 decimales exactos un número que viene del JSON (float)."""
    return Decimal(format(float(valor), '.2f'))


def d4(valor):
    """Normaliza a 4 decimales exactos (tasas periódicas)."""
    return Decimal(format(float(valor), '.4f'))


def crear_prestamo(auth_client, cliente, crear_fondo,
                   tasa='0.0300', periodicidad='MENSUAL', monto='10000.00'):
    fondo = crear_fondo(capital='50000.00')
    data = {
        'cliente': cliente.id,
        'monto_principal': monto,
        'tasa_interes': tasa,
        'plazo_meses': 6,
        'periodicidad': periodicidad,
        'fecha_desembolso': '2026-09-01',
        'fecha_primer_corte': '2026-10-01',
        'fondos_detalle': [
            {'fondo': fondo.id, 'monto_aportado': monto, 'porcentaje_pi': '1.0000'}
        ],
    }
    res = auth_client.post('/api/prestamos/', data, format='json')
    assert res.status_code == 201, res.data
    return Prestamo.objects.get(pk=res.data['id'])


class TestUsuraTasaMaximaLegal:
    def test_tasa_sobre_tope_rechazada_al_crear(self, auth_client, cliente, crear_fondo):
        res = auth_client.post('/api/prestamos/', {
            'cliente': cliente.id,
            'monto_principal': '10000.00',
            'tasa_interes': '0.0350',
            'plazo_meses': 6,
            'periodicidad': 'MENSUAL',
            'fecha_desembolso': '2026-09-01',
            'fecha_primer_corte': '2026-10-01',
            'fondos_detalle': [
                {'fondo': crear_fondo().id, 'monto_aportado': '10000.00', 'porcentaje_pi': '1.0000'}
            ],
        }, format='json')
        assert res.status_code == 400
        assert 'usura' in str(res.data).lower()
        assert Prestamo.objects.count() == 0

    def test_tasa_junto_al_tope_es_aceptada(self, auth_client, cliente, crear_fondo):
        prestamo = crear_prestamo(auth_client, cliente, crear_fondo, tasa=str(settings.TASA_MAXIMA_LEGAL))
        assert prestamo.tasa_interes == settings.TASA_MAXIMA_LEGAL

    def test_tasa_usuraria_rechazada_al_consultar_amortizacion(self, auth_client, cliente, crear_fondo):
        prestamo = crear_prestamo(auth_client, cliente, crear_fondo)
        prestamo.tasa_interes = '0.0350'
        prestamo.save(update_fields=['tasa_interes'])
        res = auth_client.get(AMORTIZACION_URL.format(id=prestamo.id))
        assert res.status_code == 400
        assert 'usura' in str(res.data).lower()

    def test_tasa_usuraria_bloquea_pago(self, auth_client, cliente, crear_fondo):
        prestamo = crear_prestamo(auth_client, cliente, crear_fondo)
        prestamo.tasa_interes = '0.0350'
        prestamo.save(update_fields=['tasa_interes'])
        res = auth_client.post(PAGO_URL.format(id=prestamo.id), {
            'monto': '1845.98', 'fecha_pago': '2026-10-01', 'metodo_pago': 'EFECTIVO'
        }, format='json')
        assert res.status_code == 400


class TestCuotaConstanteSinAnatocismo:
    def test_mensual_12_treinta_porciento_cierra_en_cero(self, auth_client, cliente, crear_fondo):
        prestamo = crear_prestamo(auth_client, cliente, crear_fondo)
        res = auth_client.get(AMORTIZACION_URL.format(id=prestamo.id))
        assert res.status_code == 200
        proy = res.data

        assert proy['total_periodos'] == 6
        assert d4(proy['tasa_periodica']) == Decimal('0.0300')
        assert d2(proy['monto_principal']) == Decimal('10000.00')

        periodos = proy['periodos']
        assert len(periodos) == 6
        assert d2(periodos[0]['cuota']) == Decimal('1845.98')
        assert d2(periodos[0]['interes']) == Decimal('300.00')
        assert d2(periodos[0]['capital']) == Decimal('1545.98')
        # El último período cancela exactamente el saldo (sin redondeos).
        assert d2(periodos[-1]['saldo_insoluto']) == Decimal('0.00')
        # Interés corriente total del plan (sin anatocismo: nunca se capitaliza).
        assert d2(proy['total_interes']) == Decimal('1075.86')
        # Identidad: total pagado = principal + intereses al centavo.
        assert d2(proy['total_cuotas']) == Decimal('11075.86')

    def test_quincenal_aplica_media_tasa_y_cierra_en_cero(self, auth_client, cliente, crear_fondo):
        prestamo = crear_prestamo(auth_client, cliente, crear_fondo, periodicidad='QUINCENAL')
        res = auth_client.get(AMORTIZACION_URL.format(id=prestamo.id))
        assert res.status_code == 200
        proy = res.data

        assert proy['total_periodos'] == 12
        assert d4(proy['tasa_periodica']) == Decimal('0.0150')
        assert len(proy['periodos']) == 12
        assert d2(proy['periodos'][-1]['saldo_insoluto']) == Decimal('0.00')

    def test_interes_solo_sobre_saldo_insoluto(self, auth_client, cliente, crear_fondo):
        """Cada corte calcula interés sobre el saldo remanente del anterior (sin anatocismo)."""
        prestamo = crear_prestamo(auth_client, cliente, crear_fondo)
        proy = auth_client.get(AMORTIZACION_URL.format(id=prestamo.id)).data
        periodos = proy['periodos']

        for fila in periodos:
            saldo_anterior = d2(fila['saldo_insoluto']) + d2(fila['capital'])
            esperado = (saldo_anterior * Decimal('0.03')).quantize(Decimal('0.01'))
            assert d2(fila['interes']) == esperado

    def test_pagos_secuenciales_cuadran_proyeccion_en_db(self, auth_client, cliente, crear_fondo):
        """Pagar todas las cuotas en sus fechas deja la DB exacta en cero."""
        prestamo = crear_prestamo(auth_client, cliente, crear_fondo)
        proy = auth_client.get(AMORTIZACION_URL.format(id=prestamo.id)).data

        for fila in proy['periodos']:
            cuota = d2(fila['cuota'])
            res = auth_client.post(PAGO_URL.format(id=prestamo.id), {
                'monto': str(cuota),
                'fecha_pago': fila['fecha_vencimiento'],
                'metodo_pago': 'EFECTIVO',
            }, format='json')
            assert res.status_code == 201, res.data
            assert res.data['aplicacion_capital'] == str(d2(fila['capital']))
            assert res.data['aplicacion_interes'] == str(d2(fila['interes']))

        prestamo.refresh_from_db()
        assert prestamo.saldo_insoluto == Decimal('0.00')
        assert prestamo.estado == Prestamo.Estado.CANCELADO