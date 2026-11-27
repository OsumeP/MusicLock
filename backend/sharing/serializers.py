from rest_framework import serializers

from accounts.crypto_fields import IV_BYTES, SHARED_FILE_KEY_BYTES, Base64BytesField

from .models import SongShare

class RecipientSerializer(serializers.Serializer):
    """Lo que el propietario necesita para compartir: el usuario y su clave pública."""

    username = serializers.CharField()
    public_key = serializers.CharField()


class ShareSerializer(serializers.ModelSerializer):
    """
    Un acceso a una canción propia. Del destinatario solo se muestra el usuario y su
    clave pública: el navegador del dueño la necesita para volver a envolver la File
    Key cuando la rota (al despublicar).
    """

    recipient = serializers.CharField(source="recipient.username")
    recipient_public_key = serializers.CharField(source="recipient.public_key")

    class Meta:
        model = SongShare
        fields = ["recipient", "recipient_public_key", "role", "created_at"]


class ShareWriteSerializer(serializers.Serializer):
    wrapped_file_key = Base64BytesField(SHARED_FILE_KEY_BYTES)
    role = serializers.ChoiceField(choices=SongShare.ROLE_CHOICES, default=SongShare.ROLE_QUERY)
    # IV del material del que salió la File Key: si se rotó entretanto → 409 `stale_key`.
    file_iv = Base64BytesField(IV_BYTES, required=False)


class SharedSongSerializer(serializers.ModelSerializer):
    """
    Una canción compartida conmigo: los metadatos de la canción + la File Key
    envuelta PARA MÍ (`shared_file_key`). No incluye la clave envuelta del
    propietario ni nada que dependa de su Master Key.
    """

    id = serializers.UUIDField(source="song.uuid")
    title = serializers.CharField(source="song.title")
    artist = serializers.CharField(source="song.artist")
    duration = serializers.IntegerField(source="song.duration")
    size = serializers.IntegerField(source="song.size")
    creation_date = serializers.DateTimeField(source="song.creation_date")
    file_iv = serializers.CharField(source="song.file_iv")
    shared_file_key = serializers.CharField(source="wrapped_file_key")
    owner = serializers.CharField(source="song.owner.username")
    shared_at = serializers.DateTimeField(source="created_at")

    class Meta:
        model = SongShare
        fields = ["id", "title", "artist", "duration", "size", "creation_date", "file_iv", "shared_file_key", "owner", "shared_at", "role"]
