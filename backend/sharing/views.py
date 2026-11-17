from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from vault.services import SongNotFound
from vault.views import SongPagination, serve_encrypted_blob

from . import services
from .serializers import RecipientSerializer, SharedSongSerializer, ShareSerializer, ShareWriteSerializer


def _error(detail: str, code: str, http_status: int) -> Response:
    return Response({"detail": detail, "code": code}, status=http_status)


def _song_not_found() -> Response:
    return _error("Canción no encontrada.", "not_found", status.HTTP_404_NOT_FOUND)


def _recipient_error(error: Exception) -> Response:
    if isinstance(error, services.CannotShareWithSelf):
        return _error("No puedes compartir contigo.", "self_share", status.HTTP_400_BAD_REQUEST)
    if isinstance(error, services.RecipientWithoutKey):
        return _error(
            "Esa persona aún no tiene clave para compartir: debe iniciar sesión en MusicLock una vez.",
            "recipient_without_key",
            status.HTTP_409_CONFLICT,
        )
    return _error("No hay ninguna cuenta con ese correo o usuario.", "recipient_not_found", status.HTTP_404_NOT_FOUND)


RECIPIENT_ERRORS = (services.RecipientNotFound, services.RecipientWithoutKey, services.CannotShareWithSelf)


class RecipientLookupView(APIView):
    """
    GET /api/users/lookup?q={correo o usuario exacto} → {username, public_key}.
    Solo coincidencias exactas; con límite de peticiones por usuario para que no
    sirva para averiguar en masa qué cuentas existen.
    """

    throttle_scope = "auth"

    def get(self, request):
        try:
            recipient = services.find_recipient(request.user, request.query_params.get("q", ""))
        except RECIPIENT_ERRORS as error:
            return _recipient_error(error)
        return Response(RecipientSerializer(recipient).data)


class SongSharesView(APIView):
    """GET /api/songs/{id}/shares — quién tiene acceso a una canción propia (ajena: 404)."""

    def get(self, request, song_id):
        try:
            shares = services.shares_of(request.user, song_id)
        except SongNotFound:
            return _song_not_found()
        return Response(ShareSerializer(shares, many=True).data)


class SongShareView(APIView):
    """
    PUT    /api/songs/{id}/shares/{username} {wrapped_file_key, role?} → 201 (nuevo) o 200 (actualizado).
    DELETE /api/songs/{id}/shares/{username} → 204, idempotente (revocar).
    """

    def put(self, request, song_id, username):
        serializer = ShareWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            share, created = services.share_song(request.user, song_id, username, **serializer.validated_data)
        except SongNotFound:
            return _song_not_found()
        except RECIPIENT_ERRORS as error:
            return _recipient_error(error)
        return Response(ShareSerializer(share).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request, song_id, username):
        try:
            services.revoke_share(request.user, song_id, username)
        except SongNotFound:
            return _song_not_found()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Lado del destinatario (día 18) ------------------------------------------------------


class SharedWithMeView(APIView):
    """GET /api/shared?q=&page= — "Compartido conmigo", la compartida más recientemente primero."""

    def get(self, request):
        shares = services.shared_with(request.user, request.query_params.get("q", ""))
        paginator = SongPagination()
        page = paginator.paginate_queryset(shares, request, view=self)
        return paginator.get_paginated_response(SharedSongSerializer(page, many=True).data)


class SharedBlobView(APIView):
    """
    GET /api/shared/{id}/blob — el audio CIFRADO de una canción compartida conmigo.
    Sin acceso vigente → 404, igual que una canción inexistente.
    """

    def get(self, request, song_id):
        return serve_encrypted_blob(lambda: services.open_shared_blob(request.user, song_id))
