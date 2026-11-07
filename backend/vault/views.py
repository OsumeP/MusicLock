import logging

from django.http import StreamingHttpResponse

from rest_framework import status
from rest_framework.pagination import PageNumberPagination
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


class SongPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class SongListCreateView(APIView):
    parser_classes = [MultiPartParser]

    def get(self, request):
        """
        GET /api/songs?q=&page=&page_size= — canciones del usuario, más recientes primero.
        `q` busca en título y artista (metadatos en claro, D10). Solo se listan las
        canciones propias: no hay forma de pedir las de otro usuario.
        """
        songs = services.songs_for(request.user, query=request.query_params.get("q", ""))
        paginator = SongPagination()
        page = paginator.paginate_queryset(songs, request, view=self)
        return paginator.get_paginated_response(SongSerializer(page, many=True).data)

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
            return _storage_unavailable()

        return Response(SongSerializer(song).data, status=status.HTTP_201_CREATED)


def _storage_unavailable() -> Response:
    return Response(
        {"detail": "El almacenamiento no está disponible. Inténtalo de nuevo en unos minutos.", "code": "storage_unavailable"},
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


def _iter_blob(blob, chunk_size: int = 64 * 1024):
    try:
        while chunk := blob.read(chunk_size):
            yield chunk
    finally:
        blob.close()


class SongBlobView(APIView):
    """
    GET /api/songs/{id}/blob — el audio CIFRADO, en streaming, solo para su dueño.
    Una canción ajena o inexistente responde 404 (no se revela si existe).
    """

    def get(self, request, song_id):
        try:
            song, blob = services.open_song_blob(request.user, song_id)
        except services.SongNotFound:
            return Response({"detail": "Canción no encontrada.", "code": "not_found"}, status=status.HTTP_404_NOT_FOUND)
        except services.BlobMissing as error:
            logger.error("Falta el blob de una canción existente: %s", error)
            return Response(
                {"detail": "El archivo cifrado no está disponible.", "code": "blob_missing"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except services.StorageUnavailable:
            logger.exception("Fallo del almacenamiento al leer una canción")
            return _storage_unavailable()

        response = StreamingHttpResponse(_iter_blob(blob), content_type="application/octet-stream")
        response["Content-Length"] = str(song.size)
        # Bytes cifrados, pero aun así privados: ni proxies ni caché del navegador.
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
