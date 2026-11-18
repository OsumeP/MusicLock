from rest_framework import serializers

from vault.models import Song


class CommunitySongSerializer(serializers.ModelSerializer):
    """
    Canción pública. Incluye `public_file_key` (D11, opción A): es lo que permite a
    cualquier usuario descifrar el blob. Esta llave NUNCA sale de los endpoints de
    Comunidad: `SongSerializer` de la bóveda no la incluye.
    """

    id = serializers.UUIDField(source="uuid", read_only=True)
    owner = serializers.CharField(source="owner.username", read_only=True)
    is_mine = serializers.SerializerMethodField()

    def get_is_mine(self, song) -> bool:
        return song.owner_id == self.context["request"].user.pk

    class Meta:
        model = Song
        fields = [
            "id",
            "title",
            "artist",
            "duration",
            "size",
            "published_at",
            "file_iv",
            "public_file_key",
            "owner",
            "is_mine",
        ]
        read_only_fields = fields