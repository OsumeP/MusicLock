"""
Playlists privadas (MVP+, Accesos FR-08 a FR-12).

Una playlist es una lista **ordenada** de canciones del mismo usuario (tarjeta
CRC "Playlist"). Solo guarda metadatos en claro y referencias: el audio y sus
claves siguen en `Song`, así que añadir una canción no copia ni re-cifra nada.
"""

import uuid

from django.conf import settings
from django.db import models

from vault.models import Song


class Playlist(models.Model):
    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="playlists")
    name = models.CharField(max_length=150)
    description = models.CharField(max_length=300, blank=True)
    # Reservado para el backlog (playlists públicas + ACRCloud, BR-20). Privada por defecto.
    is_public = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    songs = models.ManyToManyField(Song, through="PlaylistSong", related_name="playlists")

    class Meta:
        ordering = ["-updated_at", "-id"]
        indexes = [models.Index(fields=["owner", "-updated_at"])]

    def __str__(self) -> str:
        return self.name


class PlaylistSong(models.Model):
    """Una canción dentro de una playlist, en la posición `position` (0, 1, 2…)."""

    playlist = models.ForeignKey(Playlist, on_delete=models.CASCADE, related_name="entries")
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name="playlist_entries")
    position = models.PositiveIntegerField()
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["position", "id"]
        constraints = [models.UniqueConstraint(fields=["playlist", "song"], name="unique_song_per_playlist")]

    def __str__(self) -> str:
        return f"{self.playlist} #{self.position}: {self.song}"
