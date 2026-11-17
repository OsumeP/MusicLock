"""
Compartir canciones con usuarios concretos (Semana 4, BR-21, PlanMVP §4.6).

Un `SongShare` guarda la File Key de la canción envuelta con la clave pública del
destinatario (RSA-OAEP). El blob no se copia: el destinatario descarga el mismo
cifrado que el propietario, a través del Proxy de `vault`.
"""

from django.conf import settings
from django.db import models

from vault.models import Song


class SongShare(models.Model):
    # Accesos FR-03: rol de permiso. Por ahora solo "Consulta" (reproducir y
    # descargar; no editar, borrar ni volver a compartir).
    ROLE_QUERY = "query"
    ROLE_CHOICES = [(ROLE_QUERY, "Consulta")]

    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name="shares")
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="songs_shared_with_me")
    wrapped_file_key = models.TextField(help_text="File Key envuelta con RSA-OAEP para el destinatario (base64).")
    role = models.CharField(max_length=16, choices=ROLE_CHOICES, default=ROLE_QUERY)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["song", "recipient"], name="unique_share_per_recipient")]

    def __str__(self) -> str:
        return f"{self.song} → {self.recipient}"
