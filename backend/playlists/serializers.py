from rest_framework import serializers

from vault.serializers import SongSerializer

from .models import Playlist


class PlaylistSerializer(serializers.ModelSerializer):
    """
    Resumen de una playlist (anotaciones de `services.playlists_for`). El
    identificador expuesto es el UUID. `contains_song` solo aparece si se
    pidió `?song=`.
    """

    id = serializers.UUIDField(source="uuid", read_only=True)
    song_count = serializers.IntegerField(read_only=True)
    total_size = serializers.IntegerField(read_only=True)
    total_duration = serializers.IntegerField(read_only=True)

    class Meta:
        model = Playlist
        fields = ["id", "name", "description", "song_count", "total_size", "total_duration", "created_at", "updated_at"]
        read_only_fields = fields

    def to_representation(self, playlist):
        data = super().to_representation(playlist)
        if hasattr(playlist, "contains_song"):
            data["contains_song"] = playlist.contains_song
        return data


class PlaylistDetailSerializer(PlaylistSerializer):
    """Playlist con sus canciones en orden (`songs` se pasa en el contexto)."""

    songs = serializers.SerializerMethodField()

    class Meta(PlaylistSerializer.Meta):
        fields = PlaylistSerializer.Meta.fields + ["songs"]
        read_only_fields = fields

    def get_songs(self, playlist):
        return SongSerializer(self.context["songs"], many=True).data


class PlaylistWriteSerializer(serializers.Serializer):
    """Crear (nombre obligatorio) o editar (al menos un campo). Los textos se recortan."""

    name = serializers.CharField(max_length=150, trim_whitespace=True)
    description = serializers.CharField(max_length=300, required=False, allow_blank=True, trim_whitespace=True)

    def validate(self, attrs):
        if self.partial and not attrs:
            raise serializers.ValidationError("Envía al menos `name` o `description`.")
        return attrs


class MoveSongSerializer(serializers.Serializer):
    position = serializers.IntegerField(min_value=0)
