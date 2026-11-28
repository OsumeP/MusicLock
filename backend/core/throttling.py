"""
Límites de peticiones reutilizables.

`ScopedRateThrottle` (el limitador por defecto, ver `REST_FRAMEWORK` en settings)
limita TODOS los métodos de una vista que declara `throttle_scope`. Para acciones
sociales (comentar, seguir) solo interesa frenar las escrituras: leer no debe
gastar el cupo.
"""

from rest_framework.permissions import SAFE_METHODS


class WriteThrottleMixin:
    """
    Aplica el `throttle_scope` de la vista solo a POST/PUT/PATCH/DELETE. Con sesión,
    `ScopedRateThrottle` cuenta por usuario; sin ella, por IP.
    """

    def get_throttles(self):
        if self.request.method in SAFE_METHODS:
            return []
        return super().get_throttles()
