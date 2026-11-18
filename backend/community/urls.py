from django.urls import path

from . import views

urlpatterns = [
    path("community/songs", views.CommunitySongListView.as_view(), name="community-songs"),
    path("community/songs/<uuid:song_id>", views.CommunitySongDetailView.as_view(), name="community-song-detail"),
    path("community/songs/<uuid:song_id>/blob", views.CommunitySongBlobView.as_view(), name="community-song-blob"),
    path("community/songs/<uuid:song_id>/comments", views.SongCommentsView.as_view(), name="community-song-comments"),
    path("community/comments/<int:comment_id>", views.CommentDetailView.as_view(), name="community-comment-detail"),    
]