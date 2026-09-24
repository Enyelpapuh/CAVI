from rest_framework import serializers
from .models import Usuario, Cliente, RolUsuario, Fondo, MovimientoFondo, Prestamo, PrestamoFondoDetalle
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


class PrestamoSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source='cliente.__str__', read_only=True)
    fondos_detalle = PrestamoFondoDetalleSerializer(many=True, read_only=True)
    total_aportado = serializers.SerializerMethodField()
    suma_pi = serializers.SerializerMethodField()

    class Meta:
        model = Prestamo
        fields = ['id', 'cliente', 'cliente_nombre', 'monto_principal', 'tasa_interes', 'plazo_meses', 'periodicidad',
                  'fecha_desembolso', 'fecha_primer_corte', 'estado', 'creado_en', 'actualizado_en',
                  'fondos_detalle', 'total_aportado', 'suma_pi']
        read_only_fields = ['id', 'creado_en', 'actualizado_en', 'estado']

    def get_total_aportado(self, obj):
        from django.db.models import Sum
        total = obj.fondos_detalle.aggregate(total=Sum('monto_aportado'))['total']
        return total or Decimal('0.00')

    def get_suma_pi(self, obj):
        from django.db.models import Sum
        total = obj.fondos_detalle.aggregate(total=Sum('porcentaje_pi'))['total']
        return total or Decimal('0.0000')


class PrestamoCreateSerializer(serializers.ModelSerializer):
    fondos_detalle = PrestamoFondoDetalleSerializer(many=True, write_only=True)

    class Meta:
        model = Prestamo
        fields = ['id', 'cliente', 'monto_principal', 'tasa_interes', 'plazo_meses', 'periodicidad',
                  'fecha_desembolso', 'fecha_primer_corte', 'fondos_detalle']
        read_only_fields = ['id']

    def validate(self, attrs):
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