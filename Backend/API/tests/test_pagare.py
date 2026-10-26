"""Pagaré legal en PDF/A (CAVI-TK22, TK23 y TK25, Sprint 3).

Verifica el servicio de PDF enchufable (WeasyPrint con PDF/A en Linux, xhtml2pdf
en Windows sin GTK), el render del documento legal y el endpoint de descarga.
"""
from decimal import Decimal

import pytest
from django.utils import timezone

from API.models import Prestamo
from API.services.pagare import (
    entero_a_letras,
    html_pagare,
    numero_a_letras,
    pdf_pagare,
)
from API.services.pdf import (
    MotorPdfNoDisponible,
    es_pdf_a,
    motor_descripcion,
    motor_pdf,
    nombre_archivo_pagare,
    render_pdf,
)

pytestmark = pytest.mark.django_db

PAGARE_URL = '/api/prestamos/{id}/pagare/'


@pytest.fixture
def prestamo(db, cliente):
    corte = timezone.localdate()
    return Prestamo.objects.create(
        cliente=cliente,
        monto_principal=Decimal('50000.00'),
        saldo_insoluto=Decimal('50000.00'),
        tasa_interes=Decimal('0.0250'),
        plazo_meses=12,
        periodicidad='MENSUAL',
        fecha_desembolso=corte,
        fecha_primer_corte=corte,
    )


class TestMotorPdf:
    def test_hay_un_motor_disponible(self):
        assert motor_pdf() in ('weasyprint', 'xhtml2pdf')

    def test_el_motor_activo_es_coherente_con_el_pdf_a(self):
        if motor_pdf() == 'weasyprint':
            assert es_pdf_a() is True
            assert 'PDF/A' in motor_descripcion()
        else:
            assert es_pdf_a() is False
            assert 'sin PDF/A' in motor_descripcion()

    def test_renderiza_html_simple_a_pdf(self):
        contenido = render_pdf('<html><body><h1>Pagaré</h1></body></html>')
        assert contenido.startswith(b'%PDF')

    def test_sin_motores_el_error_es_explicito(self, monkeypatch):
        import API.services.pdf as pdf_service

        monkeypatch.setattr(pdf_service, 'motor_pdf', lambda: None)
        with pytest.raises(MotorPdfNoDisponible):
            pdf_service.render_pdf('<p>irrelevante</p>')

    def test_nombre_de_archivo_sin_acentos(self, cliente):
        cliente.cedula = '001-110220-3'
        assert nombre_archivo_pagare(cliente) == 'Pagare-001-110220-3.pdf'


class TestImporteEnLetras:
    @pytest.mark.parametrize(
        'entero,esperado',
        [
            (0, 'cero'),
            (15, 'quince'),
            (21, 'veintiuno'),
            (100, 'cien'),
            (115, 'ciento quince'),
            (500, 'quinientos'),
            (1000, 'mil'),
            (15000, 'quince mil'),
            (50000, 'cincuenta mil'),
            (100000, 'cien mil'),
            (1000000, 'un millón'),
            (2500000, 'dos millones quinientos mil'),
        ],
    )
    def test_entero_a_letras(self, entero, esperado):
        assert entero_a_letras(entero) == esperado

    def test_numero_con_centavos(self):
        assert numero_a_letras(Decimal('50000.00')) == 'cincuenta mil con cero centavos (00/100)'
        assert numero_a_letras(Decimal('1234.50')) == 'mil doscientos treinta y cuatro con cincuenta centavos (50/100)'
        assert numero_a_letras(Decimal('100.05')) == 'cien con cinco centavos (05/100)'


class TestPlantillaPagare:
    def test_incluye_las_clausulas_legales(self, prestamo):
        html = html_pagare(prestamo, usados_por='Test Admin')

        assert 'PAGARÉ' in html
        assert 'cincuenta mil con cero centavos (00/100)' in html  # importe en letras con decimales
        assert 'C$50,000.00' in html                    # importe numérico
        assert 'Juan Perez' in html                     # deudor
        assert '001-111222-3' in html                   # cédula
        assert '2.50% mensual' in html                  # tasa pactada
        assert '1.25% mensual' in html                  # mora = mitad de la tasa
        assert '4 días de gracia' in html
        assert 'mora, interés corriente' in html        # prelación Art. 3180
        assert 'Ley N.º 176' in html                    # anatocismo
        assert 'Test Admin' in html                     # aceptación

    def test_no_filtra_el_detalle_por_fondos(self, prestamo, crear_fondo):
        """El pagaré nunca expone el porcentaje Pi (privacidad Sprint 1)."""
        html = html_pagare(prestamo)
        assert 'porcentaje_pi' not in html
        assert 'Pi' not in html.replace('Pagaré', '')

    def test_incluye_la_tabla_de_cuotas(self, prestamo):
        html = html_pagare(prestamo)
        assert 'Saldo insoluto' in html
        assert html.count('<tr>') >= prestamo.plazo_meses  # encabezado + 12 cortes

    def test_es_documento_autocontenido(self, prestamo):
        html = html_pagare(prestamo)
        assert '<style>' in html
        assert 'stylesheet' not in html  # sin CSS externo

    def test_genera_pdf_real(self, prestamo):
        import io
        from pypdf import PdfReader

        contenido = pdf_pagare(prestamo, usados_por='Test Admin')
        assert contenido.startswith(b'%PDF')
        assert len(contenido) > 2000
        reader = PdfReader(io.BytesIO(contenido))
        assert len(reader.pages) == 2, f"Se esperaban exactamente 2 páginas pero se generaron {len(reader.pages)}"


class TestEndpointPagare:
    def test_requiere_autenticacion(self, api_client, prestamo):
        assert api_client.get(PAGARE_URL.format(id=prestamo.id)).status_code == 401

    def test_descarga_pdf_con_nombre_de_archivo(self, auth_client, prestamo):
        respuesta = auth_client.get(PAGARE_URL.format(id=prestamo.id))

        assert respuesta.status_code == 200
        assert respuesta['Content-Type'] == 'application/pdf'
        assert 'filename="Pagare-001-111222-3.pdf"' in respuesta['Content-Disposition']
        assert respuesta['X-PDF-Variante'] in ('PDF/A-2b', 'PDF-1.4')
        assert respuesta.content.startswith(b'%PDF')

    def test_formato_html_para_imprimir_desde_el_navegador(self, auth_client, prestamo):
        respuesta = auth_client.get(PAGARE_URL.format(id=prestamo.id) + '?formato=html')

        assert respuesta.status_code == 200
        assert respuesta['Content-Type'] == 'text/html'
        assert 'PAGARÉ' in respuesta.content.decode('utf-8')

    def test_el_cobrador_puede_imprimir_el_pagare(self, api_client, prestamo, admin_user):
        """COBRANZA descarga el pagaré para entregarlo al cliente."""
        api_client.force_authenticate(user=admin_user)
        respuesta = api_client.get(PAGARE_URL.format(id=prestamo.id))
        assert respuesta.status_code == 200

    def test_prestamo_inexistente_responde_404(self, auth_client, prestamo):
        assert auth_client.get('/api/prestamos/999999/pagare/').status_code == 404
