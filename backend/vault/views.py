import logging

from django.http import StreamingHttpResponse

from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .serializers import HistoryEntrySerializer, SongSerializer, SongUpdateSerializer, SongUploadSerializer

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
        GET /api/songs?q=&favorites=&page=&page_size= — canciones del usuario, más
        recientes primero. `q` busca en título y artista (metadatos en claro, D10);
        `favorites=1` deja solo las favoritas, ordenadas por fecha de marcado.
        Solo se listan las canciones propias: no hay forma de pedir las de otro usuario.
        """
        songs = services.songs_for(
            request.user,
            query=request.query_params.get("q", ""),
            favorites_only=request.query_params.get("favorites") in ("1", "true"),
        )
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


def serve_encrypted_blob(open_authorized):
    """
    Respuesta común de los proxies de blobs (propio en `vault`, compartido en
    `sharing`). `open_authorized()` valida el acceso y devuelve (song, blob), o
    lanza SongNotFound / BlobMissing / StorageUnavailable.
    """
    try:
        song, blob = open_authorized()
    except services.SongNotFound:
        return _not_found()
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


class SongBlobView(APIView):
    """
    GET /api/songs/{id}/blob — el audio CIFRADO, en streaming, solo para su dueño.
    Una canción ajena o inexistente responde 404 (no se revela si existe).
    """

    def get(self, request, song_id):
        return serve_encrypted_blob(lambda: services.open_song_blob(request.user, song_id))


def _not_found() -> Response:
    return Response({"detail": "Canción no encontrada.", "code": "not_found"}, status=status.HTTP_404_NOT_FOUND)


class SongDetailView(APIView):
    """
    PATCH  /api/songs/{id} — editar título y/o artista.
    DELETE /api/songs/{id} — eliminar la canción, su blob y liberar la cuota.
    Canciones ajenas: 404 (igual que inexistentes).
    """

    def patch(self, request, song_id):
        serializer = SongUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            song = services.update_song(request.user, song_id, **serializer.validated_data)
        except services.SongNotFound:
            return _not_found()
        return Response(SongSerializer(song).data)

    def delete(self, request, song_id):
        try:
            services.delete_song(request.user, song_id)
        except services.SongNotFound:
            return _not_found()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SongFavoriteView(APIView):
    """
    PUT    /api/songs/{id}/favorite — marcar como favorita (idempotente).
    DELETE /api/songs/{id}/favorite — quitar la marca (idempotente).
    Ambas responden la canción actualizada. Canciones ajenas: 404.
    """

    def put(self, request, song_id):
        return self._set(request, song_id, favorite=True)

    def delete(self, request, song_id):
        return self._set(request, song_id, favorite=False)

    def _set(self, request, song_id, *, favorite: bool) -> Response:
        try:
            song = services.set_favorite(request.user, song_id, favorite)
        except services.SongNotFound:
            return _not_found()
        return Response(SongSerializer(song).data)


class SongPlaysView(APIView):
    """POST /api/songs/{id}/plays — registra una reproducción (la llama el reproductor al empezar a sonar)."""

    def post(self, request, song_id):
        try:
            entry = services.record_play(request.user, song_id)
        except services.SongNotFound:
            return _not_found()
        entry = services.history_for(request.user).get(pk=entry.pk)
        return Response(HistoryEntrySerializer(entry).data, status=status.HTTP_201_CREATED)


class HistoryView(APIView):
    """
    GET    /api/history?distinct=&page=&page_size= — reproducciones propias, la más
           reciente primero; `distinct=1` deja solo la última de cada canción.
    DELETE /api/history — borra todo el historial del usuario.
    """

    def get(self, request):
        entries = services.history_for(request.user, distinct=request.query_params.get("distinct") in ("1", "true"))
        paginator = SongPagination()
        page = paginator.paginate_queryset(entries, request, view=self)
        return paginator.get_paginated_response(HistoryEntrySerializer(page, many=True).data)

    def delete(self, request):
        services.clear_history(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)
