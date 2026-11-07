from django.urls import path

from . import views

urlpatterns = [
    path("songs", views.SongListCreateView.as_view(), name="songs"),
    path("songs/<uuid:song_id>", views.SongDetailView.as_view(), name="song-detail"),
    path("songs/<uuid:song_id>/blob", views.SongBlobView.as_view(), name="song-blob"),
    path("songs/<uuid:song_id>/favorite", views.SongFavoriteView.as_view(), name="song-favorite"),
    path("songs/<uuid:song_id>/plays", views.SongPlaysView.as_view(), name="song-plays"),
    path("history", views.HistoryView.as_view(), name="history"),
]
