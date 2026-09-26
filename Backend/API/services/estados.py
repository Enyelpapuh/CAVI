"""Estado efectivo del préstamo: atraso, gracia y semáforo operativo.

El Sprint 3 agrega el generador de mora que persiste `EN_MORA` y cobra
recargos. Este módulo NO cobra mora: solo deriva, desde la proyección de
amortización, cuántos días lleva vencida la cuota más antigua impaga para que
la interfaz muestre Al Día / En Gracia / En Mora sin inventar cargos.

La misma regla está replicada en el frontend (`src/lib/estadoPrestamo.ts`);
`DIAS_GRACIA` es la única constante compartida entre ambos.
"""
from .amortizacion import generar_proyeccion

# Días de gracia antes de que un atraso sea exigible. Criterio CAVI / Ley 1146.
DIAS_GRACIA = 4


def dias_atraso(prestamo, hoy=None, proyeccion=None):
    """Días desde el vencimiento de la cuota más antigua aún impaga.

    Returns:
        int: 0 si no hay cortes vencidos o si el préstamo está cancelado.
    """
    from django.utils import timezone

    if getattr(prestamo, 'estado', None) == 'CANCELADO':
        return 0

    hoy = hoy or timezone.localdate()
    proy = proyeccion or generar_proyeccion(prestamo)

    for fila in proy['periodos']:
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
