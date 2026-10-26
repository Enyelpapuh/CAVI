from rest_framework import viewsets, status, permissions, serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Sum, F
from django.http import HttpResponse
from decimal import Decimal
from django.utils import timezone
from .models import (
    Usuario, Cliente, Fondo, MovimientoFondo, Prestamo, PrestamoFondoDetalle, Pago,
    PagoFondoDetalle,
    ConfiguracionSistema, CatDepartamento, CatMunicipio, CatActividadEconomica,
    CatBanco, CatEstadoPrestamo, CatEstadoCuota, CatEstadoCliente, CatEstadoCaja,
    CatPermiso, RolPermiso, SesionCaja, CuotaPrestamo, RolUsuario,
    BitacoraActividad, CatTipoActividad,
)
from .serializers import (
    UsuarioSerializer, UsuarioLoginSerializer, ClienteSerializer,
    FondoSerializer, FondoCreateSerializer, InyeccionFondoSerializer,
    RetiroFondoSerializer, MovimientoFondoSerializer,
    PrestamoSerializer, PrestamoCreateSerializer, PrestamoFondoDetalleSerializer,
    PagoImputacionSerializer, PagoSerializer, PagoReciboSerializer,
    PagoPreviewSerializer, PrestamoSimulacionSerializer,
    ConfiguracionSistemaSerializer, CatDepartamentoSerializer, CatMunicipioSerializer,
    CatActividadEconomicaSerializer, CatBancoSerializer, CatEstadoPrestamoSerializer,
    CatEstadoCuotaSerializer, CatEstadoClienteSerializer, CatEstadoCajaSerializer,
    CatPermisoSerializer, RolPermisoSerializer, SesionCajaSerializer, CuotaPrestamoSerializer,
    BitacoraActividadSerializer,
)
from .permissions import EsAdministrador
from .services.amortizacion import generar_proyeccion, validar_tasa
from .services.auditoria import registrar_auditoria
from .services.dashboard import resumen_dashboard, caja_de_usuario, agenda_cobrador
from .services.pagos import aplicar_pago, simular_pago, anular_pago, html_recibo
from .services.pagare import html_pagare, pdf_pagare
from .services.pdf import MotorPdfNoDisponible, es_pdf_a, motor_descripcion, nombre_archivo_pagare

Usuario = get_user_model()


def _serializar_calculo(calculo):
    """Convierte Decimals y fechas a texto, incluso en dicts anidados.

    El desglose de prelación incluye `detalle_mora`, por lo que la conversión
    tiene que ser recursiva para no perder precisión al serializar.
    """
    if isinstance(calculo, dict):
        return {k: _serializar_calculo(v) for k, v in calculo.items()}
    if isinstance(calculo, Decimal):
        return str(calculo)
    return calculo


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = {
            'id': self.user.id,
            'nombre_completo': self.user.nombre_completo,
            'correo': self.user.correo,
            'rol': self.user.rol,
        }
        return data


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            correo = request.data.get('correo')
            usuario = Usuario.objects.filter(correo=correo).first()
            if usuario:
                usuario.ultimo_login = timezone.now()
                usuario.save(update_fields=['ultimo_login'])
                registrar_auditoria(
                    modulo='SEGURIDAD',
                    codigo_evento='INICIO_SESION',
                    nivel_severidad='INFORMATIVO',
                    usuario=usuario,
                    observaciones=f"Inicio de sesión exitoso del usuario: {usuario.correo} ({usuario.rol}).",
                    request=request
                )
        return response


class CustomTokenRefreshView(TokenRefreshView):
    pass


class UsuarioViewSet(viewsets.ModelViewSet):
    queryset = Usuario.objects.all()
    serializer_class = UsuarioSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create']:
            return [permissions.AllowAny()]
        return super().get_permissions()

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    def perform_create(self, serializer):
        usuario = serializer.save()
        datos = {
            'correo': usuario.correo,
            'nombre_completo': usuario.nombre_completo,
            'rol': usuario.rol,
            'activo': usuario.activo,
        }
        registrar_auditoria(
            modulo='SEGURIDAD',
            codigo_evento='USU_CREADO',
            nivel_severidad='INFORMATIVO',
            usuario=self.request.user if getattr(self.request.user, 'is_authenticated', False) else None,
            datos_nuevos=datos,
            observaciones=f"Creación de nuevo usuario: {usuario.correo} ({usuario.nombre_completo}) con rol {usuario.rol}.",
            request=self.request
        )

    def perform_update(self, serializer):
        usuario_prev = self.get_object()
        ant_activo = usuario_prev.activo
        ant_rol = usuario_prev.rol
        ant_correo = usuario_prev.correo
        ant_nombre = usuario_prev.nombre_completo
        datos_anteriores = {
            'correo': ant_correo,
            'nombre_completo': ant_nombre,
            'rol': ant_rol,
            'activo': ant_activo,
        }

        usuario = serializer.save()
        nuevo_activo = usuario.activo
        nuevo_rol = usuario.rol
        nuevo_correo = usuario.correo
        nuevo_nombre = usuario.nombre_completo
        datos_nuevos = {
            'correo': nuevo_correo,
            'nombre_completo': nuevo_nombre,
            'rol': nuevo_rol,
            'activo': nuevo_activo,
        }

        if not ant_activo and nuevo_activo:
            codigo_evento = 'USU_DESBLOQUEADO'
            nivel_severidad = 'ADVERTENCIA'
            observaciones = f"Usuario desbloqueado/habilitado en el sistema: {usuario.correo} ({usuario.nombre_completo})."
        elif ant_activo and not nuevo_activo:
            codigo_evento = 'USU_BLOQUEADO'
            nivel_severidad = 'ADVERTENCIA'
            observaciones = f"Usuario bloqueado/deshabilitado en el sistema: {usuario.correo} ({usuario.nombre_completo})."
        elif ant_rol != nuevo_rol:
            codigo_evento = 'USU_ROL_CAMBIADO'
            nivel_severidad = 'CRITICO'
            observaciones = f"Cambio de rol de usuario {usuario.correo}: de {ant_rol} a {nuevo_rol}."
        else:
            codigo_evento = 'USU_MODIFICADO'
            nivel_severidad = 'INFORMATIVO'
            observaciones = f"Modificación de perfil del usuario: {usuario.correo} ({usuario.nombre_completo})."

        registrar_auditoria(
            modulo='SEGURIDAD',
            codigo_evento=codigo_evento,
            nivel_severidad=nivel_severidad,
            usuario=self.request.user if getattr(self.request.user, 'is_authenticated', False) else None,
            datos_anteriores=datos_anteriores,
            datos_nuevos=datos_nuevos,
            observaciones=observaciones,
            request=self.request
        )

    def perform_destroy(self, instance):
        datos = {
            'correo': instance.correo,
            'nombre_completo': instance.nombre_completo,
            'rol': instance.rol,
            'activo': instance.activo,
        }
        observaciones = f"Eliminación de usuario del sistema: {instance.correo} ({instance.nombre_completo})."
        registrar_auditoria(
            modulo='SEGURIDAD',
            codigo_evento='USU_ELIMINADO',
            nivel_severidad='CRITICO',
            usuario=self.request.user if getattr(self.request.user, 'is_authenticated', False) else None,
            datos_anteriores=datos,
            observaciones=observaciones,
            request=self.request
        )
        instance.delete()


class ClienteViewSet(viewsets.ModelViewSet):
    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('search', None)
        if search:
            from django.db.models import Q
            queryset = queryset.filter(
                Q(nombres__icontains=search) |
                Q(apellidos__icontains=search) |
                Q(cedula__icontains=search)
            )
        return queryset.order_by('-creado_en')

    def perform_create(self, serializer):
        cliente = serializer.save()
        datos = {
            'cedula': cliente.cedula,
            'nombres': cliente.nombres,
            'apellidos': cliente.apellidos,
            'telefono': cliente.telefono,
            'direccion': cliente.direccion,
            'actividad_economica': cliente.actividad_economica,
            'activo': cliente.activo,
        }
        registrar_auditoria(
            modulo='CLIENTES',
            codigo_evento='CLI_CREADO',
            nivel_severidad='INFORMATIVO',
            usuario=self.request.user,
            cliente=cliente,
            datos_nuevos=datos,
            observaciones=f"Alta de nuevo prestatario: {cliente.nombres} {cliente.apellidos} ({cliente.cedula}).",
            request=self.request
        )

    def perform_update(self, serializer):
        cliente_prev = self.get_object()
        datos_anteriores = {
            'cedula': cliente_prev.cedula,
            'nombres': cliente_prev.nombres,
            'apellidos': cliente_prev.apellidos,
            'telefono': cliente_prev.telefono,
            'direccion': cliente_prev.direccion,
            'actividad_economica': cliente_prev.actividad_economica,
            'activo': cliente_prev.activo,
        }
        cliente = serializer.save()
        datos_nuevos = {
            'cedula': cliente.cedula,
            'nombres': cliente.nombres,
            'apellidos': cliente.apellidos,
            'telefono': cliente.telefono,
            'direccion': cliente.direccion,
            'actividad_economica': cliente.actividad_economica,
            'activo': cliente.activo,
        }
        registrar_auditoria(
            modulo='CLIENTES',
            codigo_evento='CLI_MODIFICADO',
            nivel_severidad='ADVERTENCIA',
            usuario=self.request.user,
            cliente=cliente,
            datos_anteriores=datos_anteriores,
            datos_nuevos=datos_nuevos,
            observaciones=f"Modificación en expediente de {cliente.nombres} {cliente.apellidos} ({cliente.cedula}).",
            request=self.request
        )

    def perform_destroy(self, instance):
        instance.activo = False
        instance.save(update_fields=['activo', 'actualizado_en'])
        registrar_auditoria(
            modulo='CLIENTES',
            codigo_evento='CLI_DESHABILITADO',
            nivel_severidad='ADVERTENCIA',
            usuario=self.request.user,
            cliente=instance,
            observaciones=f"Desactivación lógica de prestatario: {instance.nombres} {instance.apellidos} ({instance.cedula}).",
            request=self.request
        )

    @action(detail=True, methods=['get'])
    def prestamos(self, request, pk=None):
        cliente = self.get_object()
        prestamos = Prestamo.objects.filter(cliente=cliente).select_related('cliente').prefetch_related('fondos_detalle__fondo').order_by('-creado_en')
        serializer = PrestamoSerializer(prestamos, many=True)
        return Response(serializer.data)


class FondoViewSet(viewsets.ModelViewSet):
    queryset = Fondo.objects.all()
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'create':
            return FondoCreateSerializer
        return FondoSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('search', None)
        if search:
            from django.db.models import Q
            queryset = queryset.filter(
                Q(nombre__icontains=search) |
                Q(familiar__icontains=search) |
                Q(identificacion__icontains=search) |
                Q(nombres_titular__icontains=search) |
                Q(apellidos_titular__icontains=search) |
                Q(razon_social__icontains=search) |
                Q(ruc__icontains=search) |
                Q(representante_legal__icontains=search)
            )
        return queryset.filter(activo=True).order_by('-creado_en')

    @action(detail=True, methods=['post'])
    def inyeccion(self, request, pk=None):
        fondo = self.get_object()
        serializer = InyeccionFondoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        monto = serializer.validated_data['monto']
        descripcion = serializer.validated_data.get('descripcion', 'Inyección de capital')

        with transaction.atomic():
            fondo.refresh_from_db()
            saldo_anterior = fondo.saldo_disponible
            fondo.saldo_disponible = saldo_anterior + monto
            fondo.save(update_fields=['saldo_disponible', 'actualizado_en'])

            MovimientoFondo.objects.create(
                fondo=fondo,
                tipo=MovimientoFondo.TipoMovimiento.INYECCION,
                monto=monto,
                saldo_anterior=saldo_anterior,
                saldo_posterior=fondo.saldo_disponible,
                descripcion=descripcion
            )

            registrar_auditoria(
                modulo='FONDOS',
                codigo_evento='FONDO_INYECCION',
                nivel_severidad='INFORMATIVO',
                usuario=request.user,
                fondo=fondo,
                datos_anteriores={'saldo_disponible': str(saldo_anterior)},
                datos_nuevos={'saldo_disponible': str(fondo.saldo_disponible)},
                observaciones=f"Inyección de capital por C${monto:,.2f} al fondo '{fondo.nombre}'. Motivo: {descripcion}.",
                request=request
            )

        return Response(FondoSerializer(fondo).data)

    @action(detail=True, methods=['post'])
    def retiro(self, request, pk=None):
        fondo = self.get_object()
        serializer = RetiroFondoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        monto = serializer.validated_data['monto']
        descripcion = serializer.validated_data.get('descripcion', 'Retiro de capital')

        with transaction.atomic():
            fondo.refresh_from_db()
            if fondo.saldo_disponible < monto:
                return Response(
                    {'error': f'Saldo insuficiente. Disponible: {fondo.saldo_disponible}, Solicitado: {monto}'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            saldo_anterior = fondo.saldo_disponible
            fondo.saldo_disponible = saldo_anterior - monto
            fondo.save(update_fields=['saldo_disponible', 'actualizado_en'])

            MovimientoFondo.objects.create(
                fondo=fondo,
                tipo=MovimientoFondo.TipoMovimiento.RETIRO,
                monto=monto,
                saldo_anterior=saldo_anterior,
                saldo_posterior=fondo.saldo_disponible,
                descripcion=descripcion
            )

            registrar_auditoria(
                modulo='FONDOS',
                codigo_evento='FONDO_RETIRO',
                nivel_severidad='ADVERTENCIA',
                usuario=request.user,
                fondo=fondo,
                datos_anteriores={'saldo_disponible': str(saldo_anterior)},
                datos_nuevos={'saldo_disponible': str(fondo.saldo_disponible)},
                observaciones=f"Retiro de capital por C${monto:,.2f} del fondo '{fondo.nombre}'. Motivo: {descripcion}.",
                request=request
            )

        return Response(FondoSerializer(fondo).data)

    @action(detail=True, methods=['get'])
    def movimientos(self, request, pk=None):
        fondo = self.get_object()
        movimientos = fondo.movimientos.all()
        page = self.paginate_queryset(movimientos)
        if page is not None:
            serializer = MovimientoFondoSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = MovimientoFondoSerializer(movimientos, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def informe_financiero(self, request):
        """Informe mensual de rendimientos, intereses ganados y abonos a capital por bolsa."""
        from django.db.models import Sum, Count
        from decimal import Decimal
        from django.utils import timezone

        hoy = timezone.localdate()
        mes = int(request.query_params.get('mes', hoy.month))
        anio = int(request.query_params.get('anio', hoy.year))
        fondo_id = request.query_params.get('fondo', None)

        # 1. Transacciones vigentes del mes (excluye anuladas)
        pagos_mes = Pago.objects.filter(fecha_pago__month=mes, fecha_pago__year=anio, estado='VALIDO')
        detalles_mes = PagoFondoDetalle.objects.filter(
            pago__fecha_pago__month=mes, pago__fecha_pago__year=anio, pago__estado='VALIDO'
        )

        if fondo_id:
            detalles_mes = detalles_mes.filter(fondo_id=fondo_id)

        totales_pagos = pagos_mes.aggregate(
            total_recaudado=Sum('monto_total'),
            total_capital=Sum('aplicacion_capital'),
            total_interes=Sum('aplicacion_interes'),
            total_mora=Sum('aplicacion_mora'),
            interes_fondos=Sum('interes_fondos'),
            interes_admin=Sum('interes_administracion'),
            cantidad=Count('id')
        )

        # 2. Desembolsos del mes
        movs_desembolso = MovimientoFondo.objects.filter(
            tipo=MovimientoFondo.TipoMovimiento.DESEMBOLSO,
            creado_en__month=mes,
            creado_en__year=anio
        )
        if fondo_id:
            movs_desembolso = movs_desembolso.filter(fondo_id=fondo_id)

        total_desembolsado = movs_desembolso.aggregate(total=Sum('monto'))['total'] or Decimal('0.00')

        # 3. Transacciones canceladas / anuladas en el mes
        pagos_cancelados = Pago.objects.filter(fecha_pago__month=mes, fecha_pago__year=anio, estado='ANULADO')
        totales_cancelados = pagos_cancelados.aggregate(
            total_revertido=Sum('monto_total'),
            capital_revertido=Sum('aplicacion_capital'),
            interes_revertido=Sum('aplicacion_interes'),
            cantidad=Count('id')
        )
        cancelados_lista = []
        for p in pagos_cancelados.select_related('prestamo__cliente', 'anulado_por').order_by('-anulado_en', '-fecha_pago')[:100]:
            cancelados_lista.append({
                'pago_id': p.id,
                'codigo_comprobante': p.codigo_comprobante,
                'codigo_seguridad': p.codigo_seguridad,
                'fecha_pago': str(p.fecha_pago),
                'fecha_anulacion': str(p.anulado_en) if p.anulado_en else '',
                'cliente': str(p.prestamo.cliente) if p.prestamo else 'Desconocido',
                'prestamo_id': p.prestamo_id,
                'monto_total': str(p.monto_total),
                'aplicacion_capital': str(p.aplicacion_capital),
                'aplicacion_interes': str(p.aplicacion_interes),
                'motivo_anulacion': p.motivo_anulacion or '',
                'anulado_por_nombre': p.anulado_por.nombre_completo if p.anulado_por else 'Administrador',
            })

        # 4. Datos del mes anterior para comparativa MoM
        if mes == 1:
            mes_ant = 12
            anio_ant = anio - 1
        else:
            mes_ant = mes - 1
            anio_ant = anio

        pagos_ant = Pago.objects.filter(fecha_pago__month=mes_ant, fecha_pago__year=anio_ant, estado='VALIDO')
        totales_ant = pagos_ant.aggregate(
            total_recaudado=Sum('monto_total'),
            total_capital=Sum('aplicacion_capital'),
            total_interes=Sum('aplicacion_interes'),
            total_mora=Sum('aplicacion_mora'),
            interes_fondos=Sum('interes_fondos'),
            interes_admin=Sum('interes_administracion'),
            cantidad=Count('id')
        )
        desemb_ant = MovimientoFondo.objects.filter(
            tipo=MovimientoFondo.TipoMovimiento.DESEMBOLSO,
            creado_en__month=mes_ant,
            creado_en__year=anio_ant
        )
        if fondo_id:
            desemb_ant = desemb_ant.filter(fondo_id=fondo_id)
        total_desemb_ant = desemb_ant.aggregate(total=Sum('monto'))['total'] or Decimal('0.00')

        def calc_variacion(val_actual, val_anterior):
            act = Decimal(str(val_actual or '0.00'))
            ant = Decimal(str(val_anterior or '0.00'))
            diff = act - ant
            pct = Decimal('0.00')
            if ant > Decimal('0.00'):
                pct = ((diff / ant) * Decimal('100.00')).quantize(Decimal('0.01'))
            elif act > Decimal('0.00') and ant == Decimal('0.00'):
                pct = Decimal('100.00')
            return {
                'actual': str(act),
                'anterior': str(ant),
                'diferencia': str(diff),
                'porcentaje': str(pct),
            }

        recaudado = totales_pagos['total_recaudado'] or Decimal('0.00')
        recaudado_ant = totales_ant['total_recaudado'] or Decimal('0.00')

        comparativa = {
            'mes_anterior': mes_ant,
            'anio_anterior': anio_ant,
            'total_recaudado': calc_variacion(recaudado, recaudado_ant),
            'capital_retornado': calc_variacion(totales_pagos['total_capital'], totales_ant['total_capital']),
            'interes_total': calc_variacion(totales_pagos['total_interes'], totales_ant['total_interes']),
            'interes_fondos': calc_variacion(totales_pagos['interes_fondos'], totales_ant['interes_fondos']),
            'interes_admin': calc_variacion(totales_pagos['interes_admin'], totales_ant['interes_admin']),
            'mora_total': calc_variacion(totales_pagos['total_mora'], totales_ant['total_mora']),
            'desembolsos_mes': calc_variacion(total_desembolsado, total_desemb_ant),
            'cantidad_pagos': calc_variacion(totales_pagos['cantidad'], totales_ant['cantidad']),
        }

        # 5. Desglose por fondo familiar
        fondos = Fondo.objects.filter(activo=True)
        if fondo_id:
            fondos = fondos.filter(id=fondo_id)

        desglose_fondos = []
        for f in fondos:
            dets = detalles_mes.filter(fondo=f).aggregate(
                capital_reintegrado=Sum('capital_reintegrado'),
                ganancia_interes=Sum('ganancia'),
                cantidad_abonos=Count('id')
            )
            desemb_f = movs_desembolso.filter(fondo=f).aggregate(total=Sum('monto'))['total'] or Decimal('0.00')
            cap_ret = dets['capital_reintegrado'] or Decimal('0.00')
            gan_int = dets['ganancia_interes'] or Decimal('0.00')
            total_acreditado = cap_ret + gan_int
            flujo_neto = total_acreditado - desemb_f

            desglose_fondos.append({
                'fondo_id': f.id,
                'nombre': f.nombre,
                'familiar': f.familiar,
                'saldo_actual': str(f.saldo_disponible),
                'capital_reintegrado': str(cap_ret),
                'ganancia_interes': str(gan_int),
                'total_acreditado': str(total_acreditado),
                'desembolsos_mes': str(desemb_f),
                'flujo_neto': str(flujo_neto),
                'cantidad_abonos': dets['cantidad_abonos'] or 0,
            })

        # 6. Transacciones vigentes detalladas
        pagos_lista = []
        for d in detalles_mes.select_related('pago__prestamo__cliente', 'fondo').order_by('-pago__fecha_pago')[:100]:
            pagos_lista.append({
                'pago_id': d.pago.id,
                'codigo_comprobante': d.pago.codigo_comprobante,
                'fecha_pago': str(d.pago.fecha_pago),
                'cliente': str(d.pago.prestamo.cliente) if d.pago.prestamo else 'Desconocido',
                'prestamo_id': d.pago.prestamo_id,
                'fondo_id': d.fondo_id,
                'fondo_nombre': d.fondo.nombre,
                'porcentaje_pi': str(d.porcentaje_pi),
                'capital_reintegrado': str(d.capital_reintegrado),
                'ganancia_interes': str(d.ganancia),
                'monto_total': str(d.pago.monto_total),
                'aplicacion_capital': str(d.pago.aplicacion_capital),
                'aplicacion_interes': str(d.pago.aplicacion_interes),
                'aplicacion_mora': str(d.pago.aplicacion_mora),
                'metodo_pago': d.pago.get_metodo_pago_display(),
                'referencia_bancaria': d.pago.referencia_bancaria,
            })

        return Response({
            'mes': mes,
            'anio': anio,
            'resumen': {
                'total_recaudado': str(recaudado),
                'capital_retornado': str(totales_pagos['total_capital'] or Decimal('0.00')),
                'interes_total': str(totales_pagos['total_interes'] or Decimal('0.00')),
                'interes_fondos': str(totales_pagos['interes_fondos'] or Decimal('0.00')),
                'interes_admin': str(totales_pagos['interes_admin'] or Decimal('0.00')),
                'mora_total': str(totales_pagos['total_mora'] or Decimal('0.00')),
                'desembolsos_mes': str(total_desembolsado),
                'flujo_neto': str(recaudado - total_desembolsado),
                'cantidad_pagos': totales_pagos['cantidad'] or 0,
            },
            'comparativa_mes_anterior': comparativa,
            'seccion_cancelados': {
                'cantidad': totales_cancelados['cantidad'] or 0,
                'total_revertido': str(totales_cancelados['total_revertido'] or Decimal('0.00')),
                'capital_revertido': str(totales_cancelados['capital_revertido'] or Decimal('0.00')),
                'interes_revertido': str(totales_cancelados['interes_revertido'] or Decimal('0.00')),
                'transacciones_canceladas': cancelados_lista,
            },
            'desglose_fondos': desglose_fondos,
            'transacciones': pagos_lista,
        })



class DashboardViewSet(viewsets.ViewSet):
    """Agregados del panel de control.

    - `GET /api/dashboard/`      agregados de cartera (solo ADMINISTRADOR)
    - `GET /api/dashboard/caja/` recaudos del propio usuario (cualquier rol)
    - `GET /api/dashboard/agenda/` agenda de cobranza sin datos de fondos
    """

    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        if not EsAdministrador().has_permission(request, self):
            return Response({'detail': EsAdministrador.message}, status=status.HTTP_403_FORBIDDEN)
        return Response(resumen_dashboard())

    @action(detail=False, methods=['get'])
    def caja(self, request):
        fecha = request.query_params.get('fecha')
        return Response(caja_de_usuario(request.user, fecha=fecha))

    @action(detail=False, methods=['get'])
    def agenda(self, request):
        return Response(agenda_cobrador(busqueda=request.query_params.get('search')))


class PrestamoViewSet(viewsets.ModelViewSet):
    queryset = Prestamo.objects.select_related('cliente').prefetch_related('fondos_detalle__fondo')
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'create':
            return PrestamoCreateSerializer
        return PrestamoSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('search', None)
        estado = self.request.query_params.get('estado', None)
        cliente = self.request.query_params.get('cliente', None)
        if search:
            from django.db.models import Q
            queryset = queryset.filter(
                Q(cliente__nombres__icontains=search) |
                Q(cliente__apellidos__icontains=search) |
                Q(cliente__cedula__icontains=search)
            )
        if estado:
            queryset = queryset.filter(estado=estado)
        if cliente:
            queryset = queryset.filter(cliente_id=cliente)
        return queryset.order_by('-creado_en')

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        fondos_detalle_data = serializer.validated_data.pop('fondos_detalle')
        monto_principal = serializer.validated_data['monto_principal']

        with transaction.atomic():
            prestamo = Prestamo.objects.create(
                saldo_insoluto=monto_principal,
                **serializer.validated_data
            )

            for fd_data in fondos_detalle_data:
                fondo = fd_data['fondo']
                monto_aportado = Decimal(str(fd_data['monto_aportado']))
                porcentaje_pi = Decimal(str(fd_data['porcentaje_pi']))

                fondo.refresh_from_db()
                if fondo.saldo_disponible < monto_aportado:
                    raise serializers.ValidationError({
                        "fondos_detalle": f"El fondo '{fondo.nombre}' no tiene saldo suficiente."
                    })

                saldo_anterior = fondo.saldo_disponible
                fondo.saldo_disponible = saldo_anterior - monto_aportado
                fondo.save(update_fields=['saldo_disponible', 'actualizado_en'])

                PrestamoFondoDetalle.objects.create(
                    prestamo=prestamo,
                    fondo=fondo,
                    monto_aportado=monto_aportado,
                    porcentaje_pi=porcentaje_pi
                )

                MovimientoFondo.objects.create(
                    fondo=fondo,
                    tipo=MovimientoFondo.TipoMovimiento.DESEMBOLSO,
                    monto=monto_aportado,
                    saldo_anterior=saldo_anterior,
                    saldo_posterior=fondo.saldo_disponible,
                    descripcion=f'Desembolso préstamo #{prestamo.id}'
                )

        registrar_auditoria(
            modulo='PRESTAMOS',
            codigo_evento='PRESTAMO_CREADO',
            nivel_severidad='INFORMATIVO',
            usuario=request.user,
            cliente=prestamo.cliente,
            prestamo=prestamo,
            datos_nuevos={
                'monto_principal': str(prestamo.monto_principal),
                'tasa_interes': str(prestamo.tasa_interes),
                'plazo_meses': prestamo.plazo_meses,
                'periodicidad': prestamo.periodicidad,
            },
            observaciones=f"Creación y desembolso de préstamo #{prestamo.id} por C${prestamo.monto_principal:,.2f} a favor de {prestamo.cliente}.",
            request=request
        )

        output_serializer = PrestamoSerializer(prestamo)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def amortizacion(self, request, pk=None):
        """Proyección de cuotas con interés sobre saldo insoluto (Ley 176)."""
        prestamo = self.get_object()
        validar_tasa(prestamo.tasa_interes)
        return Response(generar_proyeccion(prestamo))

    @action(detail=False, methods=['post'])
    def simular(self, request):
        """Cuota estimada y tabla de amortización sin persistir el préstamo."""
        serializer = PrestamoSimulacionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        prestamo = Prestamo(
            cliente=data.get('cliente'),
            monto_principal=data['monto_principal'],
            tasa_interes=data['tasa_interes'],
            plazo_meses=data['plazo_meses'],
            periodicidad=data['periodicidad'],
            fecha_primer_corte=data['fecha_primer_corte'],
            fecha_desembolso=data['fecha_primer_corte'],
        )
        prestamo.id = None

        proyeccion = generar_proyeccion(prestamo)
        if proyeccion['periodos']:
            proyeccion['cuota_estimada'] = proyeccion['periodos'][0]['cuota']
        return Response(proyeccion)

    @action(detail=True, methods=['post'])
    def preview_pago(self, request, pk=None):
        """Desglose de prelación (Art. 3180) del abono antes de confirmarlo.

        No escribe nada: la misma aritmética de `aplicar_pago` muestra en la
        interfaz mora, interés, capital y nuevo saldo, incluyendo el bloqueo
        por interés mínimo del ciclo vencido.
        """
        prestamo = self.get_object()
        serializer = PagoPreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        calculo = simular_pago(prestamo, data['monto'], data['fecha_pago'])
        return Response(_serializar_calculo(calculo))

    @action(detail=True, methods=['post'])
    def pagos(self, request, pk=None):
        """Asienta un cobro con imputación legal (Art. 3180 Código Civil)."""
        prestamo = self.get_object()
        serializer = PagoImputacionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        banco = None
        if data.get('banco_id'):
            banco = CatBanco.objects.filter(id=data['banco_id']).first()

        pago, info = aplicar_pago(
            prestamo=prestamo,
            monto=data['monto'],
            fecha_pago=data['fecha_pago'],
            metodo_pago=data['metodo_pago'],
            referencia_bancaria=data.get('referencia_bancaria', ''),
            usuario=request.user,
            banco=banco,
            efectivo_recibido=data.get('efectivo_recibido'),
            cambio_devuelto=data.get('cambio_devuelto'),
        )

        output = PagoSerializer(pago, context=self.get_serializer_context()).data
        output['exceso_no_aplicado'] = str(info['exceso_no_aplicado'])
        return Response(output, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def pagare(self, request, pk=None):
        """Descarga el pagaré legal en PDF (o HTML con `?formato=html`)."""
        prestamo = self.get_object()
        usuario = getattr(request.user, 'nombre_completo', '') or str(request.user)

        if request.query_params.get('formato') == 'html':
            return HttpResponse(html_pagare(prestamo, usados_por=usuario), content_type='text/html')

        try:
            contenido = pdf_pagare(prestamo, usados_por=usuario)
        except MotorPdfNoDisponible as exc:
            # 503: el HTML sigue disponible para imprimir desde el navegador.
            return Response(
                {'detail': str(exc), 'motor_pdf': motor_descripcion(),
                 'html_disponible': True},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        respuesta = HttpResponse(contenido, content_type='application/pdf')
        respuesta['Content-Disposition'] = (
            f'attachment; filename="{nombre_archivo_pagare(prestamo.cliente)}"'
        )
        # Informa al cliente si el documento cumple PDF/A: solo WeasyPrint lo logra.
        respuesta['X-PDF-Variante'] = 'PDF/A-2b' if es_pdf_a() else 'PDF-1.4'
        return respuesta

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def cancelar(self, request, pk=None):
        """Cancela y revierte un contrato de préstamo dentro de la ventana de tolerancia (72h)."""
        prestamo = self.get_object()

        # 1. Permiso exclusivo para Administrador o Superusuario
        rol_usuario = getattr(request.user, 'rol', None)
        if rol_usuario != RolUsuario.ADMINISTRADOR and not getattr(request.user, 'is_superuser', False):
            raise PermissionDenied('Solo usuarios con rol Administrador pueden cancelar contratos de préstamo.')

        # 2. Validar que no esté ya cancelado
        if prestamo.estado == Prestamo.Estado.CANCELADO:
            raise serializers.ValidationError({'error': 'El contrato de préstamo ya se encuentra cancelado.'})

        # 3. Validar motivo obligatorio (mínimo 15 caracteres)
        motivo = (request.data.get('motivo') or '').strip()
        if len(motivo) < 15:
            raise serializers.ValidationError({
                'motivo': 'El motivo de cancelación es obligatorio y debe contener al menos 15 caracteres descriptivos.'
            })

        # 4. Validar ventana de tolerancia
        config = ConfiguracionSistema.get_solo()
        limite_horas = config.horas_tolerancia_anulacion or 72
        horas_transcurridas = (timezone.now() - prestamo.creado_en).total_seconds() / 3600.0
        if horas_transcurridas > limite_horas:
            raise serializers.ValidationError({
                'error': f'Ha expirado la tolerancia máxima de {limite_horas} horas para cancelar este contrato (tiempo transcurrido: {int(horas_transcurridas)}h).'
            })

        # 5. Validar que no tenga pagos válidos activos
        pagos_activos = Pago.objects.filter(prestamo=prestamo, estado='VALIDO').count()
        if pagos_activos > 0:
            raise serializers.ValidationError({
                'error': f'El contrato tiene {pagos_activos} recibo(s) de pago activo(s). Debe anularlos en caja previamente para poder rescindir el contrato.'
            })

        # 6. Reversión atómica de fondos familiares y anulación
        reversiones = []
        with transaction.atomic():
            detalles_fondos = list(prestamo.fondos_detalle.select_related('fondo').all())
            for det in detalles_fondos:
                fondo = det.fondo
                fondo.refresh_from_db()
                saldo_anterior = fondo.saldo_disponible
                fondo.saldo_disponible = saldo_anterior + det.monto_aportado
                fondo.save(update_fields=['saldo_disponible', 'actualizado_en'])

                MovimientoFondo.objects.create(
                    fondo=fondo,
                    usuario=request.user,
                    tipo=MovimientoFondo.TipoMovimiento.REINTEGRO,
                    monto=det.monto_aportado,
                    saldo_anterior=saldo_anterior,
                    saldo_posterior=fondo.saldo_disponible,
                    descripcion=f"Reversión de desembolso por cancelación de contrato #{prestamo.id}. Motivo: {motivo}"
                )
                reversiones.append({
                    'fondo_id': fondo.id,
                    'fondo_nombre': fondo.nombre,
                    'capital_restituido': str(det.monto_aportado),
                    'saldo_posterior': str(fondo.saldo_disponible)
                })

            prestamo.estado = Prestamo.Estado.CANCELADO
            prestamo.saldo_insoluto = Decimal('0.00')
            prestamo.save(update_fields=['estado', 'saldo_insoluto', 'actualizado_en'])

        # 7. Bitácora de auditoría inmutable
        registrar_auditoria(
            modulo='PRESTAMOS',
            codigo_evento='PRESTAMO_CANCELADO',
            nivel_severidad='CRITICO',
            usuario=request.user,
            cliente=prestamo.cliente,
            prestamo=prestamo,
            datos_anteriores={
                'estado': 'VIGENTE',
                'monto_principal': str(prestamo.monto_principal),
                'saldo_insoluto': str(prestamo.monto_principal),
            },
            datos_nuevos={
                'estado': 'CANCELADO',
                'saldo_insoluto': '0.00',
                'motivo': motivo,
                'reversiones_fondos': reversiones,
            },
            observaciones=f"Cancelación y rescisión de contrato de préstamo #{prestamo.id} ({prestamo.cliente}) dentro de ventana de tolerancia. Motivo: {motivo}",
            request=request
        )

        return Response({
            'mensaje': f'El contrato de préstamo #{prestamo.id} fue cancelado exitosamente y su capital restituido a los fondos.',
            'prestamo': PrestamoSerializer(prestamo).data
        }, status=status.HTTP_200_OK)



class PagoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Pago.objects.select_related('prestamo__cliente', 'usuario').prefetch_related(
        'fondos_detalle__fondo', 'ganancia_administracion')
    serializer_class = PagoReciboSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        prestamo_id = self.request.query_params.get('prestamo', None)
        cliente_id = self.request.query_params.get('cliente', None)
        fecha_pago = self.request.query_params.get('fecha', None)
        usuario_id = self.request.query_params.get('usuario', None)
        
        if prestamo_id:
            queryset = queryset.filter(prestamo_id=prestamo_id)
        if cliente_id:
            queryset = queryset.filter(prestamo__cliente_id=cliente_id)
        if fecha_pago:
            queryset = queryset.filter(fecha_pago=fecha_pago)
        if usuario_id:
            queryset = queryset.filter(usuario_id=usuario_id)
            
        estado = self.request.query_params.get('estado', None)
        if estado:
            queryset = queryset.filter(estado=estado)
        return queryset.order_by('-creado_en')

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def anular(self, request, pk=None):
        """Cancela y revierte un recibo de pago dentro de la ventana de tolerancia."""
        pago = self.get_object()
        motivo = request.data.get('motivo', '')
        pago_anulado = anular_pago(pago, request.user, motivo, request=request)
        serializer = self.get_serializer(pago_anulado)
        return Response({
            'mensaje': f'El recibo {pago_anulado.codigo_comprobante} fue anulado exitosamente.',
            'recibo': serializer.data
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def recibo_html(self, request, pk=None):
        """Retorna el recibo de pago oficial en HTML formal listo para abrir en nueva pestaña e imprimir."""
        pago = self.get_object()
        html = html_recibo(pago, request.user)
        return HttpResponse(html, content_type='text/html')


class AuditoriaViewSet(viewsets.ReadOnlyModelViewSet):
    """Consulta de bitácora inmutable de auditoría y trazabilidad (Ley N° 977 UAF)."""
    queryset = BitacoraActividad.objects.select_related(
        'usuario', 'cliente', 'prestamo', 'pago', 'fondo', 'tipo_actividad'
    )
    serializer_class = BitacoraActividadSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        es_admin = getattr(user, 'rol', None) == RolUsuario.ADMINISTRADOR or getattr(user, 'is_superuser', False)

        queryset = self.queryset
        if not es_admin:
            queryset = queryset.filter(usuario=user)

        modulo = self.request.query_params.get('modulo')
        severidad = self.request.query_params.get('severidad')
        codigo_evento = self.request.query_params.get('evento')
        usuario_id = self.request.query_params.get('usuario')
        cliente_id = self.request.query_params.get('cliente')
        fecha_desde = self.request.query_params.get('fecha_desde')
        fecha_hasta = self.request.query_params.get('fecha_hasta')
        search = self.request.query_params.get('search')

        if modulo:
            queryset = queryset.filter(modulo__iexact=modulo)
        if severidad:
            queryset = queryset.filter(nivel_severidad__iexact=severidad)
        if codigo_evento:
            queryset = queryset.filter(codigo_evento__iexact=codigo_evento)
        if usuario_id and es_admin:
            queryset = queryset.filter(usuario_id=usuario_id)
        if cliente_id:
            queryset = queryset.filter(cliente_id=cliente_id)
        if fecha_desde:
            queryset = queryset.filter(creado_en__date__gte=fecha_desde)
        if fecha_hasta:
            queryset = queryset.filter(creado_en__date__lte=fecha_hasta)
        if search:
            from django.db.models import Q
            queryset = queryset.filter(
                Q(observaciones__icontains=search) |
                Q(codigo_evento__icontains=search) |
                Q(modulo__icontains=search) |
                Q(pago__codigo_comprobante__icontains=search) |
                Q(cliente__nombres__icontains=search) |
                Q(cliente__apellidos__icontains=search) |
                Q(cliente__cedula__icontains=search) |
                Q(usuario__nombre_completo__icontains=search) |
                Q(usuario__correo__icontains=search) |
                Q(direccion_ip__icontains=search)
            )

        return queryset.order_by('-creado_en')

    @action(detail=False, methods=['get'])
    def resumen(self, request):
        user = request.user
        es_admin = getattr(user, 'rol', None) == RolUsuario.ADMINISTRADOR or getattr(user, 'is_superuser', False)
        qs = BitacoraActividad.objects.all() if es_admin else BitacoraActividad.objects.filter(usuario=user)

        hoy = timezone.localdate()
        primer_dia_mes = hoy.replace(day=1)

        total_mes = qs.filter(creado_en__date__gte=primer_dia_mes).count()
        total_hoy = qs.filter(creado_en__date=hoy).count()
        total_criticos = qs.filter(nivel_severidad='CRITICO', creado_en__date__gte=primer_dia_mes).count()
        total_advertencias = qs.filter(nivel_severidad='ADVERTENCIA', creado_en__date__gte=primer_dia_mes).count()

        recibos_anulados = Pago.objects.filter(estado='ANULADO', anulado_en__date__gte=primer_dia_mes)
        if not es_admin:
            recibos_anulados = recibos_anulados.filter(usuario=user)
        total_anulados = recibos_anulados.count()
        monto_anulado = recibos_anulados.aggregate(total=Sum('monto_total'))['total'] or Decimal('0.00')

        clientes_auditados = qs.filter(
            modulo='CLIENTES',
            codigo_evento='CLI_MODIFICADO',
            creado_en__date__gte=primer_dia_mes
        ).values('cliente_id').distinct().count()

        ultimas_24h = timezone.now() - timezone.timedelta(hours=24)
        anulaciones_recientes = Pago.objects.filter(estado='ANULADO', anulado_en__gte=ultimas_24h).select_related('anulado_por', 'prestamo__cliente')
        alerta_anulaciones = [
            {
                'id': p.id,
                'codigo': p.codigo_comprobante,
                'monto': str(p.monto_total),
                'cliente': str(p.prestamo.cliente),
                'anulado_por': p.anulado_por.nombre_completo if p.anulado_por else 'Sistema',
                'motivo': p.motivo_anulacion,
                'fecha': p.anulado_en.isoformat() if p.anulado_en else None
            }
            for p in anulaciones_recientes[:5]
        ]

        return Response({
            'total_eventos_mes': total_mes,
            'total_eventos_hoy': total_hoy,
            'total_criticos_mes': total_criticos,
            'total_advertencias_mes': total_advertencias,
            'recibos_anulados_mes': total_anulados,
            'monto_anulado_mes': str(monto_anulado),
            'clientes_modificados_mes': clientes_auditados,
            'alertas_anulaciones_recientes': alerta_anulaciones,
            'es_admin': es_admin
        })


class ConfiguracionViewSet(viewsets.ViewSet):
    """Gestión de políticas y parámetros del sistema (solo ADMINISTRADOR)."""

    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        config = ConfiguracionSistema.get_solo()
        return Response(ConfiguracionSistemaSerializer(config).data)

    def create(self, request):
        return self._guardar(request)

    def partial_update(self, request, pk=None):
        return self._guardar(request)

    def update(self, request, pk=None):
        return self._guardar(request)

    def _guardar(self, request):
        if not EsAdministrador().has_permission(request, self):
            return Response({'detail': EsAdministrador.message}, status=status.HTTP_403_FORBIDDEN)
        config = ConfiguracionSistema.get_solo()
        datos_anteriores = {
            'modo_estricto': config.modo_estricto,
            'permitir_superar_usura': config.permitir_superar_usura,
            'tasa_maxima_legal': str(config.tasa_maxima_legal),
            'dias_gracia': config.dias_gracia,
            'permitir_plazo_indefinido': config.permitir_plazo_indefinido,
            'tasa_mora_diaria': str(config.tasa_mora_diaria),
            'horas_tolerancia_anulacion': config.horas_tolerancia_anulacion,
        }
        serializer = ConfiguracionSistemaSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        config_guardada = serializer.save()
        datos_nuevos = {
            'modo_estricto': config_guardada.modo_estricto,
            'permitir_superar_usura': config_guardada.permitir_superar_usura,
            'tasa_maxima_legal': str(config_guardada.tasa_maxima_legal),
            'dias_gracia': config_guardada.dias_gracia,
            'permitir_plazo_indefinido': config_guardada.permitir_plazo_indefinido,
            'tasa_mora_diaria': str(config_guardada.tasa_mora_diaria),
            'horas_tolerancia_anulacion': config_guardada.horas_tolerancia_anulacion,
        }
        registrar_auditoria(
            modulo='SISTEMA',
            codigo_evento='CONF_MODIFICADA',
            nivel_severidad='ADVERTENCIA',
            usuario=request.user,
            datos_anteriores=datos_anteriores,
            datos_nuevos=datos_nuevos,
            observaciones="Actualización de parámetros operativos y políticas generales del sistema.",
            request=request
        )
        return Response(serializer.data)


class CatalogoViewSet(viewsets.ViewSet):
    """Catálogos maestros del sistema para formularios normalizados."""
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        return Response({
            'departamentos': CatDepartamentoSerializer(CatDepartamento.objects.all(), many=True).data,
            'municipios': CatMunicipioSerializer(CatMunicipio.objects.all(), many=True).data,
            'actividades': CatActividadEconomicaSerializer(CatActividadEconomica.objects.all(), many=True).data,
            'bancos': CatBancoSerializer(CatBanco.objects.filter(activo=True), many=True).data,
            'estados_prestamo': CatEstadoPrestamoSerializer(CatEstadoPrestamo.objects.all(), many=True).data,
            'estados_cuota': CatEstadoCuotaSerializer(CatEstadoCuota.objects.all(), many=True).data,
            'estados_cliente': CatEstadoClienteSerializer(CatEstadoCliente.objects.all(), many=True).data,
            'estados_caja': CatEstadoCajaSerializer(CatEstadoCaja.objects.all(), many=True).data,
        })

    @action(detail=False, methods=['get'])
    def bancos(self, request):
        return Response(CatBancoSerializer(CatBanco.objects.filter(activo=True), many=True).data)

    @action(detail=False, methods=['get'])
    def actividades(self, request):
        return Response(CatActividadEconomicaSerializer(CatActividadEconomica.objects.all(), many=True).data)

    @action(detail=False, methods=['get'])
    def departamentos(self, request):
        return Response(CatDepartamentoSerializer(CatDepartamento.objects.all(), many=True).data)

    @action(detail=False, methods=['get'])
    def municipios(self, request):
        dep_id = request.query_params.get('departamento')
        qs = CatMunicipio.objects.all()
        if dep_id:
            qs = qs.filter(departamento_id=dep_id)
        return Response(CatMunicipioSerializer(qs, many=True).data)


class PermisoViewSet(viewsets.ViewSet):
    """Gestión de matriz de permisos por rol (RBAC)."""
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        permisos = CatPermiso.objects.all()
        roles_permisos = RolPermiso.objects.select_related('permiso').all()

        permisos_list = CatPermisoSerializer(permisos, many=True).data
        matriz = {
            RolUsuario.ADMINISTRADOR: {},
            RolUsuario.COBRANZA: {},
        }
        for rp in roles_permisos:
            if rp.rol not in matriz:
                matriz[rp.rol] = {}
            matriz[rp.rol][rp.permiso.codigo] = rp.activo

        return Response({
            'permisos': permisos_list,
            'roles': [
                {'codigo': RolUsuario.ADMINISTRADOR, 'nombre': 'Administrador'},
                {'codigo': RolUsuario.COBRANZA, 'nombre': 'Oficial de Cobranza'},
            ],
            'matriz': matriz,
        })

    def create(self, request):
        if not EsAdministrador().has_permission(request, self):
            return Response({'detail': EsAdministrador.message}, status=status.HTTP_403_FORBIDDEN)

        rol = request.data.get('rol')
        permiso_codigo = request.data.get('permiso_codigo')
        permiso_id = request.data.get('permiso_id')
        activo = request.data.get('activo', True)

        if not rol or (not permiso_codigo and not permiso_id):
            return Response(
                {'detail': 'rol y permiso_codigo o permiso_id son requeridos'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if permiso_id:
            permiso = CatPermiso.objects.filter(id=permiso_id).first()
        else:
            permiso = CatPermiso.objects.filter(codigo=permiso_codigo).first()

        if not permiso:
            return Response({'detail': 'Permiso no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        rp_prev = RolPermiso.objects.filter(rol=rol, permiso=permiso).first()
        estado_prev = rp_prev.activo if rp_prev else False

        rp, _ = RolPermiso.objects.update_or_create(
            rol=rol,
            permiso=permiso,
            defaults={'activo': bool(activo)}
        )

        registrar_auditoria(
            modulo='SEGURIDAD',
            codigo_evento='POLITICA_MODIFICADA',
            nivel_severidad='CRITICO',
            usuario=request.user,
            datos_anteriores={'rol': rol, 'permiso': permiso.codigo, 'activo': estado_prev},
            datos_nuevos={'rol': rol, 'permiso': permiso.codigo, 'activo': bool(activo)},
            observaciones=f"Modificación de política para {rol}: permiso '{permiso.nombre}' ({permiso.codigo}) {'concedido' if bool(activo) else 'revocado'}.",
            request=request
        )

        return Response({
            'rol': rp.rol,
            'permiso_codigo': permiso.codigo,
            'activo': rp.activo,
            'mensaje': 'Permiso actualizado correctamente'
        })


class SesionCajaViewSet(viewsets.ModelViewSet):
    """Control formal de apertura, arqueo y cierre físico diario de caja."""
    serializer_class = SesionCajaSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.rol == RolUsuario.ADMINISTRADOR:
            return SesionCaja.objects.all().select_related('usuario', 'supervisor_cierre')
        return SesionCaja.objects.filter(usuario=user).select_related('usuario', 'supervisor_cierre')

    @action(detail=False, methods=['get'])
    def activa(self, request):
        sesion = SesionCaja.objects.filter(usuario=request.user, estado='ABIERTA').first()
        if not sesion:
            return Response({'activa': False, 'sesion': None})
        return Response({'activa': True, 'sesion': SesionCajaSerializer(sesion).data})

    @action(detail=False, methods=['post'])
    def apertura(self, request):
        activa = SesionCaja.objects.filter(usuario=request.user, estado='ABIERTA').first()
        if activa:
            return Response(
                {'detail': 'Ya tienes una sesión de caja abierta', 'sesion': SesionCajaSerializer(activa).data},
                status=status.HTTP_400_BAD_REQUEST
            )
        saldo_inicial = Decimal(str(request.data.get('saldo_inicial_efectivo', '0.00')))
        observaciones = request.data.get('observaciones', '')
        sesion = SesionCaja.objects.create(
            usuario=request.user,
            saldo_inicial_efectivo=saldo_inicial,
            observaciones=observaciones,
            estado='ABIERTA'
        )
        return Response(SesionCajaSerializer(sesion).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def cierre(self, request, pk=None):
        sesion = self.get_object()
        if sesion.estado != 'ABIERTA':
            return Response({'detail': 'Esta sesión ya fue cerrada'}, status=status.HTTP_400_BAD_REQUEST)

        efectivo_declarado = Decimal(str(request.data.get('efectivo_declarado', '0.00')))
        observaciones = request.data.get('observaciones', '')

        pagos_sesion = sesion.pagos.all()
        cobrado_efectivo = pagos_sesion.filter(metodo_pago='EFECTIVO').aggregate(t=Sum('monto_total'))['t'] or Decimal('0.00')
        cobrado_banco = pagos_sesion.exclude(metodo_pago='EFECTIVO').aggregate(t=Sum('monto_total'))['t'] or Decimal('0.00')

        esperado_efectivo = sesion.saldo_inicial_efectivo + cobrado_efectivo
        diferencia = efectivo_declarado - esperado_efectivo

        estado_cierre = 'CERRADA_CONCILIADA'
        if diferencia > 0:
            estado_cierre = 'CON_SOBRANTE'
        elif diferencia < 0:
            estado_cierre = 'CON_FALTANTE'

        sesion.fecha_cierre = timezone.now()
        sesion.total_cobrado_efectivo = cobrado_efectivo
        sesion.total_cobrado_banco = cobrado_banco
        sesion.efectivo_declarado = efectivo_declarado
        sesion.diferencia = diferencia
        sesion.estado = estado_cierre
        sesion.supervisor_cierre = request.user
        if observaciones:
            sesion.observaciones = f"{sesion.observaciones}\nCierre: {observaciones}".strip()
        sesion.save()

        return Response(SesionCajaSerializer(sesion).data)