"""Pagaré legal CAVI (TK23).

Arma el contexto de la plantilla `API/templates/pagare.html` y expone el HTML ya
renderizado, para que la UI pueda previsualizarlo e imprimirlo aunque el motor
PDF no esté disponible en el equipo.

Decisiones de diseño:

- El importe se escribe **en letras** porque un pagaré exigible necesita la
  cantidad literal; el número solo no es oponible frente al deudor.
- El detalle por fondos (`porcentaje_pi`) **nunca** se imprime en el pagaré,
  ni siquiera para ADMINISTRADOR: es información interna de la cooperativa y el
  título valor no la necesita (restricción de privacidad del Sprint 1).
"""
from decimal import Decimal

from django.template.loader import render_to_string
from django.utils import timezone

from .amortizacion import generar_proyeccion
from .estados import DIAS_GRACIA
from .mora import tasa_mora_mensual

UNIDADES = [
    'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
    'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés',
    'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho',
    'veintinueve',
]
DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta',
           'setenta', 'ochenta', 'noventa']
CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
            'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

VARIANTES = {
    'MENSUAL': 'mensual',
    'QUINCENAL': 'quincenal',
}


def _centenas(n: int) -> str:
    """Convierte 0-999 a palabras."""
    if n == 0:
        return ''
    if n == 100:
        return 'cien'
    if n < 30:
        return UNIDADES[n]
    if n < 100:
        decenas, resto = divmod(n, 10)
        texto = DECENAS[decenas]
        return f'{texto} y {UNIDADES[resto]}' if resto else texto
    centenas, resto = divmod(n, 100)
    texto = CENTENAS[centenas]
    return f'{texto} {_centenas(resto)}'.strip() if resto else texto


def entero_a_letras(n: int) -> str:
    """Entero a palabras en español, hasta billones."""
    n = int(n)
    if n < 1000:
        return _centenas(n) or 'cero'
    if n < 1_000_000:
        miles, resto = divmod(n, 1000)
        prefijo = 'mil' if miles == 1 else f'{_centenas(miles)} mil'
        return f'{prefijo} {_centenas(resto)}'.strip() if resto else prefijo
    millones, resto = divmod(n, 1_000_000)
    prefijo = 'un millón' if millones == 1 else f'{entero_a_letras(millones)} millones'
    return f'{prefijo} {entero_a_letras(resto)}'.strip() if resto else prefijo


def numero_a_letras(monto) -> str:
    """Importe con centavos en español: 'cincuenta mil 00/100'."""
    valor = Decimal(str(monto)).quantize(Decimal('0.01'))
    entero = int(valor)
    centavos = int((valor - entero) * 100)
    return f'{entero_a_letras(entero)} {centavos:02d}/100'


def _moneda(monto) -> str:
    return f'C${Decimal(str(monto)):,.2f}'


def _porcentaje(tasa) -> str:
    return f'{Decimal(str(tasa)) * 100:.2f}%'


def contexto_pagare(prestamo, usados_por: str = ''):
    """Construye el contexto de la plantilla del pagaré.

    Args:
        prestamo: instancia con `cliente` cargado.
        usados_por: usuario que emite el documento (aparece en la aceptación).

    Returns:
        dict listo para `render_to_string('pagare.html', ...)`.
    """
    from .pdf import VARIANTE_PDF_A, es_pdf_a, motor_descripcion

    proyeccion = generar_proyeccion(prestamo)
    cuota = proyeccion['periodos'][0]['cuota'] if proyeccion['periodos'] else Decimal('0.00')
    periodicidad = VARIANTES.get(prestamo.periodicidad, prestamo.periodicidad.lower())

    return {
        'prestamo': prestamo,
        'cliente': prestamo.cliente,
        'proyeccion': proyeccion,
        'numero_documento': f'CAVI-PAG-{prestamo.id:06d}',
        'lugar': 'Managua, República de Nicaragua',
        'fecha_emision': timezone.localdate().strftime('%d/%m/%Y'),
        'fecha_generacion': timezone.localtime().strftime('%d/%m/%Y %H:%M'),
        'monto_total_texto': _moneda(prestamo.monto_principal),
        'monto_letras': numero_a_letras(prestamo.monto_principal),
        'plazo_texto': f'{prestamo.plazo_meses} meses',
        'periodicidad_texto': periodicidad,
        'tasa_interes_texto': _porcentaje(prestamo.tasa_interes),
        'tasa_mora_texto': _porcentaje(tasa_mora_mensual(prestamo)),
        'cuota_texto': _moneda(cuota),
        'dias_gracia': DIAS_GRACIA,
        'usados_por': usados_por or 'Administración',
        'variante_pdf': VARIANTE_PDF_A if es_pdf_a() else motor_descripcion(),
    }


def html_pagare(prestamo, usados_por: str = '') -> str:
    """Pagaré en HTML, para previsualizar o imprimir sin motor PDF."""
    return render_to_string('pagare.html', contexto_pagare(prestamo, usados_por))


def pdf_pagare(prestamo, usados_por: str = '') -> bytes:
    """Pagaré en bytes de PDF usando el motor activo del sistema."""
    from .pdf import render_pdf

    return render_pdf(html_pagare(prestamo, usados_por))
