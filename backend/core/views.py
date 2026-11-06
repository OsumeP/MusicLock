from django.db import connection
from django.db.utils import DatabaseError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from vault.storage import get_blob_storage


def _check_database() -> str:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return "ok"
    except DatabaseError:
        return "error"


def _check_storage() -> str:
    try:
        return "ok" if get_blob_storage().ping() else "error"
    except Exception:  # configuración inválida, servidor caído, etc.
        return "error"


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    """Estado del servicio. Público: lo usan el frontend, Docker y la demo."""
    checks = {"database": _check_database(), "storage": _check_storage()}
    healthy = all(value == "ok" for value in checks.values())
    return Response(
        {"status": "ok" if healthy else "degraded", "service": "musiclock-api", **checks},
        status=200 if healthy else 503,
    )
