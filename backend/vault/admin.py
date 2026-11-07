from django.contrib import admin
from django.template.defaultfilters import filesizeformat

from .models import Favorite, Song


@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    """Solo lectura del material cifrado: el admin no puede descifrar nada (Actor 3)."""

    list_display = ("title", "artist", "owner", "encrypted_size", "is_public", "creation_date")
    list_filter = ("is_public",)
    search_fields = ("title", "artist", "owner__email")
    readonly_fields = (
        "uuid", "owner", "size", "storage_key", "file_iv", "wrapped_file_key", "wrapped_key_iv", "creation_date",
    )

    @admin.display(description="Tamaño cifrado", ordering="size")
    def encrypted_size(self, song):
        return filesizeformat(song.size)


@admin.register(Favorite)
class FavoriteAdmin(admin.ModelAdmin):
    list_display = ("song", "user", "created_at")
    search_fields = ("song__title", "user__email")
    readonly_fields = ("user", "song", "created_at")
