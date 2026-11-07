"""
Modelos de la bóveda.

Una `Song` guarda solo metadatos en claro (título, artista, duración; decisión
D10) y el material necesario para que el navegador del dueño descifre el audio.
El audio cifrado vive en el almacenamiento de blobs (MinIO) bajo `storage_key`.
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


def build_storage_key(owner_id: int, song_uuid: uuid.UUID) -> str:
    """Nombre del objeto en el almacenamiento. Nunca incluye títulos ni nombres de archivo."""
    return f"users/{owner_id}/songs/{song_uuid}.bin"


class Song(models.Model):
    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="songs")

    # Metadatos en claro (D10)
    title = models.CharField(max_length=150)
    artist = models.CharField(max_length=150, blank=True)
    duration = models.PositiveIntegerField(help_text="Duración en segundos.")
    size = models.BigIntegerField(help_text="Tamaño en bytes del archivo CIFRADO (cuenta para la cuota).")

    # Ubicación del blob cifrado
    storage_key = models.CharField(max_length=255, unique=True, editable=False)

    # Material criptográfico en base64 (PlanMVP §4.2)
    file_iv = models.CharField(max_length=32, help_text="IV de AES-GCM con el que se cifró el audio.")
    wrapped_file_key = models.CharField(max_length=128, help_text="File Key envuelta con la Master Key.")
    wrapped_key_iv = models.CharField(max_length=32, help_text="IV usado al envolver la File Key.")

    # Reservados para el backlog (contenido público + ACRCloud). BR-19: privado por defecto.
    is_public = models.BooleanField(default=False)
    copyright = models.CharField(max_length=255, blank=True)

    creation_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-creation_date"]
        indexes = [models.Index(fields=["owner", "-creation_date"])]

    def __str__(self) -> str:
        return f"{self.title} — {self.artist}" if self.artist else self.title

    def save(self, *args, **kwargs):
        if not self.storage_key:
            self.storage_key = build_storage_key(self.owner_id, self.uuid)
        super().save(*args, **kwargs)


class Favorite(models.Model):
    """
    Canción marcada como favorita (Interfaz FR-02, Accesos FR-13). En el MVP+ un
    usuario solo puede marcar canciones propias; al borrar la canción o el
    usuario, la marca desaparece en cascada.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="favorites")
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name="favorites")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "song"], name="unique_favorite_per_user")]
        indexes = [models.Index(fields=["user", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.user} ♥ {self.song}"


class ListeningHistory(models.Model):
    """
    Una reproducción: usuario, canción y momento (Estadísticas FR-01). Alimenta
    "Reproducido recientemente" (Interfaz FR-05, Estadísticas FR-06) y, más
    adelante, las estadísticas y tendencias.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="listening_history")
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name="plays")
    played_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-played_at", "-id"]
        indexes = [models.Index(fields=["user", "-played_at"])]
        verbose_name_plural = "listening history"

    def __str__(self) -> str:
        return f"{self.user} ▶ {self.song} ({self.played_at:%Y-%m-%d %H:%M})"
