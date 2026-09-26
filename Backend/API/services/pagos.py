"""Motor de imputación de pagos según Art. 3180 Código Civil.

Prelación obligatoria al recibir un abono insuficiente:
    1. Mora (recargos por atraso)
    2. Interés corriente (sobre saldo insoluto)
    3. Capital

Reglas de negocio:
- Se bloquea (HTTP 400) todo cobro menor al interés mínimo del ciclo vencido.
- Un abono que exceda la deuda total se trunca a la deuda; el exceso no se aplica.
- Al quedar la deuda en cero, el préstamo pasa a CANCELADO automáticamente.
"""
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from ..models import Pago, Prestamo
from .amortizacion import generar_proyeccion, validar_tasa


def _cantidad(val):
    return Decimal('0.00') if val is None else Decimal(str(val))


def _interes_vencido_pendiente(prestamo, proy, fecha):
    """Interés corriente acumulado de cortes vencidos <= fecha que sigue impago.

    Aplica interés sobre saldo insoluto: solo se adeuda el interés de cortes cuya
    fecha de vencimiento ya llegó, descontando el interés ya cubierto por pagos.
    """
    vencido = sum(
        _cantidad(fila['interes'])
        for fila in proy['periodos']
        if fila['fecha_vencimiento'] <= fecha
    )
    pagado = _cantidad(prestamo.pagos.aggregate(total=Sum('aplicacion_interes'))['total'])
    return max(Decimal('0.00'), vencido - pagado)


def interes_minimo_vencido(prestamo, fecha):
    """Interés corriente de cortes ya vencidos que sigue impago.

    Un cobro menor a este monto es rechazado (el abono debe cubrir primero
    el interés corriente devengado antes de amortizar capital).
    """
    return _interes_vencido_pendiente(prestamo, generar_proyeccion(prestamo), fecha)


def totales_insolutos(prestamo, fecha):
    """Capital, interés devengado y mora aún impagos a una fecha.

    Returns:
        tuple (capital_insoluto, interes_insoluto, mora_insoluto,
               deuda_total, proyeccion)
    """
    proy = generar_proyeccion(prestamo)
    capital_insoluto = _cantidad(prestamo.saldo_insoluto)
    # Mora aún no implementada (Sprint 3: generador de mora automática).
    mora_insoluto = Decimal('0.00')
    interes_insoluto = _interes_vencido_pendiente(prestamo, proy, fecha)
    deuda_total = capital_insoluto + interes_insoluto + mora_insoluto
    return capital_insoluto, interes_insoluto, mora_insoluto, deuda_total, proy


@transaction.atomic
def aplicar_pago(prestamo, monto, fecha_pago, metodo_pago, usuario, referencia_bancaria=''):
    """Asienta un pago con imputación legal (prelación Art. 3180).

    Returns:
        Pago, dict con 'exceso_no_aplicado'.
    """
    validar_tasa(prestamo.tasa_interes)

    monto = _cantidad(monto).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    if monto <= 0:
        raise serializers.ValidationError({'monto': 'El monto debe ser mayor a cero.'})

    minimo_ciclo = interes_minimo_vencido(prestamo, fecha_pago)
    if monto < minimo_ciclo:
        raise serializers.ValidationError({
            'monto': (
                f'El pago ({monto}) es inferior al interés mínimo del ciclo vencido ({minimo_ciclo}). '
                'Art. 3180: el abono debe cubrir primero el interés corriente antes de amortizar capital.'
            )
        })

    capital_insoluto, interes_insoluto, mora_insoluto, deuda_total, _proy = totales_insolutos(prestamo, fecha_pago)

    if deuda_total <= 0:
        raise serializers.ValidationError({
            'monto': 'El préstamo ya no tiene deuda pendiente.'
        })

    # Truncar sobrepago a la deuda total.
    monto_aplicado = min(monto, deuda_total)
    exceso = monto - monto_aplicado

    # Prelación: 1) mora  2) interés corriente  3) capital
    aplicada_mora = min(mora_insoluto, monto_aplicado)
    resto_tras_mora = monto_aplicado - aplicada_mora
    aplicada_interes = min(interes_insoluto, resto_tras_mora)
    resto_tras_interes = resto_tras_mora - aplicada_interes
    aplicada_capital = min(capital_insoluto, resto_tras_interes)

    # Normalizar para evitar desviaciones de un centavo por redondeo.
    aplicada_mora = _cantidad(aplicada_mora).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    aplicada_interes = _cantidad(aplicada_interes).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    aplicada_capital = _cantidad(aplicada_capital).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    prestamo.refresh_from_db()
    prestamo.saldo_insoluto = max(
        Decimal('0.00'),
        _cantidad(prestamo.saldo_insoluto) - aplicada_capital
    )

    pago = Pago(
        prestamo=prestamo,
        monto_total=monto_aplicado,
        fecha_pago=fecha_pago,
        metodo_pago=metodo_pago,
        referencia_bancaria=referencia_bancaria or '',
        aplicacion_mora=aplicada_mora,
        aplicacion_interes=aplicada_interes,
        aplicacion_capital=aplicada_capital,
        usuario=usuario,
    )
    pago.save()

    # Código único de comprobante (Ley 842): PAG-00001
    codigo = f'PAG-{pago.id:05d}'
    Pago.objects.filter(pk=pago.pk).update(codigo_comprobante=codigo)
    pago.codigo_comprobante = codigo

    mora_restante = max(Decimal('0.00'), mora_insoluto - aplicada_mora)
    interes_restante = max(Decimal('0.00'), interes_insoluto - aplicada_interes)
    deuda_restante = prestamo.saldo_insoluto + mora_restante + interes_restante

    if deuda_restante == 0:
        prestamo.estado = Prestamo.Estado.CANCELADO

    prestamo.save(update_fields=['saldo_insoluto', 'estado', 'actualizado_en'])

    return pago, {'exceso_no_aplicado': exceso}