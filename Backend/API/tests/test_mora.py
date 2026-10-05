"""Motor de mora por atraso (CAVI-TK21, Sprint 3).

Cubre la regla de gracia (4 días), la tasa legal por defecto (mitad de la
tasa pactada, Art. 3184 Código Civil), la idempotencia del cálculo diario, la
precedencia sobre el interés corriente y la sincronización del estado
persistido.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from API.models import Prestamo
from API.services.mora import (
    actualizar_mora_prestamo,
    detalle_mora,
    dias_mora_facturables,
    mora_generada_no_persistida,
    mora_pendiente,
    tasa_mora_diaria,
    tasa_mora_mensual,
)

pytestmark = pytest.mark.django_db

PAGO_URL = '/api/prestamos/{id}/pagos/'


@pytest.fixture
def prestamo(db, cliente, crear_fondo):
    """Préstamo de 10,000 @ 3% mensual, primer corte hace `dias` días."""
    return _crear(cliente, crear_fondo(), dias=0)


def _crear(cliente, fondo, dias, saldo='10000.00', tasa='0.0300', mora=None):
    corte = timezone.localdate() - timedelta(days=dias)
    return Prestamo.objects.create(
        cliente=cliente,
        monto_principal=Decimal(saldo),
        saldo_insoluto=Decimal(saldo),
        tasa_interes=Decimal(tasa),
        tasa_mora=Decimal(mora) if mora else None,
        plazo_meses=6,
        periodicidad='MENSUAL',
        fecha_desembolso=corte,
        fecha_primer_corte=corte,
    )


class TestTasaMora:
    def test_por_defecto_es_la_mitad_de_la_tasa_pactada(self, prestamo):
        # Art. 3184: recargo moratorio legal = mitad del interés pactado.
        assert tasa_mora_mensual(prestamo) == Decimal('0.0150')
        assert tasa_mora_diaria(prestamo) == Decimal('0.00050000')

    def test_tasa_configurable_por_prestamo(self, cliente, crear_fondo):
        prestamo = _crear(cliente, crear_fondo(), dias=30, mora='0.0200')

        assert tasa_mora_mensual(prestamo) == Decimal('0.0200')


class TestGracia:
    @pytest.mark.parametrize('dias', [0, 1, 4])
    def test_dentro_de_la_gracia_no_hay_mora(self, cliente, crear_fondo, dias):
        prestamo = _crear(cliente, crear_fondo(), dias=dias)

        assert dias_mora_facturables(prestamo) == 0
        assert mora_pendiente(prestamo) == Decimal('0.00')

    def test_al_quinto_dia_empieza_a_generar(self, cliente, crear_fondo):
        prestamo = _crear(cliente, crear_fondo(), dias=5)

        assert dias_mora_facturables(prestamo) == 1
        # 10000 × 0.015/30 × 1 día
        assert mora_pendiente(prestamo) == Decimal('5.00')


class TestDevengoDiario:
    def test_mora_proporcional_a_los_dias_fuera_de_gracia(self, cliente, crear_fondo):
        prestamo = _crear(cliente, crear_fondo(), dias=14)

        # 10 días fuera de gracia: 10000 × 0.0005 × 10
        assert detalle_mora(prestamo)['mora_pendiente'] == Decimal('50.00')
        assert detalle_mora(prestamo)['dias_mora'] == 10

    def test_calculo_es_idempotente(self, cliente, crear_fondo):
        prestamo = _crear(cliente, crear_fondo(), dias=14)

        primero = mora_pendiente(prestamo)
        segundo = mora_pendiente(prestamo)

        assert primero == segundo == Decimal('50.00')

    def test_persistir_no_duplica_mora(self, cliente, crear_fondo):
        prestamo = _crear(cliente, crear_fondo(), dias=14)

        actualizar_mora_prestamo(prestamo)
        prestamo.refresh_from_db()
        assert prestamo.mora_acumulada == Decimal('50.00')
        assert prestamo.dias_mora == 10

        # Segundo paso el mismo día: no debe sumar nada.
        actualizar_mora_prestamo(prestamo)
        prestamo.refresh_from_db()
        assert prestamo.mora_acumulada == Decimal('50.00')
        assert prestamo.dias_mora == 10

    def test_solo_devenga_los_dias_nuevos(self, cliente, crear_fondo):
        prestamo = _crear(cliente, crear_fondo(), dias=14)
        actualizar_mora_prestamo(prestamo)

        # El préstamo sigue sin pagos: pasan 6 días más de mora.
        for dia in (15, 16, 17, 18, 19, 20):
            _actualizar_vencimiento(prestamo, dia)

        actualizar_mora_prestamo(prestamo)
        prestamo.refresh_from_db()
        assert prestamo.dias_mora == 16
        assert prestamo.mora_acumulada == Decimal('80.00')

    def test_prestamo_cancelado_no_devenga(self, prestamo):
        prestamo.estado = Prestamo.Estado.CANCELADO
        prestamo.save(update_fields=['estado'])

        detalle = detalle_mora(prestamo)

        assert detalle['dias_mora'] == 0
        assert detalle['mora_pendiente'] == Decimal('0.00')
        assert detalle['mora_no_persistida'] == Decimal('0.00')


def _actualizar_vencimiento(prestamo, dias):
    """Retrocede el primer corte para simular que el préstamo envejeció."""
    corte = timezone.localdate() - timedelta(days=dias)
    Prestamo.objects.filter(pk=prestamo.pk).update(fecha_primer_corte=corte)
    prestamo.refresh_from_db()


class TestPrecedenciaAntePago:
    def test_abono_por_debajo_del_interes_minimo_se_rechaza(self, auth_client, cliente, crear_fondo):
        """Aunque la mora sea exigible, el abono mínimo es el interés vencido."""
        prestamo = _crear(cliente, crear_fondo(), dias=30)  # mora 130.00

        res = auth_client.post(
            PAGO_URL.format(id=prestamo.id),
            {'monto': '130.00', 'fecha_pago': str(timezone.localdate()), 'metodo_pago': 'EFECTIVO'},
            format='json',
        )

        assert res.status_code == 400
        assert 'interés mínimo' in str(res.data)

    def test_la_mora_se_cobra_antes_que_el_interes(self, auth_client, cliente, crear_fondo):
        prestamo = _crear(cliente, crear_fondo(), dias=30)

        res = auth_client.post(
            PAGO_URL.format(id=prestamo.id),
            {'monto': '553.62', 'fecha_pago': str(timezone.localdate()), 'metodo_pago': 'EFECTIVO'},
            format='json',
        )

        assert res.status_code == 201
        # Mora 130.00 primero; el resto cubre interés corriente (2 cortes: 553.62).
        assert res.data['aplicacion_mora'] == '130.00'
        assert res.data['aplicacion_interes'] == '423.62'
        assert res.data['aplicacion_capital'] == '0.00'

    def test_abono_menor_que_la_deuda_se_trunca_a_mora_e_interes(self, auth_client, cliente, crear_fondo):
        prestamo = _crear(cliente, crear_fondo(), dias=30)

        res = auth_client.post(
            PAGO_URL.format(id=prestamo.id),
            {'monto': '1000.00', 'fecha_pago': str(timezone.localdate()), 'metodo_pago': 'EFECTIVO'},
            format='json',
        )

        assert res.status_code == 201
        # Primero mora 130.00, luego interés corriente 553.62, el resto a capital.
        assert res.data['aplicacion_mora'] == '130.00'
        assert res.data['aplicacion_interes'] == '553.62'
        assert res.data['aplicacion_capital'] == '316.38'

    def test_el_preview_coincide_con_lo_asentado(self, auth_client, cliente, crear_fondo):
        prestamo = _crear(cliente, crear_fondo(), dias=30)
        payload = {'monto': '1500.00', 'fecha_pago': str(timezone.localdate()), 'metodo_pago': 'EFECTIVO'}

        preview = auth_client.post(
            f'/api/prestamos/{prestamo.id}/preview_pago/', payload, format='json')
        cobro = auth_client.post(PAGO_URL.format(id=prestamo.id), payload, format='json')

        assert preview.data['aplicacion_mora'] == cobro.data['aplicacion_mora']
        assert preview.data['aplicacion_interes'] == cobro.data['aplicacion_interes']
        assert preview.data['aplicacion_capital'] == cobro.data['aplicacion_capital']
        assert preview.data['mora_insoluto'] == '130.00'
        assert preview.data['detalle_mora']['dias_mora'] == 26

    def test_el_pago_persiste_el_dia_de_mora_consumido(self, auth_client, cliente, crear_fondo):
        prestamo = _crear(cliente, crear_fondo(), dias=30)

        auth_client.post(
            PAGO_URL.format(id=prestamo.id),
            {'monto': '1500.00', 'fecha_pago': str(timezone.localdate()), 'metodo_pago': 'EFECTIVO'},
            format='json',
        )

        prestamo.refresh_from_db()
        assert prestamo.dias_mora == 26
        assert prestamo.mora_acumulada == Decimal('130.00')
        # La mora quedó cubierta por el abono.
        assert mora_pendiente(prestamo) == Decimal('0.00')


class TestEstadoSincronizado:
    @pytest.mark.parametrize('dias,esperado', [
        (0, Prestamo.Estado.VIGENTE),
        (3, Prestamo.Estado.EN_GRACIA),
        (12, Prestamo.Estado.EN_MORA),
    ])
    def test_el_estado_persistido_refleja_el_atraso(self, cliente, crear_fondo, dias, esperado):
        prestamo = _crear(cliente, crear_fondo(), dias=dias)

        detalle = actualizar_mora_prestamo(prestamo)

        prestamo.refresh_from_db()
        assert prestamo.estado == esperado
        assert detalle['estado'] == esperado

    def test_un_pago_al_dia_no_marca_mora(self, auth_client, cliente, crear_fondo):
        """Regresión: los cortes pagados no cuentan como atraso."""
        prestamo = _crear(cliente, crear_fondo(), dias=60)

        # Paga 5 cuotas completas a tiempo.
        for mes in range(5):
            fecha = prestamo.fecha_primer_corte + timedelta(days=30 * mes)
            res = auth_client.post(
                PAGO_URL.format(id=prestamo.id),
                {'monto': '1845.98', 'fecha_pago': str(fecha), 'metodo_pago': 'EFECTIVO'},
                format='json',
            )
            assert res.status_code == 201, res.data
            assert res.data['aplicacion_mora'] == '0.00'

        prestamo.refresh_from_db()
        assert prestamo.estado == Prestamo.Estado.VIGENTE
        assert prestamo.mora_acumulada == Decimal('0.00')


class TestComandoActualizarMora:
    def test_comando_contabiliza_todos_los_prestamos(self, cliente, crear_fondo, capsys):
        from django.core.management import call_command

        fondo = crear_fondo()
        _crear(cliente, fondo, dias=2)
        _crear(cliente, fondo, dias=30)

        call_command('actualizar_mora')

        salida = capsys.readouterr().out
        assert '1 en mora' in salida
        assert '1 en gracia' in salida
        assert Prestamo.objects.filter(estado=Prestamo.Estado.EN_MORA).count() == 1

    def test_dry_run_no_escribe(self, cliente, crear_fondo, capsys):
        from django.core.management import call_command

        prestamo = _crear(cliente, crear_fondo(), dias=30)

        call_command('actualizar_mora', '--dry-run')

        prestamo.refresh_from_db()
        assert prestamo.mora_acumulada == Decimal('0.00')
        assert prestamo.estado == Prestamo.Estado.VIGENTE
        assert '[dry-run]' in capsys.readouterr().out


class TestMoraNoGenerada:
    def test_mora_no_persistida_es_cero_si_ya_se_contabilizo(self, cliente, crear_fondo):
        prestamo = _crear(cliente, crear_fondo(), dias=9)
        actualizar_mora_prestamo(prestamo)
        prestamo.refresh_from_db()

        assert mora_generada_no_persistida(prestamo) == Decimal('0.00')
        assert mora_pendiente(prestamo) == Decimal('25.00')
