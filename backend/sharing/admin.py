from django.contrib import admin

from .models import SongShare


@admin.register(SongShare)
class SongShareAdmin(admin.ModelAdmin):
    """Solo lectura: la File Key envuelta es inútil para el servidor."""

    list_display = ("song", "song_owner", "recipient", "role", "created_at")
    list_filter = ("role",)
    search_fields = ("song__title", "recipient__email", "song__owner__email")
    readonly_fields = ("song", "recipient", "wrapped_file_key", "role", "created_at")

    @admin.display(description="Propietario")
    def song_owner(self, obj):
        return obj.song.owner
