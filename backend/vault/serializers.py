from rest_framework import serializers

from accounts.crypto_fields import IV_BYTES, WRAPPED_KEY_BYTES, Base64BytesField

from .models import ListeningHistory, Song

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
    # Anotaciones de `services.own_songs`; una canción recién subida aún no es favorita.
    is_favorite = serializers.SerializerMethodField()
    favorited_at = serializers.SerializerMethodField()

    def get_is_favorite(self, song) -> bool:
        return bool(getattr(song, "is_favorite", False))

    def get_favorited_at(self, song):
        value = getattr(song, "favorited_at", None)
        return serializers.DateTimeField().to_representation(value) if value else None

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
            "is_favorite",
            "favorited_at",
        ]
        read_only_fields = fields


class HistoryEntrySerializer(serializers.ModelSerializer):
    """Una reproducción con su canción completa (para poder reproducirla de nuevo)."""

    song = serializers.SerializerMethodField()

    def get_song(self, entry: ListeningHistory):
        song = entry.song
        # Anotaciones de `services.history_for` para el corazón de favoritos.
        song.is_favorite = getattr(entry, "song_is_favorite", False)
        song.favorited_at = getattr(entry, "song_favorited_at", None)
        return SongSerializer(song).data

    class Meta:
        model = ListeningHistory
        fields = ["id", "played_at", "song"]
        read_only_fields = fields


# --- Estadísticas personales (día 19) -------------------------------------------------


class TopSongSerializer(serializers.Serializer):
    song = SongSerializer()
    plays = serializers.IntegerField()


class TopArtistSerializer(serializers.Serializer):
    artist = serializers.CharField(allow_blank=True)  # "" = canciones sin artista
    plays = serializers.IntegerField()
    listening_seconds = serializers.IntegerField()
    songs = serializers.IntegerField()


class DailyPlaysSerializer(serializers.Serializer):
    date = serializers.DateField()
    plays = serializers.IntegerField()


class ListeningStatsSerializer(serializers.Serializer):
    period = serializers.CharField()
    since = serializers.DateField(allow_null=True)
    total_plays = serializers.IntegerField()
    listening_seconds = serializers.IntegerField()
    distinct_songs = serializers.IntegerField()
    top_songs = TopSongSerializer(many=True)
    top_artists = TopArtistSerializer(many=True)
    daily = DailyPlaysSerializer(many=True)
