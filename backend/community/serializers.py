from rest_framework import serializers

from vault.models import Song
from .models import MAX_BODY_LENGTH, Comment

class CommunitySongSerializer(serializers.ModelSerializer):
    """
    Canción pública. Incluye `public_file_key` (D11, opción A): es lo que permite a
    cualquier usuario descifrar el blob. Esta llave NUNCA sale de los endpoints de
    Comunidad: `SongSerializer` de la bóveda no la incluye.
    """

    id = serializers.UUIDField(source="uuid", read_only=True)
    owner = serializers.CharField(source="owner.username", read_only=True)
    is_mine = serializers.SerializerMethodField()
    comment_count = serializers.IntegerField(read_only=True)
    is_following = serializers.SerializerMethodField()

    def get_is_following(self, song) -> bool:
        return song.owner_id in self.context.get("followed_ids", ())    

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
            "comment_count",
            "is_following",
        ]
        read_only_fields = fields

class CommentSerializer(serializers.ModelSerializer):
    """
    Comentario para quien lo mira: los eliminados no muestran autor ni texto, y los
    permisos (`can_edit`, `can_delete`) ya vienen calculados para este usuario.
    """

    parent = serializers.IntegerField(source="parent_id", read_only=True)
    author = serializers.SerializerMethodField()
    body = serializers.SerializerMethodField()
    by_song_owner = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    def _me(self) -> int:
        return self.context["request"].user.pk

    def get_author(self, comment):
        return None if comment.is_deleted else comment.author.username

    def get_body(self, comment):
        return "" if comment.is_deleted else comment.body

    def get_by_song_owner(self, comment) -> bool:
        return not comment.is_deleted and comment.author_id == comment.song.owner_id

    def get_is_mine(self, comment) -> bool:
        return not comment.is_deleted and comment.author_id == self._me()

    def get_can_edit(self, comment) -> bool:
        return self.get_is_mine(comment)

    def get_can_delete(self, comment) -> bool:
        return not comment.is_deleted and self._me() in (comment.author_id, comment.song.owner_id)

    class Meta:
        model = Comment
        fields = [
            "id", "parent", "depth", "author", "body", "created_at", "edited_at",
            "is_deleted", "by_song_owner", "is_mine", "can_edit", "can_delete",
        ]
        read_only_fields = fields


class CommentCreateSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=MAX_BODY_LENGTH)  # sin espacios sobrantes y no vacío
    parent = serializers.IntegerField(required=False, allow_null=True, source="parent_id")


class CommentUpdateSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=MAX_BODY_LENGTH)