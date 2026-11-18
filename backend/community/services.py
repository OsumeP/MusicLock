"""
Casos de uso de Comunidad (canciones públicas, D11).

Una canción es visible aquí solo si es pública Y la cuenta de su dueño sigue
activa (BR-06: una cuenta bloqueada deja de mostrar sus canciones). Los
proxies de acceso viven aquí y reutilizan `open_blob` de la bóveda.
"""

from django.db import IntegrityError, transaction
from django.db.models import Count, OuterRef, Q, QuerySet, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone

from accounts.models import User
from vault.models import Song, Visibility
from vault.services import SongNotFound, open_blob

from .models import MAX_DEPTH, Comment, Follow



MAX_QUERY_LENGTH = 100
SCOPES = ("community", "mine", "following")



class InvalidScope(Exception):
    """`scope` debe ser `community` o `mine`."""


def visible_public_songs() -> QuerySet[Song]:
    """
    Base de toda consulta de Comunidad: públicas, con el dueño activo y anotadas con
    `comment_count` (comentarios no eliminados).
    """
    comments = (
        Comment.objects.filter(song=OuterRef("pk"), is_deleted=False)
        .order_by()
        .values("song")
        .annotate(n=Count("pk"))
        .values("n")
    )
    return (
        Song.objects.filter(visibility=Visibility.PUBLIC, owner__is_active=True)
        .select_related("owner")
        .annotate(comment_count=Coalesce(Subquery(comments), 0))
    )

def public_songs(user: User, scope: str = "community", query: str = "") -> QuerySet[Song]:
    """
    `community`: públicas de otros usuarios. `mine`: mis propias públicas.
    `query` busca en título, artista y nombre de usuario del dueño.
    La más recientemente publicada primero.
    """
    if scope not in SCOPES:
        raise InvalidScope(scope)
    songs = visible_public_songs()
    if scope == "mine":
        songs = songs.filter(owner=user)
    elif scope == "following":
        songs = songs.filter(owner_id__in=Follow.objects.filter(follower=user).values("followed_id"))
    else:
        songs = songs.exclude(owner=user)    
    
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

# --- Comentarios -----------------------------------------------------------------------

#: El dueño de una canción no abre hilos nuevos en ella, pero responde y modera. Con
#: False, en sus propias canciones solo puede ver y eliminar comentarios.
OWNER_MAY_REPLY = True


class CommentError(Exception):
    """Regla de negocio de comentarios. `code` y `http_status` los usa la vista."""

    code = "comment_error"
    http_status = 400

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class CommentNotFound(CommentError):
    code = "not_found"
    http_status = 404


class CommentForbidden(CommentError):
    code = "forbidden"
    http_status = 403


class OwnerCannotComment(CommentError):
    code = "owner_cannot_comment"
    http_status = 403


class MaxDepthReached(CommentError):
    code = "max_depth"


def list_comments(song_id) -> QuerySet[Comment]:
    """Todos los comentarios de una canción pública, en orden cronológico (el frontend arma el árbol)."""
    song = get_public_song(song_id)  # privada o inexistente: SongNotFound (404)
    return Comment.objects.filter(song=song).select_related("author", "song")


def _check_owner_policy(user: User, song: Song, parent: Comment | None) -> None:
    if song.owner_id != user.pk:
        return
    if not OWNER_MAY_REPLY:
        raise OwnerCannotComment("En tus propias canciones solo puedes ver y eliminar comentarios.")
    if parent is None:
        raise OwnerCannotComment("No puedes abrir comentarios en tu propia canción; responde a los de otros.")


def create_comment(user: User, song_id, body: str, parent_id: int | None = None) -> Comment:
    song = get_public_song(song_id)
    parent = None
    if parent_id is not None:
        parent = Comment.objects.filter(pk=parent_id, song=song).first()
        if parent is None or parent.is_deleted:
            raise CommentNotFound("El comentario al que respondes ya no existe.")
        if parent.depth >= MAX_DEPTH:
            raise MaxDepthReached("Esta conversación llegó al máximo de niveles de respuesta.")
    _check_owner_policy(user, song, parent)
    return Comment.objects.create(
        song=song, author=user, parent=parent, depth=0 if parent is None else parent.depth + 1, body=body
    )


def _get_visible_comment(comment_id) -> Comment:
    """Un comentario solo existe mientras su canción siga pública."""
    comment = Comment.objects.select_related("author", "song").filter(pk=comment_id).first()
    if comment is None:
        raise CommentNotFound("Comentario no encontrado.")
    try:
        get_public_song(comment.song.uuid)
    except SongNotFound:
        raise CommentNotFound("Comentario no encontrado.") from None
    return comment


def edit_comment(user: User, comment_id, body: str) -> Comment:
    comment = _get_visible_comment(comment_id)
    if comment.is_deleted:
        raise CommentNotFound("Comentario no encontrado.")
    if comment.author_id != user.pk:
        raise CommentForbidden("Solo puedes editar tus propios comentarios.")
    if body != comment.body:
        comment.body = body
        comment.edited_at = timezone.now()
        comment.save(update_fields=["body", "edited_at"])
    return comment


def delete_comment(user: User, comment_id) -> None:
    """
    Elimina un comentario (el autor o el dueño de la canción). Con respuestas, queda
    como "eliminado" para conservar el hilo; sin ellas, se borra, junto con los
    padres ya eliminados que se queden sin respuestas. Es idempotente.
    """
    with transaction.atomic():
        comment = _get_visible_comment(comment_id)
        if user.pk not in (comment.author_id, comment.song.owner_id):
            raise CommentForbidden("Solo el autor o el dueño de la canción pueden eliminar un comentario.")
        if comment.is_deleted:
            return
        if comment.replies.exists():
            comment.is_deleted = True
            comment.body = ""
            comment.save(update_fields=["is_deleted", "body"])
            return
        parent = comment.parent
        comment.delete()
        while parent is not None and parent.is_deleted and not parent.replies.exists():
            grandparent = parent.parent
            parent.delete()
            parent = grandparent

# --- Seguir usuarios -------------------------------------------------------------------


class FollowError(Exception):
    """Regla de negocio de seguir. `code` y `http_status` los usa la vista."""

    code = "follow_error"
    http_status = 400

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class UserNotFound(FollowError):
    code = "user_not_found"
    http_status = 404


class SelfFollow(FollowError):
    code = "self_follow"


def followed_ids(user: User) -> set[int]:
    """Ids de las cuentas que sigue `user` (una consulta por petición, para marcar `is_following`)."""
    return set(Follow.objects.filter(follower=user).values_list("followed_id", flat=True))


def follow_user(user: User, username: str) -> User:
    """Sigue a una cuenta activa. Idempotente. No se puede seguir a uno mismo."""
    target = User.objects.filter(username=username, is_active=True).first()
    if target is None:
        raise UserNotFound("No hay ninguna cuenta con ese usuario.")
    if target.pk == user.pk:
        raise SelfFollow("No puedes seguirte a ti mismo.")
    try:
        with transaction.atomic():
            Follow.objects.get_or_create(follower=user, followed=target)
    except IntegrityError:
        pass  # otra petición simultánea lo creó primero: el resultado es el mismo
    return target


def unfollow_user(user: User, username: str) -> User:
    """Deja de seguir. Idempotente, y también sirve para cuentas ya bloqueadas (limpiar la lista)."""
    target = User.objects.filter(username=username).first()
    if target is None:
        raise UserNotFound("No hay ninguna cuenta con ese usuario.")
    Follow.objects.filter(follower=user, followed=target).delete()
    return target