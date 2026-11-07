from rest_framework import serializers

from accounts.crypto_fields import Base64BytesField

from .models import SongShare

# RSA-OAEP con una clave de 3072 bits produce siempre 384 bytes.
SHARED_FILE_KEY_BYTES = 3072 // 8


class RecipientSerializer(serializers.Serializer):
    """Lo que el propietario necesita para compartir: el usuario y su clave pública."""

    username = serializers.CharField()
    public_key = serializers.CharField()


class ShareSerializer(serializers.ModelSerializer):
    """Un acceso a una canción propia. Del destinatario solo se muestra el usuario."""

    recipient = serializers.CharField(source="recipient.username")

    class Meta:
        model = SongShare
        fields = ["recipient", "role", "created_at"]


class ShareWriteSerializer(serializers.Serializer):
    wrapped_file_key = Base64BytesField(SHARED_FILE_KEY_BYTES)
    role = serializers.ChoiceField(choices=SongShare.ROLE_CHOICES, default=SongShare.ROLE_QUERY)
