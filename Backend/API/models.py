from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


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