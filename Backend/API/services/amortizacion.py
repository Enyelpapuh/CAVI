"""Motor financiero de amortización sobre saldo insoluto (Ley 176).

Cuota constante (francesa): el interés se calcula únicamente sobre el saldo
remanente del período, prohibiendo el anatocismo (nunca capitaliza intereses
vencidos).
"""
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from rest_framework import serializers


def validar_tasa(tasa) -> Decimal:
    """Rechaza tasas que superen el límite legal del BCN (usura)."""
    tasa_d = Decimal(str(tasa))
    tope = Decimal(str(settings.TASA_MAXIMA_LEGAL))
    if tasa_d > tope:
        raise serializers.ValidationError(
            f"La tasa de interés mensual {tasa_d} supera el límite legal de usura del BCN ({tope})."
        )
    return tasa_d


def _periodos(periodicidad, plazo_meses):
    """Cantidad de cortes según periodicidad (MENSUAL=30d, QUINCENAL=15d)."""
    return plazo_meses * (1 if periodicidad == 'MENSUAL' else 2)


def tasa_periodica(tasa_mensual, periodicidad):
    """Tasa por corte: mensual = misma; quincenal = mensual / 2."""
    tasa = Decimal(str(tasa_mensual))
    if periodicidad == 'MENSUAL':
        return tasa
    return (tasa / 2).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)


def _calcular_cuota(monto_principal, i, n):
    """Cuota fija francesa: C = P * i / (1 - (1 + i)^-n)."""
    monto = Decimal(str(monto_principal))
    if i == 0:
        return (monto / n).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    factor = (1 + i) ** n
    cuota = monto * i * factor / (factor - 1)
    return cuota.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def generar_proyeccion(prestamo, fecha_referencia=None):
    """Genera la tabla de proyección de cuotas.

    Args:
        prestamo: instancia de Prestamo.
        fecha_referencia: fecha base para el primer vencimiento
            (default: fecha_primer_corte).

    Returns:
        list[dict]: [{periodo, fecha_vencimiento, cuota, interes, capital,
                      saldo_insoluto, total_interes, total_cuotas}]
    """
    from datetime import timedelta

    n = _periodos(prestamo.periodicidad, prestamo.plazo_meses)
    i = tasa_periodica(prestamo.tasa_interes, prestamo.periodicidad)
    cuota = _calcular_cuota(prestamo.monto_principal, i, n)

    saldo = Decimal(str(prestamo.monto_principal))
    base = fecha_referencia or prestamo.fecha_primer_corte
    intervalo = 30 if prestamo.periodicidad == 'MENSUAL' else 15

    filas = []
    for periodo in range(1, n + 1):
        interes = (saldo * i).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        # Anatocismo: si el interés por redondeo supera la cuota, se ajusta
        # la cuota a interés + saldo restante (nunca capitaliza intereses).
        if cuota <= interes:
            capital = saldo
            cuota_periodo = interes + capital
        else:
            capital = cuota - interes
            if periodo == n or capital >= saldo:
                capital = saldo
                cuota_periodo = interes + capital
            else:
                cuota_periodo = cuota

        saldo = saldo - capital

        filas.append({
            'periodo': periodo,
            'fecha_vencimiento': base + timedelta(days=intervalo * (periodo - 1)),
            'cuota': cuota_periodo,
            'interes': interes,
            'capital': capital,
            'saldo_insoluto': saldo,
        })

    return {
        'prestamo': prestamo.id,
        'cliente': prestamo.cliente.id,
        'monto_principal': prestamo.monto_principal,
        'tasa_periodica': i,
        'periodicidad': prestamo.periodicidad,
        'plazo_meses': prestamo.plazo_meses,
        'total_periodos': n,
        'total_interes': sum(f['interes'] for f in filas),
        'total_cuotas': sum(f['cuota'] for f in filas),
        'periodos': filas,
    }


def interes_devengado_hasta(filas, numero_cortes):
    """Suma del interés devengado hasta N cortes vencidos (sin mora)."""
    return sum(f['interes'] for f in filas[:numero_cortes])