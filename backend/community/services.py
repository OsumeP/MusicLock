"""
Casos de uso de Comunidad (canciones públicas, D11).

Una canción es visible aquí solo si es pública Y la cuenta de su dueño sigue
activa (BR-06: una cuenta bloqueada deja de mostrar sus canciones). Los
proxies de acceso viven aquí y reutilizan `open_blob` de la bóveda.
"""

from django.db.models import Q, QuerySet

from accounts.models import User
from vault.models import Song, Visibility
from vault.services import SongNotFound, open_blob

MAX_QUERY_LENGTH = 100
SCOPES = ("community", "mine")


class InvalidScope(Exception):
    """`scope` debe ser `community` o `mine`."""


def visible_public_songs() -> QuerySet[Song]:
    """Base de toda consulta de Comunidad: públicas y con el dueño activo."""
    return Song.objects.filter(visibility=Visibility.PUBLIC, owner__is_active=True).select_related("owner")


def public_songs(user: User, scope: str = "community", query: str = "") -> QuerySet[Song]:
    """
    `community`: públicas de otros usuarios. `mine`: mis propias públicas.
    `query` busca en título, artista y nombre de usuario del dueño.
    La más recientemente publicada primero.
    """
    if scope not in SCOPES:
        raise InvalidScope(scope)
    songs = visible_public_songs()
    songs = songs.filter(owner=user) if scope == "mine" else songs.exclude(owner=user)
    query = query.strip()[:MAX_QUERY_LENGTH]
    if query:
        songs = songs.filter(
            Q(title__icontains=query) | Q(artist__icontains=query) | Q(owner__username__icontains=query)
        )
    return songs.order_by("-published_at", "-id")


def get_public_song(song_id) -> Song:
    """Una canción pública. Privada, inexistente o de cuenta bloqueada: todas responden igual (404)."""
    song = visible_public_songs().filter(uuid=song_id).first()
    if song is None:
        raise SongNotFound
    return song


def open_public_blob(song_id):
    """
    Proxy de acceso (patrón Proxy): solo abre el blob CIFRADO si la canción sigue
    siendo pública. Tras despublicar, responde 404 desde ese momento.
    """
    song = get_public_song(song_id)
    return song, open_blob(song)