"""Motor de imputación de pagos según Art. 3180 Código Civil.

Prelación obligatoria al recibir un abono insuficiente:
    1. Mora (recargos por atraso)
    2. Interés corriente (sobre saldo insoluto)
    3. Capital

Reglas de negocio:
- Se bloquea (HTTP 400) todo cobro menor al interés mínimo del ciclo vencido.
- Un abono que exceda la deuda total se trunca a la deuda; el exceso no se aplica.
- Al quedar la deuda en cero, el préstamo pasa a CANCELADO automáticamente.
- La mora se genera por días vencidos fuera de gracia (`services/mora.py`) y se
  imputa antes que el interés corriente, sin capitalizar intereses (Ley 176).
"""
import hashlib
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from ..models import (
    ConfiguracionSistema,
    GananciaAdministracion,
    MovimientoFondo,
    Pago,
    PagoFondoDetalle,
    Prestamo,
)
from .amortizacion import generar_proyeccion, validar_tasa
from .auditoria import registrar_auditoria
from .mora import actualizar_mora_prestamo, detalle_mora, estado_por_mora, mora_pendiente


def generar_codigo_seguridad_pago(pago_id, prestamo_id, monto, fecha_pago):
    """Calcula un hash SHA-256 de 8 caracteres para verificar la autenticidad física del recibo."""
    raw = f"{pago_id}|{prestamo_id}|{monto}|{fecha_pago}|{settings.SECRET_KEY}"
    h = hashlib.sha256(raw.encode('utf-8')).hexdigest()[:8].upper()
    return f"{h[:4]}-{h[4:]}"


def _cantidad(val):
    return Decimal('0.00') if val is None else Decimal(str(val))


def _split_proporcional(total, pesos):
    """Divide `total` exactamente según `pesos` sin perder centavos.

    El último ítem absorbe el remanente del redondeo para que la suma
    de las partes sea idéntica a `total`.
    """
    total = _cantidad(total)
    partes = []
    acumulado = Decimal('0.00')
    for i, peso in enumerate(pesos):
        if i == len(pesos) - 1:
            partes.append(total - acumulado)
        else:
            parte = (total * _cantidad(peso)).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
            acumulado += parte
            partes.append(parte)
    return partes


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
    # Mora generadora (Art. 3180): días vencidos fuera de gracia sobre el saldo
    # insoluto. Se calcula sin escribir para que el preview y el asiento real
    # usen exactamente la misma cifra.
    mora_insoluto = mora_pendiente(prestamo, hoy=fecha, proyeccion=proy)
    interes_insoluto = _interes_vencido_pendiente(prestamo, proy, fecha)
    deuda_total = capital_insoluto + interes_insoluto + mora_insoluto
    return capital_insoluto, interes_insoluto, mora_insoluto, deuda_total, proy


def _prelacion(prestamo, monto, fecha_pago):
    """Calcula la imputación de un abono sin tocar la base de datos.

    Función pura: la usan tanto `simular_pago` (preview de la interfaz) como
    `aplicar_pago` (asiento real), de modo que lo que el cobrador ve en
    pantalla y lo que se persiste nunca divergen.

    Returns:
        dict con el desglose de prelación, el saldo resultante y los
        campos `es_valido` / `error` para las reglas de rechazo.
    """
    monto = _cantidad(monto).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    minimo_ciclo = interes_minimo_vencido(prestamo, fecha_pago)
    capital_insoluto, interes_insoluto, mora_insoluto, deuda_total, _proy = totales_insolutos(
        prestamo, fecha_pago
    )

    es_valido = True
    error = None
    if monto <= 0:
        es_valido = False
        error = {'monto': 'El monto debe ser mayor a cero.'}
    elif monto < minimo_ciclo:
        es_valido = False
        error = {
            'monto': (
                f'El pago ({monto}) es inferior al interés mínimo del ciclo vencido ({minimo_ciclo}). '
                'Art. 3180: el abono debe cubrir primero el interés corriente antes de amortizar capital.'
            )
        }
    elif deuda_total <= 0:
        es_valido = False
        error = {'monto': 'El préstamo ya no tiene deuda pendiente.'}

    # Truncar sobrepago a la deuda total.
    monto_aplicado = min(monto, deuda_total) if deuda_total > 0 else Decimal('0.00')
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

    saldo_tras_pago = max(Decimal('0.00'), _cantidad(prestamo.saldo_insoluto) - aplicada_capital)
    mora_restante = max(Decimal('0.00'), mora_insoluto - aplicada_mora)
    interes_restante = max(Decimal('0.00'), interes_insoluto - aplicada_interes)
    deuda_tras_pago = saldo_tras_pago + mora_restante + interes_restante

    # Liquidación 50/50 (Ley 977) reflejada en el preview.
    if aplicada_interes > 0:
        interes_administracion = (aplicada_interes / 2).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP)
        interes_fondos = aplicada_interes - interes_administracion
    else:
        interes_administracion = Decimal('0.00')
        interes_fondos = Decimal('0.00')

    return {
        'monto_recibido': monto,
        'monto_aplicado': monto_aplicado,
        'exceso_no_aplicado': exceso,
        'minimo_ciclo': minimo_ciclo,
        'capital_insoluto': capital_insoluto,
        'interes_insoluto': interes_insoluto,
        'mora_insoluto': mora_insoluto,
        'deuda_total': deuda_total,
        'aplicacion_mora': aplicada_mora,
        'aplicacion_interes': aplicada_interes,
        'aplicacion_capital': aplicada_capital,
        'interes_administracion': interes_administracion,
        'interes_fondos': interes_fondos,
        'saldo_insoluto_tras_pago': saldo_tras_pago,
        'deuda_tras_pago': deuda_tras_pago,
        'deuda_liquidada': deuda_tras_pago == 0,
        'detalle_mora': detalle_mora(prestamo, hoy=fecha_pago),
        'es_valido': es_valido,
        'error': error,
    }


def simular_pago(prestamo, monto, fecha_pago):
    """Preview de un abono: desglose de prelación sin persistir nada.

    Permite que la interfaz muestre Mora / Interés / Capital y el nuevo saldo
    en vivo, con exactamente la misma aritmética que aplica `aplicar_pago`.
    """
    validar_tasa(prestamo.tasa_interes)
    return _prelacion(prestamo, monto, fecha_pago)


@transaction.atomic
def aplicar_pago(
    prestamo,
    monto,
    fecha_pago,
    metodo_pago,
    usuario,
    referencia_bancaria='',
    banco=None,
    sesion_caja=None,
    efectivo_recibido=None,
    cambio_devuelto=None
):
    """Asienta un pago con imputación legal (prelación Art. 3180).

    Returns:
        Pago, dict con 'exceso_no_aplicado'.
    """
    validar_tasa(prestamo.tasa_interes)

    calculo = _prelacion(prestamo, monto, fecha_pago)
    if not calculo['es_valido']:
        raise serializers.ValidationError(calculo['error'])

    # La mora se devenga sobre el saldo vigente ANTES de amortizar capital,
    # de modo que lo persistido sea exactamente lo que se previsualizó.
    actualizar_mora_prestamo(prestamo, hoy=fecha_pago, sincronizar_estado=False)

    monto = calculo['monto_recibido']
    monto_aplicado = calculo['monto_aplicado']
    exceso = calculo['exceso_no_aplicado']
    aplicada_mora = calculo['aplicacion_mora']
    aplicada_interes = calculo['aplicacion_interes']
    aplicada_capital = calculo['aplicacion_capital']
    mora_restante = max(Decimal('0.00'), calculo['mora_insoluto'] - aplicada_mora)
    interes_restante = max(Decimal('0.00'), calculo['interes_insoluto'] - aplicada_interes)

    prestamo.refresh_from_db()
    prestamo.saldo_insoluto = calculo['saldo_insoluto_tras_pago']

    if sesion_caja is None and usuario:
        from API.models import SesionCaja
        sesion_caja = SesionCaja.objects.filter(usuario=usuario, estado='ABIERTA').first()

    pago = Pago(
        prestamo=prestamo,
        monto_total=monto_aplicado,
        fecha_pago=fecha_pago,
        metodo_pago=metodo_pago,
        banco=banco,
        sesion_caja=sesion_caja,
        efectivo_recibido=efectivo_recibido,
        cambio_devuelto=cambio_devuelto,
        referencia_bancaria=referencia_bancaria or '',
        aplicacion_mora=aplicada_mora,
        aplicacion_interes=aplicada_interes,
        aplicacion_capital=aplicada_capital,
        usuario=usuario,
    )
    pago.save()

    # Código único de comprobante correlativo y hash SHA-256 de integridad (Ley 842 / UAF 977)
    codigo = f'REC-{pago.id:06d}'
    codigo_seguridad = generar_codigo_seguridad_pago(pago.id, prestamo.id, monto_aplicado, fecha_pago)
    Pago.objects.filter(pk=pago.pk).update(
        codigo_comprobante=codigo,
        codigo_seguridad=codigo_seguridad
    )
    pago.codigo_comprobante = codigo
    pago.codigo_seguridad = codigo_seguridad

    # ── Liquidación 50/50 (Ley 977) ────────────────────────────────────────
    # Interés corriente pagado → 50% administración, 50% fondos (según Pi).
    interes_administracion = calculo['interes_administracion']
    interes_fondos = calculo['interes_fondos']

    participantes = list(
        prestamo.fondos_detalle.select_related('fondo').order_by('id')
    )
    if participantes:
        pis = [d.porcentaje_pi for d in participantes]
        capitales = _split_proporcional(aplicada_capital, pis)
        ganancias = _split_proporcional(interes_fondos, pis)

        for detalle, capital_partida, ganancia in zip(
                participantes, capitales, ganancias):
            fondo = detalle.fondo
            fondo.refresh_from_db()
            saldo_anterior = fondo.saldo_disponible

            PagoFondoDetalle.objects.create(
                pago=pago,
                fondo=fondo,
                porcentaje_pi=detalle.porcentaje_pi,
                capital_reintegrado=capital_partida,
                ganancia=ganancia,
            )

            ganancias_antes = fondo.ganancias_acumuladas
            fondo.saldo_disponible = saldo_anterior + capital_partida
            fondo.ganancias_acumuladas = ganancias_antes + ganancia
            fondo.save(update_fields=['saldo_disponible', 'ganancias_acumuladas', 'actualizado_en'])

            # Trazabilidad inmutable (UAF): toda ganancia/reintegro referencia el pago.
            if ganancia > 0:
                MovimientoFondo.objects.create(
                    fondo=fondo,
                    pago=pago,
                    usuario=usuario,
                    tipo=MovimientoFondo.TipoMovimiento.GANANCIA,
                    monto=ganancia,
                    saldo_anterior=saldo_anterior,
                    saldo_posterior=saldo_anterior + capital_partida,
                    descripcion=f'Liquidación {codigo}: ganancia 50% fondos (Pi {detalle.porcentaje_pi})',
                )
            if capital_partida > 0:
                MovimientoFondo.objects.create(
                    fondo=fondo,
                    pago=pago,
                    usuario=usuario,
                    tipo=MovimientoFondo.TipoMovimiento.REINTEGRO,
                    monto=capital_partida,
                    saldo_anterior=saldo_anterior,
                    saldo_posterior=saldo_anterior + capital_partida,
                    descripcion=f'Reintegro capital {codigo} (Pi {detalle.porcentaje_pi})',
                )

    if interes_administracion > 0:
        GananciaAdministracion.objects.create(
            pago=pago,
            monto=interes_administracion,
            fecha=fecha_pago,
        )

    Pago.objects.filter(pk=pago.pk).update(
        interes_administracion=interes_administracion,
        interes_fondos=interes_fondos,
    )
    pago.interes_administracion = interes_administracion
    pago.interes_fondos = interes_fondos

    deuda_restante = prestamo.saldo_insoluto + mora_restante + interes_restante

    if deuda_restante == 0:
        prestamo.estado = Prestamo.Estado.CANCELADO
    else:
        # El atraso se recalcula con los cortes ya pagados: un préstamo que se
        # regulariza vuelve a VIGENTE sin perder los días ya facturados.
        prestamo.estado = estado_por_mora(prestamo, hoy=fecha_pago)
    prestamo.save(update_fields=['saldo_insoluto', 'estado', 'actualizado_en'])

    # Registro de auditoría del cobro asentado
    registrar_auditoria(
        modulo='COBRANZA',
        codigo_evento='PAG_ASENTADO',
        nivel_severidad='INFORMATIVO',
        usuario=usuario,
        cliente=prestamo.cliente,
        prestamo=prestamo,
        pago=pago,
        datos_nuevos={
            'codigo_comprobante': codigo,
            'monto_total': str(monto_aplicado),
            'metodo_pago': metodo_pago,
            'aplicacion_capital': str(aplicada_capital),
            'aplicacion_interes': str(aplicada_interes),
            'aplicacion_mora': str(aplicada_mora),
            'saldo_restante': str(prestamo.saldo_insoluto)
        },
        observaciones=f"Cobro asentado {codigo} por C$ {monto_aplicado} en préstamo #{prestamo.id} ({prestamo.cliente})."
    )

    return pago, {'exceso_no_aplicado': exceso}


@transaction.atomic
def anular_pago(pago, usuario, motivo, request=None):
    """Anula un recibo de pago de forma atómica (ACID) y revierte los saldos.

    Reglas de negocio aprobadas:
    - Exclusivo para usuarios con rol ADMINISTRADOR.
    - Se requiere justificación obligatoria (mínimo 15 caracteres).
    - Límite de tiempo: configurado en ConfiguracionSistema (por defecto 72 horas desde creado_en).
    - Se revierte la amortización de capital en el préstamo (y reactiva el préstamo si estaba CANCELADO).
    - Se revierten las distribuciones en fondos familiares y se emite MovimientoFondo(REVERSO_PAGO).
    - Se revierte la ganancia administrativa.
    - Se registra el evento PAG_ANULADO con severidad CRITICO en BitacoraActividad.
    """
    if pago.estado == 'ANULADO':
        raise serializers.ValidationError({'error': 'El recibo ya fue anulado previamente.'})

    rol_usuario = getattr(usuario, 'rol', None)
    if rol_usuario != 'ADMINISTRADOR' and not getattr(usuario, 'is_superuser', False):
        raise PermissionDenied('Solo usuarios con rol Administrador pueden anular recibos de pago.')

    motivo_limpio = (motivo or '').strip()
    if len(motivo_limpio) < 15:
        raise serializers.ValidationError({
            'motivo': 'El motivo de anulación es obligatorio y debe contener al menos 15 caracteres descriptivos.'
        })

    config = ConfiguracionSistema.get_solo()
    limite_horas = config.horas_tolerancia_anulacion or 72
    ahora = timezone.now()
    horas_transcurridas = (ahora - pago.creado_en).total_seconds() / 3600.0
    if horas_transcurridas > limite_horas:
        raise serializers.ValidationError({
            'error': f'Ha expirado la tolerancia máxima de {limite_horas} horas para anular este recibo (tiempo transcurrido: {int(horas_transcurridas)}h).'
        })

    prestamo = Prestamo.objects.select_for_update().get(pk=pago.prestamo_id)
    saldo_anterior_prestamo = prestamo.saldo_insoluto

    # 1. Revertir capital amortizado en el préstamo
    prestamo.saldo_insoluto = saldo_anterior_prestamo + pago.aplicacion_capital

    # 2. Si el préstamo estaba CANCELADO o requiere ajuste de estado
    if prestamo.saldo_insoluto > Decimal('0.00'):
        prestamo.estado = estado_por_mora(prestamo, hoy=timezone.localdate())
    prestamo.save(update_fields=['saldo_insoluto', 'estado', 'actualizado_en'])

    # 3. Revertir participaciones en fondos familiares
    detalles = list(pago.fondos_detalle.select_for_update().select_related('fondo').order_by('id'))
    reversiones_fondos = []
    for detalle in detalles:
        fondo = detalle.fondo
        saldo_antes = fondo.saldo_disponible
        ganancias_antes = fondo.ganancias_acumuladas

        # Reintegro de capital se resta del saldo disponible del fondo
        nuevo_saldo = max(Decimal('0.00'), saldo_antes - detalle.capital_reintegrado)
        # Ganancia se resta de las acumuladas
        nuevas_ganancias = max(Decimal('0.00'), ganancias_antes - detalle.ganancia)

        fondo.saldo_disponible = nuevo_saldo
        fondo.ganancias_acumuladas = nuevas_ganancias
        fondo.save(update_fields=['saldo_disponible', 'ganancias_acumuladas', 'actualizado_en'])

        monto_reverso = detalle.capital_reintegrado + detalle.ganancia
        MovimientoFondo.objects.create(
            fondo=fondo,
            pago=pago,
            usuario=usuario,
            tipo=MovimientoFondo.TipoMovimiento.REVERSO_PAGO,
            monto=monto_reverso,
            saldo_anterior=saldo_antes,
            saldo_posterior=nuevo_saldo,
            descripcion=(
                f"Anulación de recibo {pago.codigo_comprobante}: se revierte capital de C$ {detalle.capital_reintegrado} "
                f"y ganancia de C$ {detalle.ganancia}. Motivo: {motivo_limpio}"
            )
        )
        reversiones_fondos.append({
            'fondo_id': fondo.id,
            'fondo_nombre': fondo.nombre,
            'capital_deducido': str(detalle.capital_reintegrado),
            'ganancia_deducida': str(detalle.ganancia),
            'saldo_posterior': str(nuevo_saldo)
        })

    # 4. Revertir ganancia de administración si existía
    ganancia_admin = GananciaAdministracion.objects.filter(pago=pago).first()
    monto_admin_revertido = Decimal('0.00')
    if ganancia_admin:
        monto_admin_revertido = ganancia_admin.monto
        ganancia_admin.delete()

    # 5. Marcar pago como ANULADO
    pago.estado = 'ANULADO'
    pago.motivo_anulacion = motivo_limpio
    pago.anulado_en = ahora
    pago.anulado_por = usuario
    pago.save(update_fields=['estado', 'motivo_anulacion', 'anulado_en', 'anulado_por'])

    # 6. Registrar en bitácora inmutable con severidad CRITICO
    registrar_auditoria(
        modulo='COBRANZA',
        codigo_evento='PAG_ANULADO',
        nivel_severidad='CRITICO',
        usuario=usuario,
        cliente=prestamo.cliente,
        prestamo=prestamo,
        pago=pago,
        datos_anteriores={
            'estado': 'VALIDO',
            'monto_total': str(pago.monto_total),
            'aplicacion_capital': str(pago.aplicacion_capital),
            'aplicacion_interes': str(pago.aplicacion_interes),
            'aplicacion_mora': str(pago.aplicacion_mora),
            'prestamo_saldo_anterior': str(saldo_anterior_prestamo)
        },
        datos_nuevos={
            'estado': 'ANULADO',
            'motivo': motivo_limpio,
            'prestamo_saldo_restablecido': str(prestamo.saldo_insoluto),
            'prestamo_nuevo_estado': prestamo.estado,
            'reversiones_fondos': reversiones_fondos,
            'ganancia_admin_revertida': str(monto_admin_revertido)
        },
        observaciones=f"Recibo {pago.codigo_comprobante} ANULADO por C$ {pago.monto_total}. Motivo: {motivo_limpio}",
        request=request
    )

    return pago


def contexto_recibo(pago, usuario=None):
    """Construye el contexto para renderizar la plantilla HTML oficial del recibo."""
    from .pagare import numero_a_letras
    cliente = pago.prestamo.cliente
    monto_fmt = f"C${pago.monto_total:,.2f}"
    monto_letras = numero_a_letras(pago.monto_total)

    es_admin = False
    if usuario:
        es_admin = getattr(usuario, 'rol', None) == 'ADMINISTRADOR' or getattr(usuario, 'is_superuser', False)

    fondos_detalle = []
    if es_admin:
        fondos_detalle = list(pago.fondos_detalle.select_related('fondo').all())

    codigo_seguridad = (
        pago.codigo_seguridad
        or generar_codigo_seguridad_pago(pago.id, pago.prestamo.id, pago.monto_total, pago.fecha_pago)
    )

    nombre_usuario = ''
    if usuario and getattr(usuario, 'nombre_completo', None):
        nombre_usuario = usuario.nombre_completo
    elif pago.usuario and getattr(pago.usuario, 'nombre_completo', None):
        nombre_usuario = pago.usuario.nombre_completo
    else:
        nombre_usuario = 'Caja CAVI'

    return {
        'pago': pago,
        'prestamo': pago.prestamo,
        'cliente': cliente,
        'monto_fmt': monto_fmt,
        'monto_letras': monto_letras,
        'codigo_seguridad': codigo_seguridad,
        'fondos_detalle': fondos_detalle,
        'es_admin': es_admin,
        'fecha_generacion': timezone.localtime().strftime('%d/%m/%Y %H:%M'),
        'usuario_nombre': nombre_usuario,
    }


def html_recibo(pago, usuario=None) -> str:
    """Renderiza el recibo de pago en HTML listo para abrir en nueva pestaña o imprimir."""
    from django.template.loader import render_to_string
    return render_to_string('recibo.html', contexto_recibo(pago, usuario))