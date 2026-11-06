from django.db import connection
from django.db.utils import DatabaseError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    """Estado del servicio. Público: lo usan el frontend, Docker y la demo."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        database = "ok"
    except DatabaseError:
        database = "error"

    healthy = database == "ok"
    return Response(
        {
            "status": "ok" if healthy else "degraded",
            "service": "musiclock-api",
            "database": database,
        },
        status=200 if healthy else 503,
    )
