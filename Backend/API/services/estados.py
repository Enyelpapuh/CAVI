"""Estado efectivo del préstamo: atraso, gracia y semáforo operativo.

Este módulo NO cobra mora: solo deriva, desde la proyección de amortización,
cuántos días lleva vencida el primer corte que sigue impago para que la
interfaz muestre Al Día / En Gracia / En Mora. El importe del recargo lo
calcula `services/mora.py`, que reutiliza `dias_atraso()` como base.

La misma regla de gracia está replicada en el frontend
(`src/lib/estadoPrestamo.ts`); `DIAS_GRACIA` es la única constante compartida.
"""
from decimal import Decimal

from django.db.models import Sum

from .amortizacion import generar_proyeccion

# Días de gracia antes de que un atraso sea exigible. Criterio CAVI / Ley 1146.
DIAS_GRACIA = 4


def _cantidad(valor) -> Decimal:
    return Decimal('0.00') if valor is None else Decimal(str(valor))


def cortes_pagados(prestamo, proyeccion=None) -> int:
    """Cantidad de cortes totalmente cubiertos por los abonos ya asentados.

    La proyección de amortización es "en blanco": no sabe qué se pagó. Este
    recorrido descuenta el capital y el interés ya aplicados, corte por corte,
    para saber hasta dónde llega el préstamo. Sin esto, un préstamo pagado al
    día seguiría apareciendo como vencido porque su primer corte ya pasó.
    """
    proy = proyeccion or generar_proyeccion(prestamo)
    agregado = prestamo.pagos.aggregate(
        interes=Sum('aplicacion_interes'),
        capital=Sum('aplicacion_capital'),
    )
    disponible = _cantidad(agregado['interes']) + _cantidad(agregado['capital'])

    pagados = 0
    for fila in proy['periodos']:
        cuota = _cantidad(fila['cuota'])
        if disponible >= cuota:
            disponible -= cuota
            pagados += 1
        else:
            break
    return pagados


def dias_atraso(prestamo, hoy=None, proyeccion=None):
    """Días desde el vencimiento del primer corte que sigue impago.

    Returns:
        int: 0 si no hay cortes vencidos impagos o si el préstamo está cancelado.
    """
    from django.utils import timezone

    if getattr(prestamo, 'estado', None) == 'CANCELADO':
        return 0

    hoy = hoy or timezone.localdate()
    proy = proyeccion or generar_proyeccion(prestamo)

    for fila in proy['periodos'][cortes_pagados(prestamo, proy):]:
        if fila['fecha_vencimiento'] < hoy:
            return (hoy - fila['fecha_vencimiento']).days
    return 0


def estado_efectivo(prestamo, hoy=None, proyeccion=None):
    """Semáforo de cobranza: AL_DIA | EN_GRACIA | EN_MORA | CANCELADO.

    El estado persistido manda: un préstamo que ya quedó `EN_MORA` o
    `CANCELADO` en la base no se reclasifica. Solo los préstamos `VIGENTE`
    usan el atraso calculado para distinguir gracia de mora.
    """
    estado = getattr(prestamo, 'estado', 'VIGENTE')
    if estado == 'CANCELADO':
        return 'CANCELADO'
    if estado == 'EN_MORA':
        return 'EN_MORA'
    if estado == 'EN_GRACIA':
        return 'EN_GRACIA'

    atraso = dias_atraso(prestamo, hoy=hoy, proyeccion=proyeccion)
    if atraso <= 0:
        return 'AL_DIA'
    return 'EN_GRACIA' if atraso <= DIAS_GRACIA else 'EN_MORA'
