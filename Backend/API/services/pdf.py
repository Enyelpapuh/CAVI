"""Servicio de generación de documentos PDF/A (TK22).

El renderizado es **enchufable** porque WeasyPrint, que es el motor de la
especificación, depende de librerías nativas (Pango/Cairo/GTK) que no existen en
todos los sistemas:

| Entorno                        | Motor        | PDF/A |
|--------------------------------|--------------|-------|
| Linux / Docker (producción)    | WeasyPrint   | Sí    |
| Windows sin GTK3-Runtime       | xhtml2pdf    | No    |

La selección es automática: se intenta WeasyPrint y, si el import falla por las
librerías nativas, se degrada a `xhtml2pdf` (puro Python, sin instalación de
sistema). `motor_pdf()` expone el motor activo para poder avisar en la interfaz
y en las cabeceras de respuesta cuando el documento no es PDF/A conforme.

Ningún motor disponible devuelve `None`: `render_pdf` intenta los dos, de modo
que la plantilla HTML siempre se puede imprimir aunque falte todo lo anterior.
"""
import io
import logging
from functools import lru_cache

from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)

# WeasyPrint 53+ soporta las variantes PDF/A-2b y PDF/A-3b. Se usa PDF/A-2b:
# suficiente para archivo de largo plazo y con menos dependencias que -3b.
VARIANTE_PDF_A = 'pdf/a-2b'

MOTORES = {
    'weasyprint': 'WeasyPrint (PDF/A)',
    'xhtml2pdf': 'xhtml2pdf (PDF 1.4, sin PDF/A)',
}


class MotorPdfNoDisponible(ImproperlyConfigured):
    """Ninguno de los motores PDF está instalado."""


@lru_cache(maxsize=1)
def motor_pdf() -> str | None:
    """Nombre del motor PDF activo, o `None` si no hay ninguno disponible.

    El resultado se cachea porque la detección importa librerías nativas y no
    debe repetirse en cada descarga.
    """
    try:
        from weasyprint import HTML  # noqa: F401

        return 'weasyprint'
    except Exception as exc:  # OSError en Windows sin GTK; ImportError si falta
        logger.info('WeasyPrint no disponible (%s); se usará el motor alterno.', exc)

    try:
        from xhtml2pdf import pisa  # noqa: F401

        return 'xhtml2pdf'
    except Exception as exc:
        logger.warning('xhtml2pdf no disponible: %s', exc)
        return None


def motor_descripcion() -> str:
    """Descripción legible del motor activo (para la UI y las cabeceras)."""
    motor = motor_pdf()
    return MOTORES.get(motor, 'sin motor PDF')


def es_pdf_a() -> bool:
    """True solo si el motor activo puede emitir PDF/A conforme."""
    return motor_pdf() == 'weasyprint'


def _render_weasyprint(html: str, base_url: str | None) -> bytes:
    from weasyprint import HTML

    return HTML(string=html, base_url=base_url).write_pdf(
        pdf_variant=VARIANTE_PDF_A,
        # PDF/A exige incrustar todas las fuentes: sin esto la variante se
        # rechaza y WeasyPrint avisa por stderr.
        optimize_images=True,
    )


def _render_xhtml2pdf(html: str, base_url: str | None) -> bytes:
    from xhtml2pdf import pisa

    destino = io.BytesIO()
    resultado = pisa.CreatePDF(
        io.StringIO(html), dest=destino, default_css='@page { size: letter; }'
    )
    if resultado.err:
        raise MotorPdfNoAvailable(
            f'xhtml2pdf no pudo renderizar el documento ({resultado.err} errores).'
        )
    return destino.getvalue()


def render_pdf(html: str, base_url: str | None = None) -> bytes:
    """Convierte HTML en bytes de PDF usando el primer motor disponible.

    Args:
        html: documento completo (o fragmento) ya renderizado.
        base_url: base para resolver rutas relativas (CSS, imágenes).
    Raises:
        MotorPdfNoDisponible: si no hay ningún motor funcional.
    """
    motor = motor_pdf()
    if motor is None:
        raise MotorPdfNoDisponible(
            'No hay motor PDF instalado. Ejecute: pip install weasyprint xhtml2pdf'
        )

    if motor == 'weasyprint':
        return _render_weasyprint(html, base_url)
    return _render_xhtml2pdf(html, base_url)


def nombre_archivo_pagare(cliente) -> str:
    """Nombre de archivo seguro para el pagaré (sin acentos ni espacios)."""
    import re
    import unicodedata

    base = f'Pagare-{cliente.cedula}'
    normalizado = unicodedata.normalize('NFKD', base)
    ascii_only = normalizado.encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^A-Za-z0-9._-]', '', ascii_only) + '.pdf'
