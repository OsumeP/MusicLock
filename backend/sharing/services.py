"""
Casos de uso de compartir (lado del propietario). El servidor solo guarda la File
Key envuelta para el destinatario; nunca puede abrirla.
"""

from django.db import transaction
from django.db.models import Q, QuerySet

from accounts.models import User
from vault.services import get_own_song

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
