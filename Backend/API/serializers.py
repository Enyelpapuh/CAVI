from rest_framework import serializers
from django.db.models import Sum
from .models import (
    Usuario, Cliente, RolUsuario, Fondo, MovimientoFondo, Prestamo,
    PrestamoFondoDetalle, Pago, PagoFondoDetalle, GananciaAdministracion,
)
from .services.pagos import totales_insolutos, interes_minimo_vencido
from .services.amortizacion import validar_tasa
from .services.estados import DIAS_GRACIA, dias_atraso, estado_efectivo
from django.utils import timezone
from decimal import Decimal


class UsuarioSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, style={'input_type': 'password'})

    class Meta:
        model = Usuario
        fields = ['id', 'nombre_completo', 'correo', 'password', 'rol', 'activo', 'creado_en', 'actualizado_en', 'ultimo_login']
        read_only_fields = ['id', 'creado_en', 'actualizado_en', 'ultimo_login']

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = Usuario.objects.create_user(**validated_data)
        if password:
            user.set_password(password)
            user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class UsuarioLoginSerializer(serializers.Serializer):
    correo = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = ['id', 'cedula', 'nombres', 'apellidos', 'telefono', 'direccion', 'actividad_economica', 'activo', 'creado_en', 'actualizado_en']
        read_only_fields = ['id', 'creado_en', 'actualizado_en']

    def validate_cedula(self, value):
        queryset = Cliente.objects.filter(cedula=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Ya existe un cliente con esta cédula.")
        return value


class MovimientoFondoSerializer(serializers.ModelSerializer):
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)

    class Meta:
        model = MovimientoFondo
        fields = ['id', 'fondo', 'tipo', 'tipo_display', 'monto', 'saldo_anterior', 'saldo_posterior', 'descripcion', 'creado_en']
        read_only_fields = ['id', 'creado_en']


class FondoSerializer(serializers.ModelSerializer):
    movimientos = MovimientoFondoSerializer(many=True, read_only=True)
    capital_colocado = serializers.SerializerMethodField()
    rentabilidad = serializers.SerializerMethodField()

    class Meta:
        model = Fondo
        fields = ['id', 'nombre', 'familiar', 'saldo_disponible', 'capital_inicial', 'ganancias_acumuladas', 'activo', 'creado_en', 'actualizado_en', 'movimientos', 'capital_colocado', 'rentabilidad']
        read_only_fields = ['id', 'creado_en', 'actualizado_en', 'ganancias_acumuladas']

    def get_capital_colocado(self, obj):
        from django.db.models import Sum
        desembolsos = obj.movimientos.filter(tipo=MovimientoFondo.TipoMovimiento.DESEMBOLSO).aggregate(total=Sum('monto'))['total']
        return desembolsos or Decimal('0.00')

    def get_rentabilidad(self, obj):
        if obj.capital_inicial > 0:
            return round((obj.ganancias_acumuladas / obj.capital_inicial) * 100, 2)
        return Decimal('0.00')


class FondoCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fondo
        fields = ['id', 'nombre', 'familiar', 'capital_inicial', 'activo']
        read_only_fields = ['id']

    def create(self, validated_data):
        validated_data['saldo_disponible'] = validated_data['capital_inicial']
        validated_data['ganancias_acumuladas'] = Decimal('0.00')
        fondo = Fondo.objects.create(**validated_data)
        MovimientoFondo.objects.create(
            fondo=fondo,
            tipo=MovimientoFondo.TipoMovimiento.INYECCION,
            monto=fondo.capital_inicial,
            saldo_anterior=Decimal('0.00'),
            saldo_posterior=fondo.capital_inicial,
            descripcion='Capital inicial del fondo'
        )
        return fondo


class InyeccionFondoSerializer(serializers.Serializer):
    monto = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    descripcion = serializers.CharField(required=False, allow_blank=True)

    def validate_monto(self, value):
        if value <= 0:
            raise serializers.ValidationError("El monto debe ser mayor a cero.")
        return value


class RetiroFondoSerializer(serializers.Serializer):
    monto = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    descripcion = serializers.CharField(required=False, allow_blank=True)

    def validate_monto(self, value):
        if value <= 0:
            raise serializers.ValidationError("El monto debe ser mayor a cero.")
        return value


class PrestamoFondoDetalleSerializer(serializers.ModelSerializer):
    fondo_nombre = serializers.CharField(source='fondo.nombre', read_only=True)
    fondo_familiar = serializers.CharField(source='fondo.familiar', read_only=True)
    fondo_saldo_disponible = serializers.DecimalField(source='fondo.saldo_disponible', max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = PrestamoFondoDetalle
        fields = ['id', 'fondo', 'fondo_nombre', 'fondo_familiar', 'fondo_saldo_disponible', 'monto_aportado', 'porcentaje_pi']
        read_only_fields = ['id']


class PagoPreviewSerializer(serializers.Serializer):
    """Entrada del preview de abono: solo monto y fecha, no asienta nada."""

    monto = serializers.DecimalField(max_digits=14, decimal_places=2)
    fecha_pago = serializers.DateField(required=False, default=timezone.localdate)

    def validate_monto(self, value):
        if value <= 0:
            raise serializers.ValidationError("El monto debe ser mayor a cero.")
        return value.quantize(Decimal('0.01'))


class PrestamoSimulacionSerializer(serializers.Serializer):
    """Proyección de cuotas con datos no persistidos (cuota estimada en vivo)."""

    monto_principal = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    tasa_interes = serializers.DecimalField(max_digits=5, decimal_places=4)
    plazo_meses = serializers.IntegerField(min_value=1, max_value=120)
    periodicidad = serializers.ChoiceField(choices=Prestamo.Periodicidad.choices)
    fecha_primer_corte = serializers.DateField(required=False, default=timezone.localdate)
    cliente = serializers.PrimaryKeyRelatedField(
        queryset=Cliente.objects.all(), required=False, allow_null=True
    )

    def validate_tasa_interes(self, value):
        return validar_tasa(value)

    def validate(self, attrs):
        if attrs['plazo_meses'] * (1 if attrs['periodicidad'] == 'MENSUAL' else 2) > 360:
            raise serializers.ValidationError({
                'plazo_meses': 'El plazo supera el máximo de 360 cortes permitidos.'
            })
        return attrs


class PrestamoSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source='cliente.__str__', read_only=True)
    fondos_detalle = PrestamoFondoDetalleSerializer(many=True, read_only=True)
    total_aportado = serializers.SerializerMethodField()
    suma_pi = serializers.SerializerMethodField()
    saldo_insoluto = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    saldo_deudor = serializers.SerializerMethodField()
    interes_minimo_ciclo = serializers.SerializerMethodField()
    proxima_cuota = serializers.SerializerMethodField()
    dias_atraso = serializers.SerializerMethodField()
    dias_gracia = serializers.SerializerMethodField()
    estado_efectivo = serializers.SerializerMethodField()

    class Meta:
        model = Prestamo
        fields = ['id', 'cliente', 'cliente_nombre', 'monto_principal', 'saldo_insoluto', 'saldo_deudor',
                  'interes_minimo_ciclo', 'proxima_cuota', 'dias_atraso', 'dias_gracia', 'estado_efectivo',
                  'tasa_interes', 'plazo_meses', 'periodicidad',
                  'fecha_desembolso', 'fecha_primer_corte', 'estado', 'creado_en', 'actualizado_en',
                  'fondos_detalle', 'total_aportado', 'suma_pi']
        read_only_fields = ['id', 'creado_en', 'actualizado_en', 'estado', 'saldo_insoluto']

    def get_total_aportado(self, obj):
        total = obj.fondos_detalle.aggregate(total=Sum('monto_aportado'))['total']
        return total or Decimal('0.00')

    def get_suma_pi(self, obj):
        total = obj.fondos_detalle.aggregate(total=Sum('porcentaje_pi'))['total']
        return total or Decimal('0.0000')

    def get_saldo_deudor(self, obj):
        _cap, _int, _mora, deuda_total, _proy = totales_insolutos(obj, timezone.localdate())
        return deuda_total

    def get_interes_minimo_ciclo(self, obj):
        return interes_minimo_vencido(obj, timezone.localdate())

    def get_proxima_cuota(self, obj):
        _cap, _int, _mora, _deuda, proy = totales_insolutos(obj, timezone.localdate())
        hoy = timezone.localdate()
        for fila in proy['periodos']:
            if fila['fecha_vencimiento'] >= hoy:
                return {
                    'fecha_vencimiento': fila['fecha_vencimiento'],
                    'cuota': fila['cuota'],
                    'interes': fila['interes'],
                    'capital': fila['capital'],
                    'periodo': fila['periodo'],
                }
        return None

    def get_dias_atraso(self, obj):
        return dias_atraso(obj)

    def get_dias_gracia(self, obj):
        return DIAS_GRACIA

    def get_estado_efectivo(self, obj):
        return estado_efectivo(obj)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if request:
            es_cobranza = (
                getattr(request.user, 'rol', None) == RolUsuario.COBRANZA
                if hasattr(request.user, 'rol') else False
            )
            if es_cobranza:
                # Privacidad Ley 787: cobranza no ve origen de fondos ni utilidades.
                data.pop('fondos_detalle', None)
                data.pop('total_aportado', None)
                data.pop('suma_pi', None)
        return data


class PrestamoCreateSerializer(serializers.ModelSerializer):
    fondos_detalle = PrestamoFondoDetalleSerializer(many=True, write_only=True)

    class Meta:
        model = Prestamo
        fields = ['id', 'cliente', 'monto_principal', 'tasa_interes', 'plazo_meses', 'periodicidad',
                  'fecha_desembolso', 'fecha_primer_corte', 'fondos_detalle']
        read_only_fields = ['id']

    def validate(self, attrs):
        validar_tasa(attrs['tasa_interes'])
        fondos_detalle = attrs.get('fondos_detalle', [])
        if not fondos_detalle:
            raise serializers.ValidationError({"fondos_detalle": "Debe especificar al menos un fondo aportante."})

        total_aportado = sum(Decimal(str(fd['monto_aportado'])) for fd in fondos_detalle)
        monto_principal = attrs['monto_principal']

        if total_aportado != monto_principal:
            raise serializers.ValidationError({
                "fondos_detalle": f"La suma de aportes ({total_aportado}) debe igualar el monto principal ({monto_principal})."
            })

        suma_pi = sum(Decimal(str(fd['porcentaje_pi'])) for fd in fondos_detalle)
        if abs(suma_pi - Decimal('1.0000')) > Decimal('0.0001'):
            raise serializers.ValidationError({
                "fondos_detalle": f"La suma de porcentajes Pi ({suma_pi}) debe ser 1.0000 (100%)."
            })

        for fd in fondos_detalle:
            fondo = fd['fondo']
            monto = Decimal(str(fd['monto_aportado']))
            if fondo.saldo_disponible < monto:
                raise serializers.ValidationError({
                    "fondos_detalle": f"El fondo '{fondo.nombre}' no tiene saldo suficiente. Disponible: {fondo.saldo_disponible}, Requerido: {monto}"
                })

        return attrs


class PagoImputacionSerializer(serializers.Serializer):
    monto = serializers.DecimalField(max_digits=14, decimal_places=2)
    fecha_pago = serializers.DateField()
    metodo_pago = serializers.ChoiceField(choices=Pago.MetodoPago.choices)
    referencia_bancaria = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_monto(self, value):
        if value <= 0:
            raise serializers.ValidationError("El monto debe ser mayor a cero.")
        return value.quantize(Decimal('0.01'))


class PagoSerializer(serializers.ModelSerializer):
    prestamo_cliente = serializers.CharField(source='prestamo.cliente.__str__', read_only=True)
    prestamo_monto = serializers.DecimalField(source='prestamo.monto_principal', max_digits=14, decimal_places=2, read_only=True)
    metodo_pago_display = serializers.CharField(source='get_metodo_pago_display', read_only=True)
    usuario_nombre = serializers.CharField(source='usuario.nombre_completo', read_only=True)
    saldo_insoluto_tras_pago = serializers.SerializerMethodField()

    class Meta:
        model = Pago
        fields = ['id', 'codigo_comprobante', 'prestamo', 'prestamo_cliente', 'prestamo_monto',
                  'monto_total', 'fecha_pago', 'metodo_pago', 'metodo_pago_display', 'referencia_bancaria',
                  'aplicacion_mora', 'aplicacion_interes', 'aplicacion_capital',
                  'interes_administracion', 'interes_fondos',
                  'saldo_insoluto_tras_pago', 'usuario_nombre', 'creado_en']
        read_only_fields = fields

    def get_saldo_insoluto_tras_pago(self, obj):
        return obj.prestamo.saldo_insoluto


class PagoFondoDetalleSerializer(serializers.ModelSerializer):
    fondo_nombre = serializers.CharField(source='fondo.nombre', read_only=True)
    fondo_familiar = serializers.CharField(source='fondo.familiar', read_only=True)

    class Meta:
        model = PagoFondoDetalle
        fields = ['id', 'fondo', 'fondo_nombre', 'fondo_familiar', 'porcentaje_pi',
                  'capital_reintegrado', 'ganancia']
        read_only_fields = fields


class PagoReciboSerializer(PagoSerializer):
    fondos_detalle = PagoFondoDetalleSerializer(many=True, read_only=True)
    ganancia_administracion = serializers.SerializerMethodField()
    saldo_deudor_tras_pago = serializers.SerializerMethodField()

    class Meta(PagoSerializer.Meta):
        fields = PagoSerializer.Meta.fields + [
            'fondos_detalle', 'ganancia_administracion', 'saldo_deudor_tras_pago']

    def get_ganancia_administracion(self, obj):
        ga = getattr(obj, 'ganancia_administracion', None)
        return str(ga.monto) if ga else Decimal('0.00')

    def get_saldo_deudor_tras_pago(self, obj):
        prestamo = obj.prestamo
        _cap, _int, _mora, deuda, _proy = totales_insolutos(prestamo, obj.fecha_pago)
        return deuda

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if request and getattr(request.user, 'rol', None) == RolUsuario.COBRANZA:
            data.pop('fondos_detalle', None)
            data.pop('ganancia_administracion', None)
            data.pop('interes_administracion', None)
            data.pop('interes_fondos', None)
        return data