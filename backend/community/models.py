from django.conf import settings
from django.db import models

#: 0 = comentario raíz. Una respuesta a un comentario de este nivel se rechaza.
MAX_DEPTH = 4
MAX_BODY_LENGTH = 1000


class Comment(models.Model):
    """
    Comentario en una canción pública. Forma un árbol por `parent` (lista de
    adyacencia). Si se elimina uno con respuestas, queda `is_deleted` y sin texto
    para no romper el hilo.
    """

    song = models.ForeignKey("vault.Song", on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="comments")
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="replies")
    depth = models.PositiveSmallIntegerField(default=0, editable=False)
    body = models.CharField(max_length=MAX_BODY_LENGTH, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True, editable=False)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["song", "created_at"])]
        constraints = [
            models.CheckConstraint(condition=models.Q(depth__lte=MAX_DEPTH), name="comment_max_depth"),
            models.CheckConstraint(
                condition=models.Q(is_deleted=False) | models.Q(body=""), name="deleted_comment_has_no_body"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.author}: {self.body[:40]}"