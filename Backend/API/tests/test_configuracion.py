"""Pruebas para ConfiguracionSistema y políticas dinámicas del sistema."""
import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from API.models import ConfiguracionSistema, Prestamo

pytestmark = pytest.mark.django_db

CONFIG_URL = '/api/configuracion/'


@pytest.fixture
def cobranza_user(db):
    Usuario = get_user_model()
    return Usuario.objects.create_user(
        correo='cobranza@cavi.local',
        nombre_completo='Agente Cobranza',
        password='test12345',
        rol='COBRANZA',
    )


class TestConfiguracionSistema:
    def test_obtener_configuracion_admin(self, auth_client):
        res = auth_client.get(CONFIG_URL)
        assert res.status_code == 200
        assert 'modo_estricto' in res.data
        assert 'permitir_superar_usura' in res.data
        assert res.data['dias_gracia'] == 4

    def test_actualizar_configuracion_admin(self, auth_client):
        res = auth_client.post(CONFIG_URL, {
            'permitir_superar_usura': True,
            'dias_gracia': 7,
            'permitir_plazo_indefinido': True,
        }, format='json')
        assert res.status_code == 200
        assert res.data['permitir_superar_usura'] is True
        assert res.data['dias_gracia'] == 7

        config = ConfiguracionSistema.get_solo()
        assert config.permitir_superar_usura is True
        assert config.dias_gracia == 7

    def test_cobranza_no_puede_modificar_configuracion(self, api_client, cobranza_user):
        api_client.force_authenticate(user=cobranza_user)
        res = api_client.post(CONFIG_URL, {'dias_gracia': 10}, format='json')
        assert res.status_code == 403

    def test_credito_historico_con_tasa_10_porciento(self, auth_client, cliente, crear_fondo):
        # Con usura habilitada para digitalización histórica
        auth_client.post(CONFIG_URL, {'permitir_superar_usura': True}, format='json')

        fondo = crear_fondo(capital='20000.00')
        payload = {
            'cliente': cliente.id,
            'monto_principal': '10000.00',
            'tasa_interes': '0.1000',  # 10% mensual
            'plazo_meses': 6,
            'periodicidad': 'MENSUAL',
            'fecha_desembolso': '2026-09-01',
            'fecha_primer_corte': '2026-10-01',
            'fondos_detalle': [
                {'fondo': fondo.id, 'monto_aportado': '10000.00', 'porcentaje_pi': '1.0000'}
            ],
        }
        res = auth_client.post('/api/prestamos/', payload, format='json')
        assert res.status_code == 201
        assert res.data['tasa_interes'] == '0.1000'

    def test_prestamo_plazo_indefinido_cuota_interes_sobre_saldo(self, auth_client, cliente, crear_fondo):
        auth_client.post(CONFIG_URL, {
            'permitir_superar_usura': True,
            'permitir_plazo_indefinido': True,
        }, format='json')

        fondo = crear_fondo(capital='20000.00')
        payload = {
            'cliente': cliente.id,
            'monto_principal': '10000.00',
            'tasa_interes': '0.1000',  # 10% mensual sobre saldo
            'plazo_meses': 0,          # Indefinido
            'periodicidad': 'MENSUAL',
            'fecha_desembolso': '2026-09-01',
            'fecha_primer_corte': '2026-10-01',
            'fondos_detalle': [
                {'fondo': fondo.id, 'monto_aportado': '10000.00', 'porcentaje_pi': '1.0000'}
            ],
        }
        res = auth_client.post('/api/prestamos/', payload, format='json')
        assert res.status_code == 201
        prestamo_id = res.data['id']

        # Proyección: la cuota debe ser 1000.00 (10% de 10,000.00)
        res_proy = auth_client.get(f'/api/prestamos/{prestamo_id}/amortizacion/')
        assert res_proy.status_code == 200
        assert res_proy.data['plazo_meses'] == 0
        assert len(res_proy.data['periodos']) >= 12
        primer_periodo = res_proy.data['periodos'][0]
        assert str(primer_periodo['cuota']) == '1000.00'
        assert str(primer_periodo['interes']) == '1000.00'
        assert str(primer_periodo['capital']) == '0.00'

    def test_simulacion_plazo_indefinido(self, auth_client):
        auth_client.post(CONFIG_URL, {'permitir_superar_usura': True}, format='json')

        res = auth_client.post('/api/prestamos/simular/', {
            'monto_principal': '5000.00',
            'tasa_interes': '0.1000',
            'plazo_meses': 0,
            'periodicidad': 'MENSUAL',
            'fecha_primer_corte': '2026-10-01',
        }, format='json')
        assert res.status_code == 200
        # Cuota estimada debe ser 500.00 (10% de 5000)
        assert str(res.data['cuota_estimada']) == '500.00'
