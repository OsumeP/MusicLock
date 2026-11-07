from django.urls import path

from . import views

urlpatterns = [
    path("playlists", views.PlaylistListCreateView.as_view(), name="playlists"),
    path("playlists/<uuid:playlist_id>", views.PlaylistDetailView.as_view(), name="playlist-detail"),
    path("playlists/<uuid:playlist_id>/songs/<uuid:song_id>", views.PlaylistSongView.as_view(), name="playlist-song"),
]
