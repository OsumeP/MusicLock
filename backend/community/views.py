from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from vault.services import SongNotFound
from vault.views import SongPagination, serve_encrypted_blob

from . import services
from .serializers import CommentCreateSerializer, CommentSerializer, CommentUpdateSerializer, CommunitySongSerializer

def _not_found() -> Response:
    return Response({"detail": "Canción no encontrada.", "code": "not_found"}, status=status.HTTP_404_NOT_FOUND)


class CommunitySongListView(APIView):
    """
    GET /api/community/songs?scope=community|mine&q=&page=&page_size=
    Canciones públicas, la más recientemente publicada primero. `community` (por
    defecto): las de otros usuarios; `mine`: mis propias públicas.
    """

    def get(self, request):
        try:
            songs = services.public_songs(
                request.user,
                scope=request.query_params.get("scope", "community"),
                query=request.query_params.get("q", ""),
            )
        except services.InvalidScope:
            return Response(
                {"detail": "`scope` debe ser community o mine.", "code": "invalid_scope"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        paginator = SongPagination()
        page = paginator.paginate_queryset(songs, request, view=self)
        return paginator.get_paginated_response(
            CommunitySongSerializer(page, many=True, context={"request": request}).data
        )


class CommunitySongDetailView(APIView):
    """GET /api/community/songs/{id} — una canción pública. Privada o inexistente: 404."""

    def get(self, request, song_id):
        try:
            song = services.get_public_song(song_id)
        except SongNotFound:
            return _not_found()
        return Response(CommunitySongSerializer(song, context={"request": request}).data)


class CommunitySongBlobView(APIView):
    """
    GET /api/community/songs/{id}/blob — el audio CIFRADO de una canción pública, en
    streaming. Tras despublicarla (o bloquear al dueño) responde 404.
    """

    def get(self, request, song_id):
        return serve_encrypted_blob(lambda: services.open_public_blob(song_id))

def _comment_error(error: services.CommentError) -> Response:
    return Response({"detail": error.message, "code": error.code}, status=error.http_status)


class SongCommentsView(APIView):
    """
    GET  /api/community/songs/{id}/comments — todos los comentarios, en orden cronológico.
    POST /api/community/songs/{id}/comments — {"body": "...", "parent": <id opcional>}.
    Canción privada o inexistente: 404.
    """

    def get(self, request, song_id):
        try:
            comments = services.list_comments(song_id)
        except SongNotFound:
            return _not_found()
        return Response(CommentSerializer(comments, many=True, context={"request": request}).data)

    def post(self, request, song_id):
        serializer = CommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            comment = services.create_comment(request.user, song_id, **serializer.validated_data)
        except SongNotFound:
            return _not_found()
        except services.CommentError as error:
            return _comment_error(error)
        return Response(CommentSerializer(comment, context={"request": request}).data, status=status.HTTP_201_CREATED)


class CommentDetailView(APIView):
    """
    PATCH  /api/community/comments/{id} — editar el texto (solo el autor).
    DELETE /api/community/comments/{id} — eliminar (el autor o el dueño de la canción).
    """

    def patch(self, request, comment_id):
        serializer = CommentUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            comment = services.edit_comment(request.user, comment_id, serializer.validated_data["body"])
        except services.CommentError as error:
            return _comment_error(error)
        return Response(CommentSerializer(comment, context={"request": request}).data)

    def delete(self, request, comment_id):
        try:
            services.delete_comment(request.user, comment_id)
        except services.CommentError as error:
            return _comment_error(error)
        return Response(status=status.HTTP_204_NO_CONTENT)