from django.db import models
from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from django.core.validators import MinValueValidator
from decimal import Decimal


class RolUsuario(models.TextChoices):
    ADMINISTRADOR = 'ADMINISTRADOR', _('Administrador')
    COBRANZA = 'COBRANZA', _('Cobranza')


class UsuarioManager(BaseUserManager):
    def create_user(self, correo, nombre_completo, password=None, **extra_fields):
        if not correo:
            raise ValueError(_('El correo es obligatorio'))
        if not nombre_completo:
            raise ValueError(_('El nombre completo es obligatorio'))
        email = self.normalize_email(correo)
        user = self.model(correo=email, nombre_completo=nombre_completo, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, correo, nombre_completo, password=None, **extra_fields):
        extra_fields.setdefault('rol', RolUsuario.ADMINISTRADOR)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('activo', True)
        return self.create_user(correo, nombre_completo, password, **extra_fields)


class Usuario(AbstractBaseUser, PermissionsMixin):
    id = models.BigAutoField(primary_key=True)
    nombre_completo = models.CharField(_('nombre completo'), max_length=120)
    correo = models.EmailField(_('correo'), max_length=120, unique=True)
    password_hash = models.CharField(_('password'), max_length=255)
    rol = models.CharField(_('rol'), max_length=20, choices=RolUsuario.choices, default=RolUsuario.COBRANZA)
    activo = models.BooleanField(_('activo'), default=True)
    creado_en = models.DateTimeField(_('creado en'), default=timezone.now)
    actualizado_en = models.DateTimeField(_('actualizado en'), auto_now=True)
    ultimo_login = models.DateTimeField(_('último acceso'), blank=True, null=True)

    is_staff = models.BooleanField(_('es staff'), default=False)

    objects = UsuarioManager()

    USERNAME_FIELD = 'correo'
    REQUIRED_FIELDS = ['nombre_completo']

    class Meta:
        verbose_name = _('usuario')
        verbose_name_plural = _('usuarios')
        db_table = 'usuarios'

    def __str__(self):
        return f"{self.nombre_completo} ({self.correo})"


class Cliente(models.Model):
    id = models.BigAutoField(primary_key=True)
    cedula = models.CharField(_('cédula'), max_length=20, unique=True)
    nombres = models.CharField(_('nombres'), max_length=100)
    apellidos = models.CharField(_('apellidos'), max_length=100)
    telefono = models.CharField(_('teléfono'), max_length=20)
    direccion = models.TextField(_('dirección'))
    actividad_economica = models.CharField(_('actividad económica'), max_length=120, blank=True, null=True)
    activo = models.BooleanField(_('activo'), default=True)
    creado_en = models.DateTimeField(_('creado en'), default=timezone.now)
    actualizado_en = models.DateTimeField(_('actualizado en'), auto_now=True)

    class Meta:
        verbose_name = _('cliente')
        verbose_name_plural = _('clientes')
        db_table = 'clientes'
        indexes = [
            models.Index(fields=['cedula'], name='idx_clientes_cedula'),
            models.Index(fields=['nombres', 'apellidos'], name='idx_clientes_nombre'),
        ]

    def __str__(self):
        return f"{self.nombres} {self.apellidos} - {self.cedula}"


class Fondo(models.Model):
    id = models.BigAutoField(primary_key=True)
    nombre = models.CharField(_('nombre'), max_length=100)
    familiar = models.CharField(_('familiar'), max_length=100)
    saldo_disponible = models.DecimalField(
        _('saldo disponible'),
        max_digits=14,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))]
    )
    capital_inicial = models.DecimalField(_('capital inicial'), max_digits=14, decimal_places=2)
    ganancias_acumuladas = models.DecimalField(
        _('ganancias acumuladas'),
        max_digits=14,
        decimal_places=2,
        default=Decimal('0.00')
    )
    activo = models.BooleanField(_('activo'), default=True)
    creado_en = models.DateTimeField(_('creado en'), default=timezone.now)
    actualizado_en = models.DateTimeField(_('actualizado en'), auto_now=True)

    class Meta:
        verbose_name = _('fondo')
        verbose_name_plural = _('fondos')
        db_table = 'fondos'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(saldo_disponible__gte=0),
                name='ck_fondo_saldo_no_negativo'
            )
        ]

    def __str__(self):
        return f"{self.nombre} - {self.familiar} (Saldo: {self.saldo_disponible})"


class MovimientoFondo(models.Model):
    class TipoMovimiento(models.TextChoices):
        INYECCION = 'INYECCION', _('Inyección')
        RETIRO = 'RETIRO', _('Retiro')
        DESEMBOLSO = 'DESEMBOLSO', _('Desembolso')
        GANANCIA = 'GANANCIA', _('Ganancia')
        REINTEGRO = 'REINTEGRO', _('Reintegro')

    id = models.BigAutoField(primary_key=True)
    fondo = models.ForeignKey(
        Fondo,
        on_delete=models.PROTECT,
        related_name='movimientos',
        verbose_name=_('fondo')
    )
    pago = models.ForeignKey(
        'Pago',
        on_delete=models.PROTECT,
        related_name='movimientos_fondo',
        verbose_name=_('pago que origina'),
        null=True,
        blank=True
    )
    tipo = models.CharField(_('tipo'), max_length=20, choices=TipoMovimiento.choices)
    monto = models.DecimalField(_('monto'), max_digits=14, decimal_places=2)
    saldo_anterior = models.DecimalField(_('saldo anterior'), max_digits=14, decimal_places=2)
    saldo_posterior = models.DecimalField(_('saldo posterior'), max_digits=14, decimal_places=2)
    descripcion = models.TextField(_('descripción'), blank=True)
    creado_en = models.DateTimeField(_('creado en'), default=timezone.now)

    class Meta:
        verbose_name = _('movimiento de fondo')
        verbose_name_plural = _('movimientos de fondo')
        db_table = 'movimientos_fondo'
        ordering = ['-creado_en']

    def __str__(self):
        return f"{self.fondo.nombre} - {self.get_tipo_display()} - {self.monto}"


class Prestamo(models.Model):
    class Estado(models.TextChoices):
        VIGENTE = 'VIGENTE', _('Vigente')
        EN_GRACIA = 'EN_GRACIA', _('En Gracia')
        EN_MORA = 'EN_MORA', _('En Mora')
        CANCELADO = 'CANCELADO', _('Cancelado')

    class Periodicidad(models.TextChoices):
        MENSUAL = 'MENSUAL', _('Mensual')
        QUINCENAL = 'QUINCENAL', _('Quincenal')

    id = models.BigAutoField(primary_key=True)
    cliente = models.ForeignKey(
        Cliente,
        on_delete=models.PROTECT,
        related_name='prestamos',
        verbose_name=_('cliente')
    )
    monto_principal = models.DecimalField(_('monto principal'), max_digits=14, decimal_places=2)
    saldo_insoluto = models.DecimalField(
        _('saldo insoluto'),
        max_digits=14,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text=_('Capital aún no amortizado (se actualiza con cada pago)')
    )
    tasa_interes = models.DecimalField(_('tasa interés'), max_digits=5, decimal_places=4)
    plazo_meses = models.PositiveIntegerField(_('plazo meses'))
    periodicidad = models.CharField(
        _('periodicidad'),
        max_length=20,
        choices=Periodicidad.choices,
        default=Periodicidad.MENSUAL
    )
    fecha_desembolso = models.DateField(_('fecha desembolso'))
    fecha_primer_corte = models.DateField(_('fecha primer corte'))
    estado = models.CharField(
        _('estado'),
        max_length=20,
        choices=Estado.choices,
        default=Estado.VIGENTE
    )
    creado_en = models.DateTimeField(_('creado en'), default=timezone.now)
    actualizado_en = models.DateTimeField(_('actualizado en'), auto_now=True)

    class Meta:
        verbose_name = _('préstamo')
        verbose_name_plural = _('préstamos')
        db_table = 'prestamos'

    def __str__(self):
        return f"Préstamo #{self.id} - {self.cliente} - {self.monto_principal}"


class PrestamoFondoDetalle(models.Model):
    id = models.BigAutoField(primary_key=True)
    prestamo = models.ForeignKey(
        Prestamo,
        on_delete=models.PROTECT,
        related_name='fondos_detalle',
        verbose_name=_('préstamo')
    )
    fondo = models.ForeignKey(
        Fondo,
        on_delete=models.PROTECT,
        related_name='prestamos_detalle',
        verbose_name=_('fondo')
    )
    monto_aportado = models.DecimalField(_('monto aportado'), max_digits=14, decimal_places=2)
    porcentaje_pi = models.DecimalField(_('porcentaje Pi'), max_digits=5, decimal_places=4)

    class Meta:
        verbose_name = _('detalle fondo préstamo')
        verbose_name_plural = _('detalles fondos préstamo')
        db_table = 'prestamo_fondos_detalle'
        constraints = [
            models.UniqueConstraint(
                fields=['prestamo', 'fondo'],
                name='uq_prestamo_fondo'
            )
        ]

    def __str__(self):
        return f"{self.prestamo} - {self.fondo} (Pi: {self.porcentaje_pi})"


class Pago(models.Model):
    class MetodoPago(models.TextChoices):
        EFECTIVO = 'EFECTIVO', _('Efectivo')
        TRANSFERENCIA = 'TRANSFERENCIA', _('Transferencia')
        CHEQUE = 'CHEQUE', _('Cheque')
        OTRO = 'OTRO', _('Otro')

    id = models.BigAutoField(primary_key=True)
    prestamo = models.ForeignKey(
        Prestamo,
        on_delete=models.PROTECT,
        related_name='pagos',
        verbose_name=_('préstamo')
    )
    monto_total = models.DecimalField(_('monto total aplicado'), max_digits=14, decimal_places=2)
    fecha_pago = models.DateField(_('fecha de pago'))
    metodo_pago = models.CharField(_('método de pago'), max_length=20, choices=MetodoPago.choices)
    referencia_bancaria = models.CharField(_('referencia bancaria'), max_length=100, blank=True, default='')
    codigo_comprobante = models.CharField(
        _('código comprobante'),
        max_length=30,
        unique=True,
        editable=False,
        null=True
    )
    aplicacion_mora = models.DecimalField(_('aplicación mora'), max_digits=14, decimal_places=2, default=Decimal('0.00'))
    aplicacion_interes = models.DecimalField(_('aplicación interés'), max_digits=14, decimal_places=2, default=Decimal('0.00'))
    aplicacion_capital = models.DecimalField(_('aplicación capital'), max_digits=14, decimal_places=2, default=Decimal('0.00'))
    interes_administracion = models.DecimalField(
        _('interés a administración'),
        max_digits=14,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text=_('50% del interés corriente que queda para CAVI')
    )
    interes_fondos = models.DecimalField(
        _('interés a fondos'),
        max_digits=14,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text=_('50% del interés corriente que se reparte entre los fondos según Pi')
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='pagos',
        verbose_name=_('usuario que asienta')
    )
    creado_en = models.DateTimeField(_('creado en'), default=timezone.now)

    class Meta:
        verbose_name = _('pago')
        verbose_name_plural = _('pagos')
        db_table = 'pagos'
        ordering = ['-creado_en']

    def __str__(self):
        return f"{self.codigo_comprobante or self.id} - {self.prestamo} - {self.monto_total}"


class PagoFondoDetalle(models.Model):
    """Rastro inmutable de la liquidación por fondo (trazabilidad UAF, Ley 977)."""

    id = models.BigAutoField(primary_key=True)
    pago = models.ForeignKey(
        Pago,
        on_delete=models.PROTECT,
        related_name='fondos_detalle',
        verbose_name=_('pago')
    )
    fondo = models.ForeignKey(
        Fondo,
        on_delete=models.PROTECT,
        related_name='pagos_detalle',
        verbose_name=_('fondo')
    )
    porcentaje_pi = models.DecimalField(_('porcentaje Pi'), max_digits=5, decimal_places=4)
    capital_reintegrado = models.DecimalField(_('capital reintegrado'), max_digits=14, decimal_places=2)
    ganancia = models.DecimalField(_('ganancia (50% fondos)'), max_digits=14, decimal_places=2)

    class Meta:
        verbose_name = _('detalle fondo pago')
        verbose_name_plural = _('detalles fondos pagos')
        db_table = 'pago_fondos_detalle'

    def __str__(self):
        return f"{self.pago.codigo_comprobante or self.pago_id} - {self.fondo.nombre}"


class GananciaAdministracion(models.Model):
    """Acumulador global del 50% de interés que queda para CAVI."""

    id = models.BigAutoField(primary_key=True)
    pago = models.OneToOneField(
        Pago,
        on_delete=models.PROTECT,
        related_name='ganancia_administracion',
        verbose_name=_('pago')
    )
    monto = models.DecimalField(_('monto 50% administración'), max_digits=14, decimal_places=2)
    fecha = models.DateField(_('fecha'), default=timezone.localdate)
    creado_en = models.DateTimeField(_('creado en'), default=timezone.now)

    class Meta:
        verbose_name = _('ganancia de administración')
        verbose_name_plural = _('ganancias de administración')
        db_table = 'ganancias_administracion'
        ordering = ['-creado_en']

    def __str__(self):
        return f"Admin {self.monto} - {self.pago.codigo_comprobante or self.pago_id}"