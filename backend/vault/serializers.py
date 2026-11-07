from rest_framework import serializers

from accounts.crypto_fields import IV_BYTES, WRAPPED_KEY_BYTES, Base64BytesField

from .models import Song

# Límite razonable para la duración declarada (6 h): evita valores absurdos.
MAX_DURATION_SECONDS = 6 * 60 * 60


class SongUploadSerializer(serializers.Serializer):
    """Multipart: `file` (audio cifrado) + metadatos en claro (D10) + material de claves."""

    file = serializers.FileField(allow_empty_file=False)
    title = serializers.CharField(max_length=150)
    artist = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    duration = serializers.IntegerField(min_value=1, max_value=MAX_DURATION_SECONDS)
    file_iv = Base64BytesField(IV_BYTES)
    wrapped_file_key = Base64BytesField(WRAPPED_KEY_BYTES)
    wrapped_key_iv = Base64BytesField(IV_BYTES)


class SongUpdateSerializer(serializers.Serializer):
    """PATCH: solo metadatos en claro. El título no puede quedar vacío."""

    title = serializers.CharField(max_length=150, required=False)
    artist = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Envía al menos `title` o `artist`.")
        return attrs


class SongSerializer(serializers.ModelSerializer):
    """Representación pública. El identificador expuesto es el UUID (no se pueden enumerar canciones)."""

    id = serializers.UUIDField(source="uuid", read_only=True)

    class Meta:
        model = Song
        fields = [
            "id",
            "title",
            "artist",
            "duration",
            "size",
            "creation_date",
            "file_iv",
            "wrapped_file_key",
            "wrapped_key_iv",
        ]
        read_only_fields = fields
