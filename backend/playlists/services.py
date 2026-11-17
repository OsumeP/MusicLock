"""
Casos de uso de las playlists privadas (MVP+, Accesos FR-08 a FR-12).

Reglas:
- Un usuario solo ve y modifica sus playlists; una ajena se trata como inexistente (404).
- Solo se pueden añadir canciones propias (por ahora no existe compartir).
- Una canción aparece como máximo una vez por playlist; añadirla otra vez no cambia nada.
- Las posiciones son siempre 0..n-1 (se renumeran al quitar o mover).
- Borrar una playlist no borra canciones; borrar una canción la quita de sus playlists (CASCADE).
"""

from django.db import transaction
from django.db.models import Count, Exists, OuterRef, QuerySet, Sum, Value
from django.db.models.functions import Coalesce

from accounts.models import User
from vault.models import Song
from vault.services import SongNotFound, get_own_song, own_songs

from .models import Playlist, PlaylistSong


class PlaylistNotFound(Exception):
    """No existe o no es del usuario: ambos casos se responden igual."""


def playlists_for(user: User, containing_song=None) -> QuerySet[Playlist]:
    """
    Playlists del usuario (la modificada más recientemente primero) con
    `song_count`, `total_size` (bytes cifrados) y `total_duration` (segundos).
    Con `containing_song` (UUID) anota también `contains_song`.
    """
    playlists = Playlist.objects.filter(owner=user).annotate(
        song_count=Count("entries"),
        total_size=Coalesce(Sum("entries__song__size"), Value(0)),
        total_duration=Coalesce(Sum("entries__song__duration"), Value(0)),
    )
    if containing_song is not None:
        playlists = playlists.annotate(
            contains_song=Exists(PlaylistSong.objects.filter(playlist=OuterRef("pk"), song__uuid=containing_song))
        )
    return playlists.order_by("-updated_at", "-id")


def get_own_playlist(user: User, playlist_id) -> Playlist:
    playlist = playlists_for(user).filter(uuid=playlist_id).first()
    if playlist is None:
        raise PlaylistNotFound
    return playlist


def playlist_songs(user: User, playlist: Playlist) -> list[Song]:
    """Canciones de la playlist en su orden, con las anotaciones de `own_songs` (favorito)."""
    song_ids = list(PlaylistSong.objects.filter(playlist=playlist).order_by("position", "id").values_list("song_id", flat=True))
    songs = own_songs(user).in_bulk(song_ids)
    return [songs[song_id] for song_id in song_ids if song_id in songs]


def create_playlist(user: User, name: str, description: str = "") -> Playlist:
    playlist = Playlist.objects.create(owner=user, name=name, description=description)
    return get_own_playlist(user, playlist.uuid)


def update_playlist(user: User, playlist_id, *, name: str | None = None, description: str | None = None) -> Playlist:
    playlist = get_own_playlist(user, playlist_id)
    if name is not None:
        playlist.name = name
    if description is not None:
        playlist.description = description
    playlist.save(update_fields=["name", "description", "updated_at"])
    return get_own_playlist(user, playlist_id)


def delete_playlist(user: User, playlist_id) -> None:
    """Borra la playlist y sus entradas. Las canciones no se tocan."""
    deleted, _ = Playlist.objects.filter(owner=user, uuid=playlist_id).delete()
    if not deleted:
        raise PlaylistNotFound


def _lock_playlist(user: User, playlist_id) -> Playlist:
    """Bloquea la fila de la playlist: serializa altas, bajas y movimientos simultáneos."""
    playlist = Playlist.objects.select_for_update().filter(owner=user, uuid=playlist_id).first()
    if playlist is None:
        raise PlaylistNotFound
    return playlist


def _save_order(playlist: Playlist, entries: list[PlaylistSong]) -> None:
    """Renumera las entradas 0..n-1 en el orden dado y marca la playlist como modificada."""
    changed = []
    for position, entry in enumerate(entries):
        if entry.position != position:
            entry.position = position
            changed.append(entry)
    PlaylistSong.objects.bulk_update(changed, ["position"])
    playlist.save(update_fields=["updated_at"])


def add_song(user: User, playlist_id, song_id) -> tuple[Playlist, bool]:
    """Añade una canción propia al final. Devuelve (playlist, añadida). Si ya estaba, no cambia nada."""
    with transaction.atomic():
        playlist = _lock_playlist(user, playlist_id)
        song = get_own_song(user, song_id)  # SongNotFound si es ajena o no existe
        if PlaylistSong.objects.filter(playlist=playlist, song=song).exists():
            return get_own_playlist(user, playlist_id), False
        PlaylistSong.objects.create(playlist=playlist, song=song, position=playlist.entries.count())
        playlist.save(update_fields=["updated_at"])
    return get_own_playlist(user, playlist_id), True


def remove_song(user: User, playlist_id, song_id) -> None:
    """Quita la canción de la playlist (idempotente) y cierra el hueco en las posiciones."""
    with transaction.atomic():
        playlist = _lock_playlist(user, playlist_id)
        deleted, _ = PlaylistSong.objects.filter(playlist=playlist, song__uuid=song_id).delete()
        if deleted:
            _save_order(playlist, list(playlist.entries.order_by("position", "id")))


def move_song(user: User, playlist_id, song_id, position: int) -> Playlist:
    """Mueve la canción a `position` (0 = primera; si es mayor que el final, queda al final)."""
    with transaction.atomic():
        playlist = _lock_playlist(user, playlist_id)
        entries = list(playlist.entries.select_related("song").order_by("position", "id"))
        moving = next((e for e in entries if str(e.song.uuid) == str(song_id)), None)
        if moving is None:
            raise SongNotFound
        entries.remove(moving)
        entries.insert(min(position, len(entries)), moving)
        _save_order(playlist, entries)
    return get_own_playlist(user, playlist_id)
