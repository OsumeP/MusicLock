"""
Modelos de la bóveda.

Una `Song` guarda solo metadatos en claro (título, artista, duración; decisión
D10) y el material necesario para que el navegador del dueño descifre el audio.
El audio cifrado vive en el almacenamiento de blobs (MinIO) bajo `storage_key`.
"""

import uuid

from django.conf import settings
from django.db import models


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
