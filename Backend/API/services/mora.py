"""Generador de mora por atraso (Art. 3180 Código Civil / Ley 1146).

Reglas implementadas:

- **Gracia:** los primeros `DIAS_GRACIA` días vencidos NO generan mora.
- **Tasa:** si el préstamo no define `tasa_mora`, se aplica la mitad de la tasa
  de interés pactada, que es el recargo moratorio legal por defecto
  (Art. 3184 Código Civil: "la mitad del interés pactado"). La tasa mensual se
  prorratea a día con base de 30 días.
- **Base:** la mora se genera sobre el **saldo insoluto** del préstamo, nunca
  sobre intereses vencidos (prohibición de anatocismo, Ley 176).
- **Acumulación:** los días se acumulan en `Prestamo.dias_mora` y el importe en
  `Prestamo.mora_acumulada`. El cálculo es idempotente: volver a ejecutarlo el
  mismo día no duplica cargos, y un pago no reinicia el contador de días.
- **Precedencia:** la mora pendiente se cobra **antes** que el interés corriente
  (ver `services/pagos.py::_prelacion`).

El módulo es puro por defecto (`persistir=False`): el preview de la interfaz usa
la misma aritmética que el asiento real. La persistencia ocurre al cobrar un
pago o al correr el comando `manage.py actualizar_mora`.
"""
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Sum

from ..models import Prestamo
from .estados import DIAS_GRACIA, dias_atraso

# Base de cálculo de la tasa diaria sobre la tasa mensual pactada.
DIAS_MES = Decimal('30')


def _cantidad(valor) -> Decimal:
    return Decimal('0.00') if valor is None else Decimal(str(valor))


def tasa_mora_mensual(prestamo) -> Decimal:
    """Tasa mensual de mora efectiva.

    `Prestamo.tasa_mora` si se configuró; si no, la mitad de la tasa pactada.
    """
    if getattr(prestamo, 'tasa_mora', None) is not None:
        return _cantidad(prestamo.tasa_mora).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)
    return (_cantidad(prestamo.tasa_interes) / 2).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)


def tasa_mora_diaria(prestamo) -> Decimal:
    """Tasa diaria de mora (tasa mensual / 30)."""
    return (tasa_mora_mensual(prestamo) / DIAS_MES).quantize(
        Decimal('0.00000001'), rounding=ROUND_HALF_UP
    )


def dias_mora_facturables(prestamo, hoy=None, proyeccion=None) -> int:
    """Días vencidos que ya superan la gracia (0 si está al día o cancelado)."""
    atraso = dias_atraso(prestamo, hoy=hoy, proyeccion=proyeccion)
    return max(0, atraso - DIAS_GRACIA)


def mora_generada_no_persistida(prestamo, hoy=None, proyeccion=None) -> Decimal:
    """Mora de los días transcurridos que aún no se han contabilizado.

    Es la diferencia entre los días que *deberían* estar facturados y los días
    que ya se contabilizaron en `Prestamo.dias_mora`, de modo que el cálculo es
    idempotente y no depende de la fecha del último cálculo.
    """
    dias_objetivo = dias_mora_facturables(prestamo, hoy=hoy, proyeccion=proyeccion)
    dias_nuevos = dias_objetivo - int(prestamo.dias_mora or 0)
    if dias_nuevos <= 0:
        return Decimal('0.00')

    saldo = _cantidad(prestamo.saldo_insoluto)
    if saldo <= 0:
        return Decimal('0.00')

    mora = (saldo * tasa_mora_diaria(prestamo) * dias_nuevos).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )
    return max(Decimal('0.00'), mora)


def mora_aplicada(prestamo) -> Decimal:
    """Mora ya cubierta por abonos (`Pago.aplicacion_mora`)."""
    total = prestamo.pagos.aggregate(total=Sum('aplicacion_mora'))['total']
    return _cantidad(total)


def detalle_mora(prestamo, hoy=None, proyeccion=None, persistir=False):
    """Detalle completo del recargo por mora a una fecha.

    Args:
        persistir: si es True guarda `dias_mora`, `mora_acumulada`,
            `fecha_ultimo_calculo_mora` y el estado efectivo del préstamo.

    Returns:
        dict con tasa, días facturados, mora generada, aplicada y pendiente.
    """
    from django.utils import timezone

    if prestamo.estado == Prestamo.Estado.CANCELADO:
        return {
            'tasa_mora_mensual': tasa_mora_mensual(prestamo),
            'tasa_mora_diaria': tasa_mora_diaria(prestamo),
            'dias_mora': 0,
            'dias_gracia': DIAS_GRACIA,
            'mora_acumulada': Decimal('0.00'),
            'mora_no_persistida': Decimal('0.00'),
            'mora_aplicada': mora_aplicada(prestamo),
            'mora_pendiente': Decimal('0.00'),
        }

    hoy = hoy or timezone.localdate()
    dias_objetivo = dias_mora_facturables(prestamo, hoy=hoy, proyeccion=proyeccion)
    dias_nuevos = max(0, dias_objetivo - int(prestamo.dias_mora or 0))
    no_persistida = mora_generada_no_persistida(prestamo, hoy=hoy, proyeccion=proyeccion)
    acumulada = _cantidad(prestamo.mora_acumulada) + no_persistida
    aplicada = mora_aplicada(prestamo)
    pendiente = max(Decimal('0.00'), acumulada - aplicada)

    if persistir:
        prestamo.dias_mora = dias_objetivo
        prestamo.mora_acumulada = acumulada
        prestamo.fecha_ultimo_calculo_mora = hoy

    return {
        'tasa_mora_mensual': tasa_mora_mensual(prestamo),
        'tasa_mora_diaria': tasa_mora_diaria(prestamo),
        'dias_mora': dias_objetivo,
        'dias_nuevos': dias_nuevos,
        'dias_gracia': DIAS_GRACIA,
        'mora_acumulada': acumulada,
        'mora_no_persistida': no_persistida,
        'mora_aplicada': aplicada,
        'mora_pendiente': pendiente,
    }


def mora_pendiente(prestamo, hoy=None, proyeccion=None) -> Decimal:
    """Mora exigible a una fecha (sin escribir en la base de datos)."""
    return detalle_mora(prestamo, hoy=hoy, proyeccion=proyeccion)['mora_pendiente']


def estado_por_mora(prestamo, hoy=None, proyeccion=None) -> str:
    """Estado efectivo a persistir según el atraso calculado.

    A diferencia de `estados.estado_efectivo`, este helper sí reclasifica un
    préstamo `VIGENTE` que ya superó la gracia, porque la mora es exigible.
    `CANCELADO` nunca se toca.
    """
    if prestamo.estado == Prestamo.Estado.CANCELADO:
        return Prestamo.Estado.CANCELADO

    atraso = dias_atraso(prestamo, hoy=hoy, proyeccion=proyeccion)
    if atraso <= 0:
        return Prestamo.Estado.VIGENTE
    if atraso <= DIAS_GRACIA:
        return Prestamo.Estado.EN_GRACIA
    return Prestamo.Estado.EN_MORA


def actualizar_mora_prestamo(prestamo, hoy=None, proyeccion=None, sincronizar_estado=True):
    """Contabiliza la mora y opcionalmente sincroniza el estado del préstamo.

    Pensado para el comando diario `manage.py actualizar_mora` y para cerrar el
    cálculo al asentar un pago.

    Importante: debe invocarse ANTES de amortizar capital, porque la mora se
    devenga sobre el saldo insoluto vigente.     Si se llamara después, se
    contabilizaría sobre un saldo ya reducido y el recargo persistido no
    coincidiría con el que se leyó al cobrador en el preview.

    Args:
        sincronizar_estado: si es False solo persiste `dias_mora`,
            `mora_acumulada` y `fecha_ultimo_calculo_mora`, dejando el estado
            intacto (caso del asiento, que recalcula el estado al final).
    Returns:
        dict con el detalle de mora y True si el préstamo cambió.
    """
    from django.utils import timezone

    hoy = hoy or timezone.localdate()
    detalle = detalle_mora(prestamo, hoy=hoy, proyeccion=proyeccion, persistir=True)

    if not sincronizar_estado:
        prestamo.save(update_fields=['dias_mora', 'mora_acumulada',
                                     'fecha_ultimo_calculo_mora', 'actualizado_en'])
        detalle['estado'] = prestamo.estado
        detalle['cambio_estado'] = False
        return detalle

    estado = estado_por_mora(prestamo, hoy=hoy, proyeccion=proyeccion)
    cambio = estado != prestamo.estado
    prestamo.estado = estado
    prestamo.save(update_fields=['dias_mora', 'mora_acumulada', 'fecha_ultimo_calculo_mora',
                                 'estado', 'actualizado_en'])
    detalle['estado'] = estado
    detalle['cambio_estado'] = cambio
    return detalle
