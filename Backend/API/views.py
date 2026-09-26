from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Sum, F
from decimal import Decimal
from .models import Usuario, Cliente, Fondo, MovimientoFondo, Prestamo, PrestamoFondoDetalle
from .serializers import (
    UsuarioSerializer, UsuarioLoginSerializer, ClienteSerializer,
    FondoSerializer, FondoCreateSerializer, InyeccionFondoSerializer,
    RetiroFondoSerializer, MovimientoFondoSerializer,
    PrestamoSerializer, PrestamoCreateSerializer, PrestamoFondoDetalleSerializer,
    PagoImputacionSerializer, PagoSerializer
)
from .services.amortizacion import generar_proyeccion, validar_tasa
from .services.pagos import aplicar_pago

Usuario = get_user_model()


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