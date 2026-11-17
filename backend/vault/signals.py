"""
Limpieza de blobs: cada vez que se borra una `Song` (una sola, o en cascada al
borrar un usuario) se elimina su blob cifrado del almacenamiento.

El borrado del blob se hace con `transaction.on_commit`: si la transacción de
la base de datos se revierte, el blob NO se toca (no quedan filas sin archivo).
Si el borrado del blob falla, se registra en el log para poder limpiarlo a mano
(queda un blob huérfano, cifrado e ilegible, pero nunca una fila rota).
"""

import logging

from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Song
from .storage import get_blob_storage

logger = logging.getLogger(__name__)


def delete_blob_quietly(storage_key: str) -> None:
    try:
        get_blob_storage().delete(storage_key)
    except Exception:
        logger.exception("No se pudo borrar el blob %s (queda huérfano)", storage_key)


@receiver(post_delete, sender=Song, dispatch_uid="vault.delete_song_blob")
def delete_song_blob(sender, instance: Song, **kwargs) -> None:
    key = instance.storage_key
    transaction.on_commit(lambda: delete_blob_quietly(key))
