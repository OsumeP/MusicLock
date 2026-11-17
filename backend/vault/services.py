"""
Casos de uso de la bóveda (capa de aplicación).

El servidor recibe audio YA CIFRADO: no puede comprobar que sea un MP3 (eso lo
valida el navegador antes de cifrar). Lo que sí garantiza es la cuota y el
tamaño máximo por archivo del plan (BR-09, BR-10), y que la base de datos y el
almacenamiento de blobs queden consistentes entre sí.
"""

from dataclasses import dataclass
from typing import BinaryIO

from django.db import IntegrityError, transaction
from django.db.models import Exists, F, OuterRef, Q, QuerySet, Subquery

from accounts.models import User

from .models import Favorite, ListeningHistory, Song, build_storage_key
from .storage import get_blob_storage

# AES-GCM añade 16 bytes de tag: un cifrado más pequeño que esto no puede contener audio.
GCM_TAG_BYTES = 16


class UploadRejected(Exception):
    """La subida no cumple una regla de negocio. `code` lo usa el frontend para el mensaje."""

    code = "upload_rejected"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class FileTooLarge(UploadRejected):
    code = "file_too_large"


class QuotaExceeded(UploadRejected):
    code = "quota_exceeded"


class EmptyFile(UploadRejected):
    code = "empty_file"


class StorageUnavailable(Exception):
    """El almacenamiento de blobs (MinIO) falló. No es culpa del usuario: se puede reintentar."""


@dataclass(frozen=True)
class SongMetadata:
    title: str
    artist: str
    duration: int
    file_iv: str
    wrapped_file_key: str
    wrapped_key_iv: str


MAX_QUERY_LENGTH = 100


def own_songs(user: User) -> QuerySet[Song]:
    """
    Canciones del usuario anotadas con `is_favorite` y `favorited_at` (fecha en
    que la marcó, o None). Es la base de todas las consultas de la API.
    """
    marks = Favorite.objects.filter(user=user, song=OuterRef("pk"))
    return Song.objects.filter(owner=user).annotate(
        is_favorite=Exists(marks),
        favorited_at=Subquery(marks.values("created_at")[:1]),
    )


def songs_for(user: User, query: str = "", favorites_only: bool = False):
    """
    Canciones del usuario filtradas por título o artista. Normalmente las más
    recientes primero; con `favorites_only`, solo las favoritas, ordenadas por
    la fecha en que se marcaron (la más reciente primero).
    """
    songs = own_songs(user)
    query = query.strip()[:MAX_QUERY_LENGTH]
    if query:
        songs = songs.filter(Q(title__icontains=query) | Q(artist__icontains=query))
    if favorites_only:
        return songs.filter(is_favorite=True).order_by("-favorited_at", "-id")
    return songs.order_by("-creation_date", "-id")


def check_upload_allowed(user: User, size: int) -> None:
    """Reglas de tamaño y cuota. Se llama antes de leer el cuerpo y otra vez dentro de la transacción."""
    plan = user.active_plan
    if size <= GCM_TAG_BYTES:
        raise EmptyFile("El archivo está vacío.")
    if size > plan.max_file_size_bytes:
        raise FileTooLarge(f"El archivo supera el máximo de tu plan ({plan.max_file_size_bytes} bytes por archivo).")
    if size > user.storage_available:
        raise QuotaExceeded("No tienes espacio suficiente en tu plan para este archivo.")


def upload_song(user: User, data: BinaryIO, size: int, metadata: SongMetadata) -> Song:
    """
    Guarda el blob cifrado y su registro de forma atómica:
    - La fila del usuario se bloquea (SELECT … FOR UPDATE) para que dos subidas
      simultáneas no superen la cuota entre ambas.
    - Si falla el almacenamiento, no se crea nada en la base de datos.
    - Si falla la base de datos después de guardar el blob, el blob se borra.
    """
    storage = get_blob_storage()

    with transaction.atomic():
        locked_user = User.objects.select_for_update().select_related("active_plan").get(pk=user.pk)
        check_upload_allowed(locked_user, size)

        song = Song(owner=locked_user, size=size, **metadata.__dict__)
        song.storage_key = build_storage_key(locked_user.pk, song.uuid)

        try:
            storage.put(song.storage_key, data, size)
        except Exception as exc:
            raise StorageUnavailable(str(exc)) from exc
        try:
            song.save()
            User.objects.filter(pk=locked_user.pk).update(used_storage=F("used_storage") + size)
        except BaseException:
            storage.delete(song.storage_key)
            raise

    return song


# --- Descarga del blob cifrado (reproducción / descarga, días 7–8) ------------------


class SongNotFound(Exception):
    """No existe, o no es del usuario: ambos casos se responden igual (no revelar canciones ajenas)."""


class BlobMissing(Exception):
    """La fila existe pero el blob no está en el almacenamiento (inconsistencia que hay que investigar)."""


def get_own_song(user: User, song_id) -> Song:
    song = own_songs(user).filter(uuid=song_id).first()
    if song is None:
        raise SongNotFound
    return song


def open_song_blob(user: User, song_id) -> tuple[Song, BinaryIO]:
    """
    Proxy de acceso (patrón Proxy, PlanMVP §3.1): valida que la canción sea del
    usuario antes de abrir el blob. Devuelve el blob CIFRADO; el servidor nunca
    descifra nada. (El acceso de un destinatario lo valida `sharing`, día 18.)
    """
    song = get_own_song(user, song_id)
    return song, open_blob(song)


def open_blob(song: Song) -> BinaryIO:
    """
    Abre el blob CIFRADO de una canción cuyo acceso YA se validó (lo usan los
    proxies de `vault` y de `sharing`). Nunca llamarlo sin comprobar el acceso.
    """
    from .storage import BlobNotFound

    try:
        return get_blob_storage().open(song.storage_key)
    except BlobNotFound as exc:
        raise BlobMissing(song.storage_key) from exc
    except Exception as exc:
        raise StorageUnavailable(str(exc)) from exc


# --- Edición y eliminación (día 8) ----------------------------------------------------


def update_song(user: User, song_id, *, title: str | None = None, artist: str | None = None) -> Song:
    """Solo se editan metadatos en claro (D10); el audio y sus claves no cambian."""
    song = get_own_song(user, song_id)
    fields = []
    if title is not None:
        song.title = title
        fields.append("title")
    if artist is not None:
        song.artist = artist
        fields.append("artist")
    if fields:
        song.save(update_fields=fields)
    return song


def delete_song(user: User, song_id) -> None:
    """
    Borra la canción y libera su espacio en la cuota, de forma atómica. El blob
    se borra al confirmar la transacción (ver `vault/signals.py`).
    """
    from django.db.models.functions import Greatest

    with transaction.atomic():
        User.objects.select_for_update().filter(pk=user.pk).first()  # serializa con subidas simultáneas
        song = get_own_song(user, song_id)
        size = song.size
        song.delete()
        User.objects.filter(pk=user.pk).update(used_storage=Greatest(F("used_storage") - size, 0))


# --- Favoritos (día 11, MVP+) ---------------------------------------------------------


def set_favorite(user: User, song_id, favorite: bool) -> Song:
    """
    Marca o desmarca una canción propia como favorita. Es idempotente: marcar
    dos veces deja una sola marca y desmarcar algo no marcado no falla.
    Devuelve la canción con `is_favorite` / `favorited_at` actualizados.
    """
    song = get_own_song(user, song_id)
    if favorite:
        try:
            with transaction.atomic():
                Favorite.objects.get_or_create(user=user, song=song)
        except IntegrityError:
            pass  # otra petición simultánea la creó primero: el resultado es el mismo
    else:
        Favorite.objects.filter(user=user, song=song).delete()
    return get_own_song(user, song_id)


# --- Historial de reproducción (día 12, MVP+) -------------------------------------------


def record_play(user: User, song_id) -> ListeningHistory:
    """Registra que el usuario empezó a escuchar una canción propia (Estadísticas FR-01)."""
    song = get_own_song(user, song_id)
    return ListeningHistory.objects.create(user=user, song=song)


def history_for(user: User, distinct: bool = False) -> QuerySet[ListeningHistory]:
    """
    Reproducciones del usuario, la más reciente primero. Con `distinct`, solo la
    última reproducción de cada canción ("Reproducido recientemente" sin repetidos).
    Cada entrada lleva `song_is_favorite` / `song_favorited_at` para el corazón.
    """
    entries = ListeningHistory.objects.filter(user=user).select_related("song")
    if distinct:
        latest = (
            ListeningHistory.objects.filter(user=user, song=OuterRef("song"))
            .order_by("-played_at", "-id")
            .values("id")[:1]
        )
        entries = entries.filter(id=Subquery(latest))
    marks = Favorite.objects.filter(user=user, song=OuterRef("song"))
    return entries.annotate(
        song_is_favorite=Exists(marks),
        song_favorited_at=Subquery(marks.values("created_at")[:1]),
    ).order_by("-played_at", "-id")


def clear_history(user: User) -> int:
    """Borra todo el historial del usuario. Devuelve cuántas reproducciones se eliminaron."""
    deleted, _ = ListeningHistory.objects.filter(user=user).delete()
    return deleted
