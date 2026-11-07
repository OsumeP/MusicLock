from django.urls import path

from . import views

urlpatterns = [
    path("users/lookup", views.RecipientLookupView.as_view(), name="user-lookup"),
    path("songs/<uuid:song_id>/shares", views.SongSharesView.as_view(), name="song-shares"),
    path("songs/<uuid:song_id>/shares/<str:username>", views.SongShareView.as_view(), name="song-share"),
]
