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
        assert res.data['codigo_comprobante'].startswith('REC-')
        assert 'codigo_seguridad' in res.data
        assert res.data['estado'] == 'VALIDO'

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
        # Al 2027-04-01 el corte 1 lleva 178 días fuera de gracia:
        # mora = 10000 × (1.5%/30) × 178 = 890.00 (Art. 3180).
        res = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('20000.00', '2027-04-01'), format='json')
        assert res.status_code == 201
        assert res.data['aplicacion_mora'] == '890.00'
        assert res.data['aplicacion_interes'] == '1075.86'
        assert res.data['aplicacion_capital'] == '10000.00'
        assert res.data['exceso_no_aplicado'] == '8034.14'
        prestamo_vigente.refresh_from_db()
        assert str(prestamo_vigente.saldo_insoluto) == '0.00'
        assert prestamo_vigente.estado == Prestamo.Estado.CANCELADO

    def test_pago_sobre_prestamo_cancelado_es_rechazado(self, auth_client, prestamo_vigente):
        auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('20000.00', '2027-04-01'), format='json')
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
        # 2027-04-01: 178 días fuera de gracia → mora 890.00; deuda total
        # 10000.00 + 1075.86 + 890.00 = 11965.86.
        res = auth_client.post(PAGO_URL.format(id=prestamo.id), pago_payload('11965.86', '2027-04-01'), format='json')
        assert res.status_code == 201
        assert res.data['aplicacion_mora'] == '890.00'
        assert res.data['exceso_no_aplicado'] == '0.00'

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
        assert res.data['codigo_comprobante'].startswith('REC-')
        assert 'codigo_seguridad' in res.data
        assert res.data['estado'] == 'VALIDO'
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

    def test_anular_recibo_revierte_capital_y_fondos(self, auth_client, prestamo_vigente):
        from API.models import Fondo, MovimientoFondo, GananciaAdministracion, BitacoraActividad

        # 0. Registrar estado inicial del fondo antes del cobro
        part_fondo = prestamo_vigente.fondos_detalle.first().fondo
        part_fondo.refresh_from_db()
        saldo_fondo_inicial = part_fondo.saldo_disponible
        ganancias_fondo_inicial = part_fondo.ganancias_acumuladas

        # 1. Asentar pago
        creado = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('1845.98'), format='json')
        pago_id = creado.data['id']
        prestamo_vigente.refresh_from_db()
        assert str(prestamo_vigente.saldo_insoluto) == '8454.02'

        # Verificar que el pago impactó positivamente al fondo
        part_fondo.refresh_from_db()
        assert part_fondo.saldo_disponible > saldo_fondo_inicial
        assert part_fondo.ganancias_acumuladas > ganancias_fondo_inicial
        assert GananciaAdministracion.objects.filter(pago_id=pago_id).exists()

        # 2. Anular pago con motivo formal
        motivo = 'Pago asentado por error de digitación en comprobante'
        res_anular = auth_client.post(f'/api/pagos/{pago_id}/anular/', {'motivo': motivo}, format='json')
        assert res_anular.status_code == 200
        assert res_anular.data['recibo']['estado'] == 'ANULADO'
        assert res_anular.data['recibo']['motivo_anulacion'] == motivo

        # 3. Verificar reversión en préstamo
        prestamo_vigente.refresh_from_db()
        assert str(prestamo_vigente.saldo_insoluto) == '10000.00'

        # 4. Verificar reversión en la base de datos para Fondos Familiares
        part_fondo.refresh_from_db()
        assert part_fondo.saldo_disponible == saldo_fondo_inicial
        assert part_fondo.ganancias_acumuladas == ganancias_fondo_inicial

        # 5. Verificar creación del movimiento de reverso de fondos
        mov_reverso = MovimientoFondo.objects.filter(
            pago_id=pago_id,
            tipo=MovimientoFondo.TipoMovimiento.REVERSO_PAGO
        ).first()
        assert mov_reverso is not None
        assert mov_reverso.saldo_posterior == saldo_fondo_inicial
        assert motivo in mov_reverso.descripcion

        # 6. Verificar eliminación de la ganancia administrativa
        assert not GananciaAdministracion.objects.filter(pago_id=pago_id).exists()

        # 7. Verificar bitácora de auditoría inmutable
        bitacora = BitacoraActividad.objects.filter(pago_id=pago_id, codigo_evento='PAG_ANULADO').first()
        assert bitacora is not None
        assert bitacora.nivel_severidad == 'CRITICO'

    def test_anular_recibo_motivo_corto_rechazado(self, auth_client, prestamo_vigente):

        creado = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('1845.98'), format='json')
        pago_id = creado.data['id']
        res_anular = auth_client.post(f'/api/pagos/{pago_id}/anular/', {'motivo': 'error'}, format='json')
        assert res_anular.status_code == 400
        assert 'motivo' in res_anular.data

    def test_auditoria_usuario_desbloqueado_y_bloqueado(self, auth_client):
        from API.models import Usuario, BitacoraActividad
        u = Usuario.objects.create_user(
            correo='inactivo@cavi.com',
            password='Password123!',
            nombre_completo='Usuario Inactivo',
            activo=False
        )

        # 1. Desbloquear usuario
        res = auth_client.patch(f'/api/usuarios/{u.id}/', {'activo': True}, format='json')
        assert res.status_code == 200
        u.refresh_from_db()
        assert u.activo is True

        bitacora_desbloqueo = BitacoraActividad.objects.filter(
            modulo='SEGURIDAD',
            codigo_evento='USU_DESBLOQUEADO'
        ).first()
        assert bitacora_desbloqueo is not None
        assert bitacora_desbloqueo.nivel_severidad == 'ADVERTENCIA'
        assert 'desbloqueado' in bitacora_desbloqueo.observaciones.lower()
        assert bitacora_desbloqueo.diferencial_cambios['activo']['antes'] is False
        assert bitacora_desbloqueo.diferencial_cambios['activo']['despues'] is True

        # 2. Bloquear usuario
        res_bloqueo = auth_client.patch(f'/api/usuarios/{u.id}/', {'activo': False}, format='json')
        assert res_bloqueo.status_code == 200
        bitacora_bloqueo = BitacoraActividad.objects.filter(
            modulo='SEGURIDAD',
            codigo_evento='USU_BLOQUEADO'
        ).first()
        assert bitacora_bloqueo is not None
        assert bitacora_bloqueo.nivel_severidad == 'ADVERTENCIA'

    def test_recibo_html_retorna_200_con_formato_institucional(self, auth_client, prestamo_vigente):
        creado = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('1845.98'), format='json')
        pago_id = creado.data['id']
        codigo = creado.data['codigo_comprobante']

        res = auth_client.get(f'/api/pagos/{pago_id}/recibo_html/')
        assert res.status_code == 200
        assert 'text/html' in res['Content-Type']
        contenido = res.content.decode('utf-8')
        assert codigo in contenido
        assert 'RECIBO OFICIAL DE COBRO' in contenido
        assert 'Art. 3180' in contenido
        assert 'Prestatario / Pagador Conforme' in contenido
        assert 'Cajero Receptor' in contenido

    def test_recibo_html_anulado_muestra_marca_de_agua_y_aviso(self, auth_client, prestamo_vigente):
        creado = auth_client.post(PAGO_URL.format(id=prestamo_vigente.id), pago_payload('1845.98'), format='json')
        pago_id = creado.data['id']

        # Anular pago
        auth_client.post(f'/api/pagos/{pago_id}/anular/', {'motivo': 'Error en digitación de comprobante en caja'}, format='json')

        res = auth_client.get(f'/api/pagos/{pago_id}/recibo_html/')
        assert res.status_code == 200
        contenido = res.content.decode('utf-8')
        assert 'marca-agua-anulado' in contenido
        assert 'banner-anulado' in contenido
        assert 'COMPROBANTE OFICIAL ANULADO' in contenido