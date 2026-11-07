from django.urls import path

from . import views

urlpatterns = [
    path("songs", views.SongListCreateView.as_view(), name="songs"),
    path("songs/<uuid:song_id>/blob", views.SongBlobView.as_view(), name="song-blob"),
]
