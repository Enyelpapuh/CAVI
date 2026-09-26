"""Agregados para el panel de control y la caja del cobrador.

Reglas:
- Los agregados de cartera son reales (consultas agregadas + proyección de
  amortización), nunca cifras de maqueta.
- `caja_de_usuario` solo expone lo que el usuario autenticado cobra y
  registra: respeta la privacidad de la Ley 787 (sin fondos, sin liquidaciones
  50/50 y sin ganancias administrativas).
- El semáforo usa `DIAS_GRACIA`; la mora todavía no se cobra (Sprint 3).
"""
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

from ..models import Cliente, Fondo, Pago, Prestamo
from .estados import DIAS_GRACIA, dias_atraso, estado_efectivo
from .pagos import totales_insolutos

VIGENTES = (Prestamo.Estado.VIGENTE, Prestamo.Estado.EN_GRACIA, Prestamo.Estado.EN_MORA)
LIMITE_CARTERA = 20


def _d(valor):
    return Decimal('0.00') if valor is None else Decimal(str(valor))


def _serializable(valor):
    """Convierte Decimals y fechas a texto para la respuesta JSON."""
    from datetime import date, datetime

    if isinstance(valor, Decimal):
        return str(valor)
    if isinstance(valor, (date, datetime)):
        return valor.isoformat()
    if isinstance(valor, list):
        return [_serializable(item) for item in valor]
    if isinstance(valor, dict):
        return {clave: _serializable(item) for clave, item in valor.items()}
    return valor


def indicadores_prestamo(prestamo, hoy, incluir_bolsas=True):
    """Saldo deudor, cuota vigente y semáforo de un préstamo."""
    _cap, _int, _mora, deuda_total, proy = totales_insolutos(prestamo, hoy)

    proxima = next(
        (fila for fila in proy['periodos'] if fila['fecha_vencimiento'] >= hoy),
        proy['periodos'][-1] if proy['periodos'] else None,
    )
    atraso = dias_atraso(prestamo, hoy=hoy, proyeccion=proy)

    return {
        'id': prestamo.id,
        'cliente': prestamo.cliente_id,
        'cliente_nombre': str(prestamo.cliente),
        'cliente_direccion': prestamo.cliente.direccion,
        'cliente_telefono': prestamo.cliente.telefono,
        'estado': prestamo.estado,
        'estado_efectivo': estado_efectivo(prestamo, hoy=hoy, proyeccion=proy),
        'dias_atraso': atraso,
        'dias_gracia': DIAS_GRACIA,
        'saldo_deudor': deuda_total,
        'saldo_insoluto': _d(prestamo.saldo_insoluto),
        'cuota': proxima['cuota'] if proxima else None,
        'cuota_fecha': proxima['fecha_vencimiento'] if proxima else None,
        'cuota_periodo': proxima['periodo'] if proxima else None,
        'total_periodos': proy['total_periodos'],
        'bolsas': (
            [
                {
                    'id': detalle.fondo_id,
                    'nombre': detalle.fondo.nombre,
                    'porcentaje_pi': detalle.porcentaje_pi,
                }
                for detalle in prestamo.fondos_detalle.all()
            ]
            if incluir_bolsas
            else []
        ),
    }


def _prestamos_vigentes():
    return Prestamo.objects.filter(
        estado__in=VIGENTES
    ).select_related('cliente').prefetch_related('fondos_detalle__fondo')


def resumen_cartera(hoy=None, limite=LIMITE_CARTERA, incluir_bolsas=True):
    """Resumen de cartera: KPIs + filas ordenadas por saldo deudor."""
    hoy = hoy or timezone.localdate()

    filas = [indicadores_prestamo(p, hoy, incluir_bolsas) for p in _prestamos_vigentes()]
    filas.sort(key=lambda f: f['saldo_deudor'], reverse=True)

    saldo_total = sum((f['saldo_deudor'] for f in filas), Decimal('0.00'))
    saldo_sano = sum(
        (f['saldo_deudor'] for f in filas if f['estado_efectivo'] in ('AL_DIA', 'EN_GRACIA')),
        Decimal('0.00'),
    )
    porcentaje_sano = (
        (saldo_sano / saldo_total * 100).quantize(Decimal('0.01'))
        if saldo_total > 0
        else Decimal('100.00')
    )

    return {
        'cantidad': len(filas),
        'saldo_total': saldo_total,
        'porcentaje_sano': porcentaje_sano,
        'en_mora': len([f for f in filas if f['estado_efectivo'] == 'EN_MORA']),
        'en_gracia': len([f for f in filas if f['estado_efectivo'] == 'EN_GRACIA']),
        'filas': _serializable(filas[:limite] if limite else filas),
    }


def resumen_dashboard(hoy=None, limite=LIMITE_CARTERA):
    """Payload del panel de control (exclusivo del ADMINISTRADOR)."""
    hoy = hoy or timezone.localdate()

    cartera = resumen_cartera(hoy=hoy, limite=limite)
    fondos = Fondo.objects.filter(activo=True)
    abonos = Pago.objects.filter(fecha_pago=hoy).aggregate(
        total=Sum('monto_total'), cantidad=Count('id')
    )

    return _serializable({
        'fecha': hoy,
        'clientes_activos': Cliente.objects.filter(activo=True).count(),
        'bolsas': {
            'cantidad': fondos.count(),
            'capital_en_calle': sum((_d(f.saldo_disponible) for f in fondos), Decimal('0.00')),
        },
        'creditos_vigentes': {
            'cantidad': cartera['cantidad'],
            'saldo_total': cartera['saldo_total'],
            'porcentaje_sano': cartera['porcentaje_sano'],
            'en_mora': cartera['en_mora'],
            'en_gracia': cartera['en_gracia'],
        },
        'abonos_del_dia': {
            'monto': _d(abonos['total']),
            'cantidad': abonos['cantidad'] or 0,
        },
        'cartera': cartera['filas'],
    })


def caja_de_usuario(usuario, fecha=None):
    """Recaudos del propio usuario en la fecha indicada.

    Solo lo cobrado/registrado por ese usuario: nunca fondos, liquidaciones
    50/50 ni ganancias administrativas (privacidad Ley 787).
    """
    fecha = fecha or timezone.localdate()
    pagos = Pago.objects.filter(usuario=usuario, fecha_pago=fecha)

    totales = pagos.aggregate(total=Sum('monto_total'), cantidad=Count('id'))

    por_metodo = {
        metodo: {'label': etiqueta, 'monto': Decimal('0.00')}
        for metodo, etiqueta in Pago.MetodoPago.choices
    }
    for fila in pagos.values('metodo_pago').annotate(total=Sum('monto_total')):
        por_metodo[fila['metodo_pago']]['monto'] = _d(fila['total'])

    return _serializable({
        'fecha': fecha,
        'usuario': usuario.nombre_completo,
        'total_recaudado': _d(totales['total']),
        'recibos_emitidos': totales['cantidad'] or 0,
        'por_metodo': por_metodo,
        'creditos_vigentes': len(_prestamos_vigentes()),
    })


def _normalizar(texto):
    import unicodedata

    descompuesto = unicodedata.normalize('NFD', texto or '')
    return ''.join(c for c in descompuesto if unicodedata.category(c) != 'Mn').lower()


def agenda_cobrador(hoy=None, busqueda=None):
    """Vista de cobranza: agenda completa, sin datos de fondos (Ley 787)."""
    resumen = resumen_cartera(hoy=hoy, limite=None, incluir_bolsas=False)
    filas = resumen.pop('filas')

    if busqueda:
        objetivo = _normalizar(busqueda)
        filas = [f for f in filas if objetivo in _normalizar(f['cliente_nombre'])]

    return _serializable({'resumen': resumen, 'filas': filas})
