"""
Casos de uso de compartir: lado del propietario (día 17) y del destinatario
(día 18). El servidor solo guarda la File Key envuelta para el destinatario;
nunca puede abrirla.
"""

from typing import BinaryIO

from django.db import transaction
from django.db.models import Q, QuerySet

from accounts.models import User
from vault.models import Song
from vault.services import SongNotFound, get_own_song, open_blob

from .models import SongShare


class RecipientNotFound(Exception):
    """No hay una cuenta activa con ese correo o usuario."""


class RecipientWithoutKey(Exception):
    """La cuenta existe pero aún no generó su par de claves (no ha abierto su bóveda desde el día 16)."""


class CannotShareWithSelf(Exception):
    pass


def find_recipient(owner: User, query: str) -> User:
    """
    Busca un destinatario por correo o nombre de usuario EXACTOS (sin distinguir
    mayúsculas). No hay búsqueda parcial: no se puede listar a los usuarios.
    """
    query = query.strip()
    if not query:
        raise RecipientNotFound
    user = (
        User.objects.filter(is_active=True)
        .exclude(wrapped_master_key="")  # cuentas del admin sin bóveda
        .filter(Q(email__iexact=query) | Q(username__iexact=query))
        .first()
    )
    if user is None:
        raise RecipientNotFound
    if user.pk == owner.pk:
        raise CannotShareWithSelf
    if not user.has_keypair:
        raise RecipientWithoutKey
    return user


def shares_of(owner: User, song_id) -> QuerySet[SongShare]:
    """Quién tiene acceso a una canción propia (Accesos FR-05). Ajena → SongNotFound."""
    song = get_own_song(owner, song_id)
    return SongShare.objects.filter(song=song).select_related("recipient")


@transaction.atomic
def share_song(owner: User, song_id, recipient_username: str, *, wrapped_file_key: str, role: str) -> tuple[SongShare, bool]:
    """
    Comparte (o actualiza el acceso de) una canción propia con un destinatario.
    Volver a compartir reemplaza la File Key envuelta y el rol (Accesos FR-04).
    """
    song = get_own_song(owner, song_id)
    recipient = find_recipient(owner, recipient_username)
    return SongShare.objects.update_or_create(
        song=song,
        recipient=recipient,
        defaults={"wrapped_file_key": wrapped_file_key, "role": role},
    )


def revoke_share(owner: User, song_id, recipient_username: str) -> None:
    """
    Revoca el acceso (Accesos FR-02). Idempotente. El servidor deja de entregar el
    blob al destinatario, pero no puede borrar lo que ya descargó (PlanMVP §4.6).
    """
    song = get_own_song(owner, song_id)
    SongShare.objects.filter(song=song, recipient__username__iexact=recipient_username).delete()


# --- Lado del destinatario (día 18) ------------------------------------------------------


def shared_with(user: User, query: str = "") -> QuerySet[SongShare]:
    """
    Canciones compartidas con el usuario ("Compartido conmigo", Interfaz FR-04 /
    Accesos FR-06), la compartida más recientemente primero. `query` busca en
    título, artista y usuario propietario. Si el propietario está bloqueado
    (BR-06), sus canciones dejan de estar disponibles.
    """
    shares = SongShare.objects.filter(recipient=user, song__owner__is_active=True).select_related("song", "song__owner")
    query = query.strip()
    if query:
        shares = shares.filter(
            Q(song__title__icontains=query) | Q(song__artist__icontains=query) | Q(song__owner__username__icontains=query)
        )
    return shares


def get_share(user: User, song_id) -> SongShare:
    """El acceso del usuario a una canción ajena. Sin acceso (o revocado) → SongNotFound (404)."""
    share = shared_with(user).filter(song__uuid=song_id).first()
    if share is None:
        raise SongNotFound
    return share


def open_shared_blob(user: User, song_id) -> tuple[Song, BinaryIO]:
    """
    Proxy de acceso para destinatarios (patrón Proxy, Accesos FR-07): comprueba el
    permiso vigente ("Consulta") antes de entregar el blob CIFRADO. Tras revocar → 404.
    """
    song = get_share(user, song_id).song
    return song, open_blob(song)
