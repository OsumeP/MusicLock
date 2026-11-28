"""
Límites de peticiones de Comunidad: `comments` (crear, editar y borrar comentarios)
y `follow` (seguir y dejar de seguir). Solo cuentan las escrituras y por usuario.
"""

import base64
from unittest import mock

from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle

from accounts.models import User
from vault.models import Song, Visibility
from vault.tests.helpers import TempLocalStorageMixin

PUBLIC_KEY = base64.b64encode(b"k" * 32).decode()

# DRF lee las tasas al importar la clase, por eso se parchea la clase y no settings.
RATES = {"auth": "100/min", "comments": "3/min", "follow": "3/min"}


@mock.patch.object(ScopedRateThrottle, "THROTTLE_RATES", RATES)
class CommunityThrottleTests(TempLocalStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.ana = User.objects.create_user(username="ana", email="ana@example.com", password="x")
        self.beto = User.objects.create_user(username="beto", email="beto@example.com", password="x")
        self.carla = User.objects.create_user(username="carla", email="carla@example.com", password="x")
        self.song = Song.objects.create(
            owner=self.beto, title="Starlight", duration=10, size=1000,
            file_iv="aXY=", wrapped_file_key="a2V5", wrapped_key_iv="aXY=",
            visibility=Visibility.PUBLIC, public_file_key=PUBLIC_KEY, published_at=timezone.now(),
        )
        self.client.force_authenticate(self.ana)

    def comments_url(self):
        return reverse("community-song-comments", args=[self.song.uuid])

    def comment(self, body="Hola"):
        return self.client.post(self.comments_url(), {"body": body}, format="json")

    def follow_url(self, username):
        return reverse("community-follow", args=[username])

    # --- Comentarios ---

    def test_creating_comments_is_throttled(self):
        statuses = [self.comment(f"Comentario {i}").status_code for i in range(4)]
        self.assertEqual(statuses, [201, 201, 201, 429])

    def test_reading_comments_does_not_use_the_quota(self):
        for _ in range(5):
            self.assertEqual(self.client.get(self.comments_url()).status_code, 200)
        self.assertEqual(self.comment().status_code, 201)

    def test_reading_is_still_allowed_after_reaching_the_limit(self):
        for i in range(3):
            self.comment(f"Comentario {i}")
        self.assertEqual(self.comment().status_code, 429)
        self.assertEqual(self.client.get(self.comments_url()).status_code, 200)

    def test_editing_and_deleting_share_the_quota_with_creating(self):
        comment_id = self.comment().json()["id"]
        detail = reverse("community-comment-detail", args=[comment_id])
        self.assertEqual(self.client.patch(detail, {"body": "Editado"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(detail).status_code, 204)
        self.assertEqual(self.comment().status_code, 429)

    def test_the_limit_is_per_user(self):
        for i in range(3):
            self.comment(f"Comentario {i}")
        self.assertEqual(self.comment().status_code, 429)

        self.client.force_authenticate(self.carla)
        self.assertEqual(self.comment().status_code, 201)

    # --- Seguir ---

    def test_follow_and_unfollow_share_the_quota(self):
        statuses = [
            self.client.put(self.follow_url("beto")).status_code,
            self.client.delete(self.follow_url("beto")).status_code,
            self.client.put(self.follow_url("carla")).status_code,
            self.client.put(self.follow_url("beto")).status_code,
        ]
        self.assertEqual(statuses, [200, 200, 200, 429])

    def test_probing_unknown_usernames_is_throttled(self):
        """Sin límite, la diferencia entre 404 y 200 permitiría enumerar usuarios."""
        statuses = [self.client.put(self.follow_url(f"nadie{i}")).status_code for i in range(4)]
        self.assertEqual(statuses, [404, 404, 404, 429])

    def test_follow_limit_is_independent_from_comments(self):
        for i in range(3):
            self.comment(f"Comentario {i}")
        self.assertEqual(self.comment().status_code, 429)
        self.assertEqual(self.client.put(self.follow_url("beto")).status_code, 200)

    def test_listing_songs_with_follow_state_is_not_throttled(self):
        for _ in range(5):
            response = self.client.get(reverse("community-songs"), {"scope": "following"})
            self.assertEqual(response.status_code, 200)
