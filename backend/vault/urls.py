from django.urls import path

from . import views

urlpatterns = [
    path("songs", views.SongListCreateView.as_view(), name="songs"),
]
