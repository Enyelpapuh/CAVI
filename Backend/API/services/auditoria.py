"""Servicio central de auditoría y trazabilidad para el sistema CAVI.

Registra eventos operacionales inmutables (Ley N° 977 UAF) y captura
diferenciales de cambios (diff) en modelos sensibles.
"""
from django.utils import timezone
from ..models import BitacoraActividad, CatTipoActividad


def _obtener_cliente_ip(request):
    if not request:
        return None
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _obtener_user_agent(request):
    if not request:
        return ''
    return request.META.get('HTTP_USER_AGENT', '')[:255]


def calcular_diferencial(datos_anteriores, datos_nuevos):
    """Calcula las diferencias campo a campo entre dos estados serializados."""
    if not datos_anteriores or not datos_nuevos:
        return None
    diferencial = {}
    todos_los_campos = set(datos_anteriores.keys()).union(datos_nuevos.keys())
    for campo in sorted(todos_los_campos):
        val_ant = datos_anteriores.get(campo)
        val_nuevo = datos_nuevos.get(campo)
        if val_ant != val_nuevo:
            diferencial[campo] = {
                'antes': val_ant,
                'despues': val_nuevo
            }
    return diferencial if diferencial else None


def registrar_auditoria(
    modulo,
    codigo_evento,
    nivel_severidad='INFORMATIVO',
    usuario=None,
    cliente=None,
    prestamo=None,
    pago=None,
    fondo=None,
    datos_anteriores=None,
    datos_nuevos=None,
    diferencial_cambios=None,
    observaciones='',
    request=None
):
    """Inserta de manera inmutable un registro en BitacoraActividad."""
    ip = _obtener_cliente_ip(request)
    ua = _obtener_user_agent(request)

    if diferencial_cambios is None and datos_anteriores and datos_nuevos:
        diferencial_cambios = calcular_diferencial(datos_anteriores, datos_nuevos)

    # Intentar vincular a CatTipoActividad si existe
    tipo_actividad = CatTipoActividad.objects.filter(codigo=codigo_evento).first()

    return BitacoraActividad.objects.create(
        modulo=modulo.upper(),
        codigo_evento=codigo_evento.upper(),
        nivel_severidad=nivel_severidad.upper(),
        tipo_actividad=tipo_actividad,
        usuario=usuario,
        cliente=cliente,
        prestamo=prestamo,
        pago=pago,
        fondo=fondo,
        direccion_ip=ip,
        agente_usuario=ua,
        datos_anteriores=datos_anteriores,
        datos_nuevos=datos_nuevos,
        diferencial_cambios=diferencial_cambios,
        observaciones=observaciones.strip(),
        creado_en=timezone.now()
    )
