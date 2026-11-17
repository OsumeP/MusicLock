from django.contrib import admin

from .models import Playlist, PlaylistSong


class PlaylistSongInline(admin.TabularInline):
    model = PlaylistSong
    extra = 0
    readonly_fields = ("song", "position", "added_at")
    can_delete = False


@admin.register(Playlist)
class PlaylistAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "is_public", "updated_at")
    list_filter = ("is_public",)
    search_fields = ("name", "owner__email")
    readonly_fields = ("uuid", "owner", "created_at", "updated_at")
    inlines = [PlaylistSongInline]
