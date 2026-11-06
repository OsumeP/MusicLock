import logging

from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .serializers import SongSerializer, SongUploadSerializer

logger = logging.getLogger(__name__)

# Margen para los campos de texto del multipart además del archivo.
MULTIPART_OVERHEAD_BYTES = 64 * 1024


def rejected(error: services.UploadRejected) -> Response:
    http_status = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE if isinstance(error, services.FileTooLarge) else status.HTTP_400_BAD_REQUEST
    return Response({"detail": error.message, "code": error.code}, status=http_status)


class SongListCreateView(APIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        """POST /api/songs — sube una canción ya cifrada en el navegador."""
        # Rechazo temprano por Content-Length, antes de que Django lea todo el cuerpo.
        declared = int(request.META.get("CONTENT_LENGTH") or 0)
        if declared > request.user.active_plan.max_file_size_bytes + MULTIPART_OVERHEAD_BYTES:
            return rejected(services.FileTooLarge("El archivo supera el máximo de tu plan."))

        serializer = SongUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        upload = data.pop("file")

        try:
            song = services.upload_song(
                request.user,
                upload,
                upload.size,
                services.SongMetadata(**data),
            )
        except services.UploadRejected as error:
            return rejected(error)
        except services.StorageUnavailable:
            logger.exception("Fallo del almacenamiento al subir una canción")
            return Response(
                {"detail": "El almacenamiento no está disponible. Inténtalo de nuevo en unos minutos.", "code": "storage_unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(SongSerializer(song).data, status=status.HTTP_201_CREATED)
