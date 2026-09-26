from rest_framework import permissions

from .models import RolUsuario


class EsAdministrador(permissions.BasePermission):
    """Solo el rol ADMINISTRADOR puede consultar el recurso."""

    message = 'Esta información está restringida a la administración de CAVI.'

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'rol', None) == RolUsuario.ADMINISTRADOR
        )
