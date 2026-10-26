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


# ==============================================================================
# CATÁLOGOS MAESTROS NORMALIZADOS (NICARAGUA Y OPERACIÓN CAVI)
# ==============================================================================

class CatDepartamento(models.Model):
    id = models.SmallIntegerField(primary_key=True)
    codigo = models.CharField(_('código ISO/INEC'), max_length=10, unique=True)
    nombre = models.CharField(_('nombre departamento'), max_length=60)

    class Meta:
        verbose_name = _('departamento')
        verbose_name_plural = _('departamentos')
        db_table = 'cat_departamentos'
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class CatMunicipio(models.Model):
    id = models.SmallIntegerField(primary_key=True)
    departamento = models.ForeignKey(
        CatDepartamento,
        on_delete=models.PROTECT,
        related_name='municipios',
        verbose_name=_('departamento')
    )
    codigo = models.CharField(_('código municipio'), max_length=10)
    nombre = models.CharField(_('nombre municipio'), max_length=80)

    class Meta:
        verbose_name = _('municipio')
        verbose_name_plural = _('municipios')
        db_table = 'cat_municipios'
        ordering = ['departamento__nombre', 'nombre']

    def __str__(self):
        return f"{self.nombre} ({self.departamento.nombre})"


class CatActividadEconomica(models.Model):
    id = models.SmallIntegerField(primary_key=True)
    codigo = models.CharField(_('código'), max_length=30, unique=True)
    nombre = models.CharField(_('nombre actividad'), max_length=100)
    sector = models.CharField(_('sector económico'), max_length=60, default='Comercio Informal')

    class Meta:
        verbose_name = _('actividad económica')
        verbose_name_plural = _('actividades económicas')
        db_table = 'cat_actividades_economicas'
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class CatBanco(models.Model):
    id = models.SmallIntegerField(primary_key=True)
    codigo = models.CharField(_('código'), max_length=30, unique=True)
    nombre = models.CharField(_('nombre de la entidad'), max_length=100)
    requiere_titular = models.BooleanField(_('requiere titular de cuenta'), default=True)
    activo = models.BooleanField(_('activo para cobros'), default=True)

    class Meta:
        verbose_name = _('banco o billetera')
        verbose_name_plural = _('bancos y billeteras')
        db_table = 'cat_bancos'
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class CatEstadoPrestamo(models.Model):
    id = models.SmallIntegerField(primary_key=True)
    codigo = models.CharField(_('código'), max_length=30, unique=True)
    nombre = models.CharField(_('nombre'), max_length=60)
    es_activo = models.BooleanField(_('es activo en cartera'), default=True)
    es_mora = models.BooleanField(_('representa mora legal'), default=False)
    orden_flujo = models.SmallIntegerField(_('orden en el ciclo'), default=1)
    descripcion = models.CharField(_('descripción'), max_length=255, blank=True)

    class Meta:
        verbose_name = _('estado de préstamo')
        verbose_name_plural = _('estados de préstamos')
        db_table = 'cat_estados_prestamo'
        ordering = ['orden_flujo']

    def __str__(self):
        return self.nombre


class CatEstadoCuota(models.Model):
    id = models.SmallIntegerField(primary_key=True)
    codigo = models.CharField(_('código'), max_length=30, unique=True)
    nombre = models.CharField(_('nombre'), max_length=60)
    requiere_cobro = models.BooleanField(_('requiere cobro activo'), default=True)
    descripcion = models.CharField(_('descripción'), max_length=255, blank=True)

    class Meta:
        verbose_name = _('estado de cuota')
        verbose_name_plural = _('estados de cuotas')
        db_table = 'cat_estados_cuota'

    def __str__(self):
        return self.nombre


class CatEstadoCliente(models.Model):
    id = models.SmallIntegerField(primary_key=True)
    codigo = models.CharField(_('código'), max_length=30, unique=True)
    nombre = models.CharField(_('nombre'), max_length=60)
    permite_credito = models.BooleanField(_('permite originar crédito'), default=True)
    descripcion = models.CharField(_('descripción'), max_length=255, blank=True)

    class Meta:
        verbose_name = _('estado de cliente')
        verbose_name_plural = _('estados de clientes')
        db_table = 'cat_estados_cliente'

    def __str__(self):
        return self.nombre


class CatEstadoCaja(models.Model):
    id = models.SmallIntegerField(primary_key=True)
    codigo = models.CharField(_('código'), max_length=30, unique=True)
    nombre = models.CharField(_('nombre'), max_length=60)
    permite_movimientos = models.BooleanField(_('permite asentar cobros'), default=True)

    class Meta:
        verbose_name = _('estado de caja')
        verbose_name_plural = _('estados de cajas')
        db_table = 'cat_estados_caja'

    def __str__(self):
        return self.nombre


class Cliente(models.Model):
    id = models.BigAutoField(primary_key=True)
    cedula = models.CharField(_('cédula'), max_length=20, unique=True)
    nombres = models.CharField(_('nombres'), max_length=100)
    apellidos = models.CharField(_('apellidos'), max_length=100)
    telefono = models.CharField(_('teléfono'), max_length=20)
    direccion = models.TextField(_('dirección'))
    actividad_economica = models.CharField(_('actividad económica'), max_length=120, blank=True, null=True)
    departamento = models.ForeignKey(
        CatDepartamento,
        on_delete=models.PROTECT,
        related_name='clientes',
        verbose_name=_('departamento'),
        null=True,
        blank=True
    )
    municipio = models.ForeignKey(
        CatMunicipio,
        on_delete=models.PROTECT,
        related_name='clientes',
        verbose_name=_('municipio'),
        null=True,
        blank=True
    )
    actividad_catalogo = models.ForeignKey(
        CatActividadEconomica,
        on_delete=models.PROTECT,
        related_name='clientes',
        verbose_name=_('actividad económica catálogo'),
        null=True,
        blank=True
    )
    estado_cliente = models.ForeignKey(
        CatEstadoCliente,
        on_delete=models.PROTECT,
        related_name='clientes',
        verbose_name=_('estado del cliente'),
        null=True,
        blank=True
    )
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
    class TipoPersona(models.TextChoices):
        NATURAL = 'NATURAL', _('Persona Natural')
        JURIDICA = 'JURIDICA', _('Persona Jurídica')

    id = models.BigAutoField(primary_key=True)
    nombre = models.CharField(_('nombre'), max_length=100)
    familiar = models.CharField(_('familiar o titular'), max_length=100, blank=True)

    # Clasificación y cumplimiento legal
    tipo_persona = models.CharField(
        _('tipo de persona'),
        max_length=20,
        choices=TipoPersona.choices,
        default=TipoPersona.NATURAL
    )
    # Persona Natural
    identificacion = models.CharField(_('cédula de identidad'), max_length=30, blank=True, null=True)
    nombres_titular = models.CharField(_('nombres del titular'), max_length=100, blank=True, null=True)
    apellidos_titular = models.CharField(_('apellidos del titular'), max_length=100, blank=True, null=True)

    # Persona Jurídica
    razon_social = models.CharField(_('razón social'), max_length=150, blank=True, null=True)
    ruc = models.CharField(_('número RUC'), max_length=30, blank=True, null=True)
    representante_legal = models.CharField(_('representante legal'), max_length=120, blank=True, null=True)
    cedula_representante = models.CharField(_('cédula del representante legal'), max_length=30, blank=True, null=True)

    # Datos de contacto y domicilio legal
    telefono_contacto = models.CharField(_('teléfono de contacto'), max_length=30, blank=True, null=True)
    direccion_legal = models.TextField(_('dirección o domicilio fiscal'), blank=True, null=True)
    parentesco_relacion = models.CharField(_('parentesco o relación'), max_length=100, blank=True, null=True)

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
        REVERSO_PAGO = 'REVERSO_PAGO', _('Reverso de Pago')

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
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='movimientos_fondo',
        verbose_name=_('usuario que opera'),
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
    tasa_mora = models.DecimalField(
        _('tasa mora mensual'),
        max_digits=5,
        decimal_places=4,
        null=True,
        blank=True,
        help_text=_(
            'Tasa mensual de recargo por mora. Si se deja vacía aplica la mitad de la '
            'tasa de interés pactada (Art. 3180 Código Civil).'
        )
    )
    dias_mora = models.PositiveIntegerField(
        _('días de mora facturados'),
        default=0,
        help_text=_('Días ya vencidos fuera de gracia que generaron mora')
    )
    mora_acumulada = models.DecimalField(
        _('mora acumulada'),
        max_digits=14,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text=_('Mora generada desde el desembolso; los pagos la van cubriendo')
    )
    fecha_ultimo_calculo_mora = models.DateField(
        _('fecha último cálculo mora'), null=True, blank=True
    )
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
    estado_catalogo = models.ForeignKey(
        CatEstadoPrestamo,
        on_delete=models.PROTECT,
        related_name='prestamos',
        verbose_name=_('estado catálogo'),
        null=True,
        blank=True
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


class SesionCaja(models.Model):
    """Control formal de apertura, cobro en ruta/ventanilla y arqueo físico diario."""
    id = models.BigAutoField(primary_key=True)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='sesiones_caja',
        verbose_name=_('oficial responsable')
    )
    fecha_apertura = models.DateTimeField(_('fecha apertura'), default=timezone.now)
    fecha_cierre = models.DateTimeField(_('fecha cierre'), null=True, blank=True)
    saldo_inicial_efectivo = models.DecimalField(
        _('fondo de cambio inicial'),
        max_digits=14,
        decimal_places=2,
        default=Decimal('0.00')
    )
    total_cobrado_efectivo = models.DecimalField(
        _('total cobrado en efectivo'),
        max_digits=14,
        decimal_places=2,
        default=Decimal('0.00')
    )
    total_cobrado_banco = models.DecimalField(
        _('total cobrado en banco / transferencias'),
        max_digits=14,
        decimal_places=2,
        default=Decimal('0.00')
    )
    efectivo_declarado = models.DecimalField(
        _('efectivo físico contado en arqueo'),
        max_digits=14,
        decimal_places=2,
        default=Decimal('0.00')
    )
    diferencia = models.DecimalField(
        _('diferencia sobrante (+) o faltante (-)'),
        max_digits=14,
        decimal_places=2,
        default=Decimal('0.00')
    )
    estado = models.CharField(
        _('estado de sesión'),
        max_length=30,
        default='ABIERTA',
        help_text=_('ABIERTA, EN_ARQUEO, CERRADA_CONCILIADA, CON_SOBRANTE, CON_FALTANTE')
    )
    supervisor_cierre = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='arqueos_supervisados',
        verbose_name=_('supervisor que valida el cierre')
    )
    observaciones = models.TextField(_('observaciones de arqueo'), blank=True)

    class Meta:
        verbose_name = _('sesión de caja')
        verbose_name_plural = _('sesiones de caja')
        db_table = 'sesiones_caja'
        ordering = ['-fecha_apertura']

    def __str__(self):
        return f"Caja #{self.id} - {self.usuario.nombre_completo} ({self.estado})"


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
    banco = models.ForeignKey(
        CatBanco,
        on_delete=models.PROTECT,
        related_name='pagos',
        verbose_name=_('banco emisor'),
        null=True,
        blank=True
    )
    referencia_bancaria = models.CharField(_('referencia bancaria'), max_length=100, blank=True, default='')
    sesion_caja = models.ForeignKey(
        SesionCaja,
        on_delete=models.SET_NULL,
        related_name='pagos',
        verbose_name=_('sesión de caja'),
        null=True,
        blank=True
    )
    efectivo_recibido = models.DecimalField(
        _('efectivo recibido'),
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        default=Decimal('0.00')
    )
    cambio_devuelto = models.DecimalField(
        _('cambio devuelto'),
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        default=Decimal('0.00')
    )
    codigo_comprobante = models.CharField(
        _('código comprobante'),
        max_length=30,
        unique=True,
        editable=False,
        null=True
    )
    codigo_seguridad = models.CharField(
        _('código de seguridad'),
        max_length=16,
        blank=True,
        default='',
        help_text=_('Hash SHA-256 de verificación de autenticidad')
    )
    estado = models.CharField(
        _('estado del recibo'),
        max_length=20,
        default='VALIDO',
        choices=[('VALIDO', 'Válido'), ('ANULADO', 'Anulado')],
        db_index=True
    )
    motivo_anulacion = models.TextField(_('motivo de anulación'), blank=True, default='')
    anulado_en = models.DateTimeField(_('anulado en'), null=True, blank=True)
    anulado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pagos_anulados',
        verbose_name=_('anulado por')
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


class ConfiguracionSistema(models.Model):
    """Parámetros de políticas del sistema y modo de digitalización de cartera."""

    id = models.BigAutoField(primary_key=True)
    modo_estricto = models.BooleanField(
        _('modo estricto'),
        default=False,
        help_text=_('Si es False, opera en modo de digitalización flexible permitiendo excepciones históricas.')
    )
    permitir_superar_usura = models.BooleanField(
        _('permitir superar usura'),
        default=False,
        help_text=_('Permite asentar créditos históricos con tasas mayores al límite del BCN (ej: 10% mensual).')
    )
    tasa_maxima_legal = models.DecimalField(
        _('tasa máxima legal referencial'),
        max_digits=5,
        decimal_places=4,
        default=Decimal('0.0300'),
        help_text=_('Tope referencial del BCN (0.0300 = 3.00% mensual).')
    )
    dias_gracia = models.PositiveIntegerField(
        _('días de gracia'),
        default=4,
        help_text=_('Días de tolerancia tras el corte antes de aplicar mora.')
    )
    permitir_plazo_indefinido = models.BooleanField(
        _('permitir plazo indefinido'),
        default=True,
        help_text=_('Permite créditos abiertos donde la cuota mensual es solo el interés sobre el saldo restante.')
    )
    tasa_mora_diaria = models.DecimalField(
        _('tasa mora diaria'),
        max_digits=5,
        decimal_places=4,
        default=Decimal('0.0050'),
        help_text=_('Tasa diaria de recargo por mora (0.0050 = 0.50% diario).')
    )
    horas_tolerancia_anulacion = models.PositiveIntegerField(
        _('horas tolerancia anulación'),
        default=72,
        help_text=_('Límite de tiempo en horas para anular un recibo de pago.')
    )
    actualizado_en = models.DateTimeField(_('actualizado en'), auto_now=True)

    class Meta:
        verbose_name = _('configuración del sistema')
        verbose_name_plural = _('configuración del sistema')
        db_table = 'configuracion_sistema'

    def __str__(self):
        return f"Configuración CAVI ({'Estricto' if self.modo_estricto else 'Flexible'})"

    @classmethod
    def get_solo(cls):
        """Patrón singleton para obtener o inicializar la configuración global."""
        obj, _ = cls.objects.get_or_create(id=1)
        return obj


class CuotaPrestamo(models.Model):
    """Cronograma de amortización físico persistente para trazabilidad contable."""
    id = models.BigAutoField(primary_key=True)
    prestamo = models.ForeignKey(
        Prestamo,
        on_delete=models.CASCADE,
        related_name='cuotas',
        verbose_name=_('préstamo')
    )
    numero_cuota = models.PositiveIntegerField(_('número de cuota'))
    fecha_vencimiento = models.DateField(_('fecha de vencimiento'))
    capital_programado = models.DecimalField(_('capital programado'), max_digits=14, decimal_places=2)
    interes_programado = models.DecimalField(_('interés programado'), max_digits=14, decimal_places=2)
    cuota_total = models.DecimalField(_('cuota total programada'), max_digits=14, decimal_places=2)
    saldo_restante = models.DecimalField(_('saldo restante esperado'), max_digits=14, decimal_places=2)
    capital_pagado = models.DecimalField(_('capital pagado'), max_digits=14, decimal_places=2, default=Decimal('0.00'))
    interes_pagado = models.DecimalField(_('interés pagado'), max_digits=14, decimal_places=2, default=Decimal('0.00'))
    mora_pagada = models.DecimalField(_('mora pagada'), max_digits=14, decimal_places=2, default=Decimal('0.00'))
    estado = models.CharField(
        _('estado de cuota'),
        max_length=30,
        default='PROGRAMADA',
        help_text=_('PROGRAMADA, AL_DIA, EN_GRACIA, VENCIDA, PAGADA_TOTAL, PAGADA_PARCIAL, CONDONADA')
    )
    estado_cuota = models.ForeignKey(
        CatEstadoCuota,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='cuotas',
        verbose_name=_('catálogo estado de cuota')
    )
    fecha_ultimo_pago = models.DateField(_('fecha último pago'), null=True, blank=True)
    creado_en = models.DateTimeField(_('creado en'), default=timezone.now)
    actualizado_en = models.DateTimeField(_('actualizado en'), auto_now=True)

    class Meta:
        verbose_name = _('cuota de préstamo')
        verbose_name_plural = _('cuotas de préstamo')
        db_table = 'cuotas_prestamo'
        ordering = ['prestamo', 'numero_cuota']
        constraints = [
            models.UniqueConstraint(fields=['prestamo', 'numero_cuota'], name='uq_prestamo_cuota')
        ]

    def __str__(self):
        return f"Cuota #{self.numero_cuota} (Préstamo #{self.prestamo_id}) - {self.estado}"


class CatTipoActividad(models.Model):
    id = models.SmallIntegerField(primary_key=True)
    codigo = models.CharField(_('código'), max_length=40, unique=True)
    modulo = models.CharField(_('módulo'), max_length=50)
    nombre = models.CharField(_('nombre'), max_length=100)
    nivel_severidad = models.CharField(_('nivel de severidad'), max_length=20, default='Informativo')

    class Meta:
        verbose_name = _('tipo de actividad')
        verbose_name_plural = _('tipos de actividad')
        db_table = 'cat_tipos_actividad'
        ordering = ['modulo', 'codigo']

    def __str__(self):
        return f"{self.codigo} - {self.nombre}"


class BitacoraActividad(models.Model):
    id = models.BigAutoField(primary_key=True)
    tipo_actividad = models.ForeignKey(
        CatTipoActividad,
        on_delete=models.PROTECT,
        related_name='bitacoras',
        verbose_name=_('tipo de actividad'),
        null=True,
        blank=True
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='bitacoras',
        verbose_name=_('usuario responsable'),
        null=True,
        blank=True
    )
    cliente = models.ForeignKey(
        Cliente,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bitacoras'
    )
    prestamo = models.ForeignKey(
        Prestamo,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bitacoras'
    )
    pago = models.ForeignKey(
        Pago,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bitacoras'
    )
    fondo = models.ForeignKey(
        Fondo,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bitacoras'
    )
    modulo = models.CharField(_('módulo'), max_length=50, blank=True, default='', db_index=True)
    codigo_evento = models.CharField(_('código de evento'), max_length=50, blank=True, default='', db_index=True)
    nivel_severidad = models.CharField(
        _('nivel de severidad'),
        max_length=20,
        default='INFORMATIVO',
        choices=[
            ('INFORMATIVO', 'Informativo'),
            ('ADVERTENCIA', 'Advertencia'),
            ('CRITICO', 'Crítico'),
        ],
        db_index=True
    )
    direccion_ip = models.GenericIPAddressField(_('dirección IP'), null=True, blank=True)
    agente_usuario = models.CharField(_('user agent'), max_length=255, blank=True)
    datos_anteriores = models.JSONField(_('datos anteriores'), null=True, blank=True)
    datos_nuevos = models.JSONField(_('datos nuevos'), null=True, blank=True)
    diferencial_cambios = models.JSONField(_('diferencial de cambios'), null=True, blank=True)
    observaciones = models.TextField(_('observaciones'), blank=True)
    creado_en = models.DateTimeField(_('creado en'), default=timezone.now)

    class Meta:
        verbose_name = _('bitácora de actividad')
        verbose_name_plural = _('bitácoras de actividades')
        db_table = 'bitacora_actividades'
        ordering = ['-creado_en']

    def __str__(self):
        return f"[{self.creado_en:%Y-%m-%d %H:%M}] {self.usuario} - {self.observaciones or (self.tipo_actividad.nombre if self.tipo_actividad else 'Actividad')}"


class CatPermiso(models.Model):
    id = models.SmallIntegerField(primary_key=True)
    modulo = models.CharField(_('módulo del sistema'), max_length=50)
    codigo = models.CharField(_('código permiso'), max_length=60, unique=True)
    nombre = models.CharField(_('nombre'), max_length=100)
    descripcion = models.CharField(_('descripción'), max_length=255, blank=True)

    class Meta:
        verbose_name = _('catálogo de permiso')
        verbose_name_plural = _('catálogo de permisos')
        db_table = 'cat_permisos'
        ordering = ['modulo', 'codigo']

    def __str__(self):
        return f"{self.modulo} - {self.nombre} ({self.codigo})"


class RolPermiso(models.Model):
    id = models.BigAutoField(primary_key=True)
    rol = models.CharField(_('rol'), max_length=20, choices=RolUsuario.choices)
    permiso = models.ForeignKey(
        CatPermiso,
        on_delete=models.CASCADE,
        related_name='roles_permiso',
        verbose_name=_('permiso')
    )
    activo = models.BooleanField(_('habilitado'), default=True)

    class Meta:
        verbose_name = _('rol permiso')
        verbose_name_plural = _('roles permisos')
        db_table = 'roles_permisos'
        constraints = [
            models.UniqueConstraint(fields=['rol', 'permiso'], name='uq_rol_permiso')
        ]

    def __str__(self):
        return f"{self.rol} - {self.permiso.codigo} ({'Activo' if self.activo else 'Inactivo'})"