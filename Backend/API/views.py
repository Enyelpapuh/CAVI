from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Sum, F
from django.http import HttpResponse
from decimal import Decimal
from .models import (
    Usuario, Cliente, Fondo, MovimientoFondo, Prestamo, PrestamoFondoDetalle, Pago,
    ConfiguracionSistema,
)
from .serializers import (
    UsuarioSerializer, UsuarioLoginSerializer, ClienteSerializer,
    FondoSerializer, FondoCreateSerializer, InyeccionFondoSerializer,
    RetiroFondoSerializer, MovimientoFondoSerializer,
    PrestamoSerializer, PrestamoCreateSerializer, PrestamoFondoDetalleSerializer,
    PagoImputacionSerializer, PagoSerializer, PagoReciboSerializer,
    PagoPreviewSerializer, PrestamoSimulacionSerializer,
    ConfiguracionSistemaSerializer,
)
from .permissions import EsAdministrador
from .services.amortizacion import generar_proyeccion, validar_tasa
from .services.dashboard import resumen_dashboard, caja_de_usuario, agenda_cobrador
from .services.pagos import aplicar_pago, simular_pago
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
                Q(familiar__icontains=search)
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

        pagos_mes = Pago.objects.filter(fecha_pago__month=mes, fecha_pago__year=anio)
        detalles_mes = PagoFondoDetalle.objects.filter(pago__fecha_pago__month=mes, pago__fecha_pago__year=anio)

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

        movs_desembolso = MovimientoFondo.objects.filter(
            tipo=MovimientoFondo.TipoMovimiento.DESEMBOLSO,
            creado_en__month=mes,
            creado_en__year=anio
        )
        if fondo_id:
            movs_desembolso = movs_desembolso.filter(fondo_id=fondo_id)

        total_desembolsado = movs_desembolso.aggregate(total=Sum('monto'))['total'] or Decimal('0.00')

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

        pagos_lista = []
        for d in detalles_mes.select_related('pago__prestamo__cliente', 'fondo').order_by('-pago__fecha_pago')[:100]:
            pagos_lista.append({
                'pago_id': d.pago.id,
                'codigo_comprobante': d.pago.codigo_comprobante,
                'fecha_pago': str(d.pago.fecha_pago),
                'cliente': str(d.pago.prestamo.cliente),
                'prestamo_id': d.pago.prestamo_id,
                'fondo_id': d.fondo_id,
                'fondo_nombre': d.fondo.nombre,
                'porcentaje_pi': str(d.porcentaje_pi),
                'capital_reintegrado': str(d.capital_reintegrado),
                'ganancia_interes': str(d.ganancia),
                'metodo_pago': d.pago.get_metodo_pago_display(),
                'referencia_bancaria': d.pago.referencia_bancaria,
            })

        recaudado = totales_pagos['total_recaudado'] or Decimal('0.00')
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
            return Response(
                {'detail': EsAdministrador.message},
                status=status.HTTP_403_FORBIDDEN,
            )
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
        if search:
            from django.db.models import Q
            queryset = queryset.filter(
                Q(cliente__nombres__icontains=search) |
                Q(cliente__apellidos__icontains=search) |
                Q(cliente__cedula__icontains=search)
            )
        if estado:
            queryset = queryset.filter(estado=estado)
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
        pago, info = aplicar_pago(
            prestamo=prestamo,
            monto=data['monto'],
            fecha_pago=data['fecha_pago'],
            metodo_pago=data['metodo_pago'],
            referencia_bancaria=data.get('referencia_bancaria', ''),
            usuario=request.user,
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
            
        return queryset.order_by('-creado_en')


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
        serializer = ConfiguracionSistemaSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)