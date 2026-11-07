"""
Casos de uso de la bóveda (capa de aplicación).

El servidor recibe audio YA CIFRADO: no puede comprobar que sea un MP3 (eso lo
valida el navegador antes de cifrar). Lo que sí garantiza es la cuota y el
tamaño máximo por archivo del plan (BR-09, BR-10), y que la base de datos y el
almacenamiento de blobs queden consistentes entre sí.
"""

from dataclasses import dataclass
from typing import BinaryIO

from django.db import transaction
from django.db.models import F, Q

from accounts.models import User

from .models import Song, build_storage_key
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


def songs_for(user: User, query: str = ""):
    """Canciones del usuario (las más recientes primero), filtradas por título o artista."""
    songs = Song.objects.filter(owner=user)
    query = query.strip()[:MAX_QUERY_LENGTH]
    if query:
        songs = songs.filter(Q(title__icontains=query) | Q(artist__icontains=query))
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
