from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from vault.services import SongNotFound

from . import services
from .serializers import MoveSongSerializer, PlaylistDetailSerializer, PlaylistSerializer, PlaylistWriteSerializer


def _playlist_not_found() -> Response:
    return Response({"detail": "Playlist no encontrada.", "code": "not_found"}, status=status.HTTP_404_NOT_FOUND)


def _song_not_found() -> Response:
    return Response({"detail": "Canción no encontrada.", "code": "song_not_found"}, status=status.HTTP_404_NOT_FOUND)


def _detail(request, playlist) -> Response:
    songs = services.playlist_songs(request.user, playlist)
    return Response(PlaylistDetailSerializer(playlist, context={"songs": songs}).data)


class PlaylistListCreateView(APIView):
    """
    GET  /api/playlists[?song={id}] — playlists propias, la modificada más recientemente
         primero. Con `song`, cada una indica si contiene esa canción (`contains_song`).
    POST /api/playlists — crear (`name`, `description` opcional).
    """

    def get(self, request):
        song = request.query_params.get("song")
        if song:
            try:
                song = drf_serializers.UUIDField().to_internal_value(song)
            except drf_serializers.ValidationError:
                return Response({"detail": "`song` no es un identificador válido.", "code": "invalid"}, status=status.HTTP_400_BAD_REQUEST)
        playlists = services.playlists_for(request.user, containing_song=song or None)
        return Response(PlaylistSerializer(playlists, many=True).data)

    def post(self, request):
        serializer = PlaylistWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        playlist = services.create_playlist(request.user, **serializer.validated_data)
        return Response(PlaylistSerializer(playlist).data, status=status.HTTP_201_CREATED)


class PlaylistDetailView(APIView):
    """
    GET    /api/playlists/{id} — playlist con sus canciones en orden.
    PATCH  /api/playlists/{id} — renombrar / cambiar descripción.
    DELETE /api/playlists/{id} — borrar la playlist (las canciones no se tocan).
    Playlists ajenas: 404.
    """

    def get(self, request, playlist_id):
        try:
            playlist = services.get_own_playlist(request.user, playlist_id)
        except services.PlaylistNotFound:
            return _playlist_not_found()
        return _detail(request, playlist)

    def patch(self, request, playlist_id):
        serializer = PlaylistWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            playlist = services.update_playlist(request.user, playlist_id, **serializer.validated_data)
        except services.PlaylistNotFound:
            return _playlist_not_found()
        return Response(PlaylistSerializer(playlist).data)

    def delete(self, request, playlist_id):
        try:
            services.delete_playlist(request.user, playlist_id)
        except services.PlaylistNotFound:
            return _playlist_not_found()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlaylistSongView(APIView):
    """
    PUT    /api/playlists/{id}/songs/{song_id} — añadir al final (201; 200 si ya estaba).
    DELETE /api/playlists/{id}/songs/{song_id} — quitar (idempotente, 204).
    PATCH  /api/playlists/{id}/songs/{song_id} — mover a `position` (0 = primera); responde el detalle.
    """

    def put(self, request, playlist_id, song_id):
        try:
            playlist, added = services.add_song(request.user, playlist_id, song_id)
        except services.PlaylistNotFound:
            return _playlist_not_found()
        except SongNotFound:
            return _song_not_found()
        return Response(PlaylistSerializer(playlist).data, status=status.HTTP_201_CREATED if added else status.HTTP_200_OK)

    def delete(self, request, playlist_id, song_id):
        try:
            services.remove_song(request.user, playlist_id, song_id)
        except services.PlaylistNotFound:
            return _playlist_not_found()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, playlist_id, song_id):
        serializer = MoveSongSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            playlist = services.move_song(request.user, playlist_id, song_id, serializer.validated_data["position"])
        except services.PlaylistNotFound:
            return _playlist_not_found()
        except SongNotFound:
            return _song_not_found()
        return _detail(request, playlist)
