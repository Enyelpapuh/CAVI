import pytest
from decimal import Decimal
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from API.models import Pago, Prestamo, PrestamoFondoDetalle

pytestmark = pytest.mark.django_db

DASHBOARD_URL = '/api/dashboard/'
CAJA_URL = '/api/dashboard/caja/'
AGENDA_URL = '/api/dashboard/agenda/'
PRESTAMOS_URL = '/api/prestamos/'


@pytest.fixture
def cobrador_user(db):
    Usuario = get_user_model()
    return Usuario.objects.create_user(
        correo='cobrador@cavi.local',
        nombre_completo='Cobrador Ruta 1',
        password='test12345',
        rol='COBRANZA',
    )


@pytest.fixture
def cobrador_client(api_client, cobrador_user):
    api_client.force_authenticate(user=cobrador_user)
    return api_client


def crear_prestamo(cliente, fondo, monto='50000.00', primer_corte=None, dias_atraso=0):
    """Préstamo vigente cuyo primer corte vence dentro de `dias_atraso` días atrás."""
    hoy = timezone.localdate()
    corte = primer_corte or (hoy - timedelta(days=dias_atraso))
    prestamo = Prestamo.objects.create(
        cliente=cliente,
        monto_principal=Decimal(monto),
        saldo_insoluto=Decimal(monto),
        tasa_interes=Decimal('0.0250'),
        plazo_meses=12,
        periodicidad='MENSUAL',
        fecha_desembolso=corte,
        fecha_primer_corte=corte,
    )
    PrestamoFondoDetalle.objects.create(
        prestamo=prestamo, fondo=fondo,
        monto_aportado=Decimal(monto), porcentaje_pi=Decimal('1.0000'),
    )
    return prestamo


class TestDashboardAdministrador:
    def test_agregados_reflejan_la_cartera_real(self, auth_client, cliente, crear_fondo):
        fondo = crear_fondo(capital='80000.00')
        prestamo = crear_prestamo(cliente, fondo, dias_atraso=6)

        res = auth_client.get(DASHBOARD_URL)

        assert res.status_code == 200
        assert res.data['clientes_activos'] == 1
        assert res.data['bolsas']['cantidad'] == 1
        # El préstamo de este helper no mueve fondos: el capital sigue disponible
        assert Decimal(res.data['bolsas']['capital_en_calle']) == Decimal('80000.00')
        assert res.data['creditos_vigentes']['cantidad'] == 1
        assert Decimal(res.data['creditos_vigentes']['saldo_total']) >= Decimal('50000.00')
        assert res.data['creditos_vigentes']['en_mora'] == 1
        assert res.data['abonos_del_dia']['cantidad'] == 0

        fila = res.data['cartera'][0]
        assert fila['id'] == prestamo.id
        assert fila['cliente_nombre'] == str(cliente)
        assert fila['estado_efectivo'] == 'EN_MORA'
        assert fila['dias_atraso'] == 6
        assert fila['dias_gracia'] == 4
        assert fila['bolsas'][0]['nombre'] == fondo.nombre

    def test_cartera_sana_reporta_gracia_dentro_de_los_4_dias(
        self, auth_client, cliente, crear_fondo
    ):
        fondo = crear_fondo(capital='50000.00')
        crear_prestamo(cliente, fondo, dias_atraso=3)

        res = auth_client.get(DASHBOARD_URL)

        fila = res.data['cartera'][0]
        assert fila['estado_efectivo'] == 'EN_GRACIA'
        assert fila['dias_atraso'] == 3
        assert res.data['creditos_vigentes']['en_mora'] == 0
        assert Decimal(res.data['creditos_vigentes']['porcentaje_sano']) == Decimal('100.00')

    def test_semaforo_clasifica_la_cartera_y_suma_la_mora(
        self, auth_client, cliente, crear_fondo
    ):
        fondo = crear_fondo(capital='200000.00')
        crear_prestamo(cliente, fondo, monto='50000.00', dias_atraso=0)   # al día
        crear_prestamo(cliente, fondo, monto='30000.00', dias_atraso=3)   # en gracia
        crear_prestamo(cliente, fondo, monto='20000.00', dias_atraso=9)   # en mora

        res = auth_client.get(DASHBOARD_URL)

        semaforo = res.data['cartera_semaforo']
        assert semaforo['al_dia'] == 1
        assert semaforo['en_gracia'] == 1
        assert semaforo['en_mora'] == 1
        assert semaforo['dias_gracia'] == 4
        # Solo el préstamo en mora tiene recargo: 20000 × (1.25%/30) × 5 días.
        assert Decimal(semaforo['mora_total']) == Decimal('41.67')
        assert Decimal(semaforo['saldo_en_mora']) > Decimal('20000.00')

        fila_mora = next(f for f in res.data['cartera'] if f['estado_efectivo'] == 'EN_MORA')
        assert fila_mora['dias_mora'] == 5
        assert Decimal(fila_mora['mora_pendiente']) == Decimal('41.67')
        assert Decimal(fila_mora['tasa_mora']) == Decimal('0.0125')
        # El corte vencido también devenga interés corriente.
        assert Decimal(fila_mora['interes_vencido']) > 0

    def test_la_agenda_mostra_la_mora_sin_exponer_fondos(
        self, cobrador_client, cliente, crear_fondo
    ):
        fondo = crear_fondo(capital='50000.00')
        crear_prestamo(cliente, fondo, dias_atraso=10)

        res = cobrador_client.get(AGENDA_URL)

        fila = res.data['filas'][0]
        assert fila['estado_efectivo'] == 'EN_MORA'
        assert Decimal(fila['mora_pendiente']) > 0
        assert fila['bolsas'] == []
        assert res.data['resumen']['mora_total'] == fila['mora_pendiente']

    def test_abonos_del_dia_suman_solo_pagos_de_hoy(
        self, auth_client, admin_user, cliente, crear_fondo
    ):
        from API.services.pagos import aplicar_pago

        fondo = crear_fondo(capital='50000.00')
        prestamo = crear_prestamo(cliente, fondo, primer_corte=timezone.localdate())

        aplicar_pago(
            prestamo=prestamo,
            monto=Decimal('2000.00'),
            fecha_pago=timezone.localdate(),
            metodo_pago=Pago.MetodoPago.EFECTIVO,
            usuario=admin_user,
        )

        res = auth_client.get(DASHBOARD_URL)

        assert res.data['abonos_del_dia']['cantidad'] == 1
        assert Decimal(res.data['abonos_del_dia']['monto']) == Decimal('2000.00')

    def test_cobranza_no_puede_ver_el_dashboard(self, cobrador_client):
        res = cobrador_client.get(DASHBOARD_URL)
        assert res.status_code == 403
        assert 'restringida' in res.data['detail']


class TestCajaDelCobrador:
    def test_caja_solo_consolida_los_recaudos_del_usuario(
        self, api_client, cobrador_client, admin_user, cliente, crear_fondo
    ):
        from API.services.pagos import aplicar_pago

        fondo = crear_fondo(capital='100000.00')
        prestamo_a = crear_prestamo(cliente, fondo, monto='50000.00',
                                    primer_corte=timezone.localdate())
        prestamo_b = Prestamo.objects.create(
            cliente=cliente, monto_principal=Decimal('30000.00'),
            saldo_insoluto=Decimal('30000.00'), tasa_interes=Decimal('0.0250'),
            plazo_meses=6, periodicidad='MENSUAL',
            fecha_desembolso=timezone.localdate(),
            fecha_primer_corte=timezone.localdate(),
        )
        PrestamoFondoDetalle.objects.create(
            prestamo=prestamo_b, fondo=fondo, monto_aportado=Decimal('30000.00'),
            porcentaje_pi=Decimal('1.0000'),
        )

        # El abono debe cubrir el interés mínimo del ciclo (1250.00)
        aplicar_pago(prestamo_a, Decimal('2000.00'), timezone.localdate(),
                     Pago.MetodoPago.EFECTIVO, cobrador_client.handler._force_user)
        aplicar_pago(prestamo_b, Decimal('1000.00'), timezone.localdate(),
                     Pago.MetodoPago.EFECTIVO, admin_user)

        res = cobrador_client.get(CAJA_URL)

        assert res.status_code == 200
        assert res.data['usuario'] == 'Cobrador Ruta 1'
        assert Decimal(res.data['total_recaudado']) == Decimal('2000.00')
        assert res.data['recibos_emitidos'] == 1
        assert Decimal(res.data['por_metodo']['EFECTIVO']['monto']) == Decimal('2000.00')
        # Privacidad Ley 787: nada de fondos ni liquidaciones 50/50
        assert 'fondos' not in res.data
        assert 'interes_administracion' not in res.data
        assert 'ganancia_administracion' not in res.data

    def test_requiere_autenticacion(self, api_client):
        assert api_client.get(CAJA_URL).status_code == 401


class TestAgendaCobrador:
    def test_agenda_omite_datos_de_fondos(
        self, cobrador_client, cliente, crear_fondo
    ):
        fondo = crear_fondo(capital='50000.00')
        prestamo = crear_prestamo(cliente, fondo, dias_atraso=1)

        res = cobrador_client.get(AGENDA_URL)

        assert res.status_code == 200
        fila = res.data['filas'][0]
        assert fila['id'] == prestamo.id
        assert fila['estado_efectivo'] == 'EN_GRACIA'
        assert fila['bolsas'] == []
        assert 'total_aportado' not in fila

    def test_agenda_filtra_por_nombre_sin_acentos(self, cobrador_client, cliente, crear_fondo):
        fondo = crear_fondo(capital='50000.00')
        crear_prestamo(cliente, fondo)

        res = cobrador_client.get(f'{AGENDA_URL}?search=perez')

        assert len(res.data['filas']) == 1
        assert cobrador_client.get(f'{AGENDA_URL}?search=zzz').data['filas'] == []


class TestSimulacionPrestamo:
    def test_simula_cuota_sin_persistir(self, auth_client, cliente):
        res = auth_client.post(f'{PRESTAMOS_URL}simular/', {
            'monto_principal': '50000.00',
            'tasa_interes': '0.0250',
            'plazo_meses': 12,
            'periodicidad': 'MENSUAL',
            'fecha_primer_corte': '2026-10-23',
        }, format='json')

        assert res.status_code == 200
        assert res.data['total_periodos'] == 12
        assert Decimal(res.data['cuota_estimada']) == Decimal('4874.36')
        assert len(res.data['periodos']) == 12
        assert Prestamo.objects.count() == 0

    def test_rechaza_tasa_de_usura(self, auth_client, cliente):
        res = auth_client.post(f'{PRESTAMOS_URL}simular/', {
            'monto_principal': '50000.00',
            'tasa_interes': '0.9900',
            'plazo_meses': 12,
            'periodicidad': 'MENSUAL',
        }, format='json')

        assert res.status_code == 400
        assert 'usura' in str(res.data).lower()


class TestPreviewPago:
    def test_preview_desglosa_prelacion_sin_asentar(
        self, auth_client, admin_user, cliente, crear_fondo
    ):
        fondo = crear_fondo(capital='50000.00')
        prestamo = crear_prestamo(cliente, fondo, primer_corte=timezone.localdate())
        monto = Decimal('5000.00')

        res = auth_client.post(
            f'{PRESTAMOS_URL}{prestamo.id}/preview_pago/',
            {'monto': str(monto)},
            format='json',
        )

        assert res.status_code == 200
        assert Decimal(res.data['monto_recibido']) == monto
        assert Decimal(res.data['aplicacion_interes']) > 0
        assert Decimal(res.data['aplicacion_capital']) > 0
        assert Decimal(res.data['saldo_insoluto_tras_pago']) < Decimal('50000.00')
        assert res.data['es_valido'] is True
        # Nada se escribe: es un preview
        assert Pago.objects.count() == 0
        prestamo.refresh_from_db()
        assert prestamo.saldo_insoluto == Decimal('50000.00')

    def test_preview_informa_el_bloqueo_por_interes_minimo(
        self, auth_client, cliente, crear_fondo
    ):
        fondo = crear_fondo(capital='50000.00')
        prestamo = crear_prestamo(cliente, fondo, primer_corte=timezone.localdate())

        res = auth_client.post(
            f'{PRESTAMOS_URL}{prestamo.id}/preview_pago/',
            {'monto': '10.00'},
            format='json',
        )

        assert res.status_code == 200
        assert res.data['es_valido'] is False
        assert 'interés mínimo' in res.data['error']['monto']
        assert Decimal(res.data['minimo_ciclo']) > Decimal('10.00')

    def test_preview_coincide_con_lo_que_se_asienta(
        self, auth_client, admin_user, cliente, crear_fondo
    ):
        """El preview y el pago real deben producir exactamente lo mismo."""
        fondo = crear_fondo(capital='50000.00')
        prestamo = crear_prestamo(cliente, fondo, primer_corte=timezone.localdate())
        monto = Decimal('9000.00')

        preview = auth_client.post(
            f'{PRESTAMOS_URL}{prestamo.id}/preview_pago/',
            {'monto': str(monto)},
            format='json',
        ).data

        real = auth_client.post(
            f'{PRESTAMOS_URL}{prestamo.id}/pagos/',
            {'monto': str(monto), 'fecha_pago': str(timezone.localdate()),
             'metodo_pago': 'EFECTIVO'},
            format='json',
        ).data

        assert Decimal(real['aplicacion_interes']) == Decimal(preview['aplicacion_interes'])
        assert Decimal(real['aplicacion_capital']) == Decimal(preview['aplicacion_capital'])
        assert Decimal(real['aplicacion_mora']) == Decimal(preview['aplicacion_mora'])
        assert Decimal(real['monto_total']) == Decimal(preview['monto_aplicado'])

    def test_preview_rechaza_monto_no_positivo(self, auth_client, cliente, crear_fondo):
        fondo = crear_fondo(capital='50000.00')
        prestamo = crear_prestamo(cliente, fondo)

        res = auth_client.post(
            f'{PRESTAMOS_URL}{prestamo.id}/preview_pago/',
            {'monto': '0'},
            format='json',
        )

        assert res.status_code == 400
