from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from vault.models import Favorite, Song
from vault.tests.helpers import TempLocalStorageMixin


class FavoritesApiTests(TempLocalStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.ana = User.objects.create_user(username="ana", email="ana@example.com", password="x")
        self.beto = User.objects.create_user(username="beto", email="beto@example.com", password="x")
        self.client.force_authenticate(self.ana)

    def make_song(self, owner=None, title="Starlight", artist=""):
        return Song.objects.create(
            owner=owner or self.ana, title=title, artist=artist, duration=10, size=1000,
            file_iv="aXY=", wrapped_file_key="a2V5", wrapped_key_iv="aXY=",
        )

    def url(self, song):
        return reverse("song-favorite", args=[song.uuid])

    def listed(self, **params):
        return self.client.get(reverse("songs"), params).json()["results"]

    def test_requires_authentication(self):
        song = self.make_song()
        self.client.force_authenticate(None)
        self.assertEqual(self.client.put(self.url(song)).status_code, 401)

    def test_mark_returns_the_song_as_favorite(self):
        song = self.make_song()

        response = self.client.put(self.url(song))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], str(song.uuid))
        self.assertTrue(response.json()["is_favorite"])
        self.assertIsNotNone(response.json()["favorited_at"])
        self.assertTrue(Favorite.objects.filter(user=self.ana, song=song).exists())

    def test_marking_twice_keeps_a_single_mark(self):
        song = self.make_song()
        self.client.put(self.url(song))
        self.assertEqual(self.client.put(self.url(song)).status_code, 200)
        self.assertEqual(Favorite.objects.filter(song=song).count(), 1)

    def test_unmark_is_idempotent(self):
        song = self.make_song()
        self.client.put(self.url(song))

        for _ in range(2):
            response = self.client.delete(self.url(song))
            self.assertEqual(response.status_code, 200)
            self.assertFalse(response.json()["is_favorite"])
            self.assertIsNone(response.json()["favorited_at"])
        self.assertFalse(Favorite.objects.exists())

    def test_cannot_mark_or_unmark_someone_elses_song(self):
        betos = self.make_song(owner=self.beto, title="Secreta de Beto")
        Favorite.objects.create(user=self.beto, song=betos)

        self.assertEqual(self.client.put(self.url(betos)).status_code, 404)
        self.assertEqual(self.client.delete(self.url(betos)).status_code, 404)
        self.assertEqual(list(Favorite.objects.values_list("user__username", flat=True)), ["beto"])

    def test_unknown_song_is_404(self):
        song = self.make_song()
        song.delete()
        self.assertEqual(self.client.put(self.url(song)).status_code, 404)

    def test_list_flags_favorites_and_another_users_mark_does_not_leak(self):
        fav = self.make_song(title="Favorita")
        self.make_song(title="Normal")
        self.client.put(self.url(fav))

        flags = {s["title"]: s["is_favorite"] for s in self.listed()}

        self.assertEqual(flags, {"Favorita": True, "Normal": False})

    def test_favorites_filter_orders_by_marking_date_and_combines_with_search(self):
        first = self.make_song(title="Primera", artist="Aethel")
        second = self.make_song(title="Segunda", artist="Chopin")
        self.make_song(title="Sin marcar", artist="Aethel")
        Favorite.objects.create(user=self.ana, song=second)
        Favorite.objects.create(user=self.ana, song=first)
        Favorite.objects.filter(song=second).update(created_at=timezone.now() - timedelta(days=1))

        self.assertEqual([s["title"] for s in self.listed(favorites=1)], ["Primera", "Segunda"])
        self.assertEqual([s["title"] for s in self.listed(favorites=1, q="chopin")], ["Segunda"])

    def test_patch_response_keeps_the_favorite_flag(self):
        song = self.make_song()
        self.client.put(self.url(song))

        response = self.client.patch(reverse("song-detail", args=[song.uuid]), {"title": "Nuevo"}, format="json")

        self.assertTrue(response.json()["is_favorite"])

    def test_deleting_the_song_removes_its_mark(self):
        song = self.make_song()
        self.client.put(self.url(song))

        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(reverse("song-detail", args=[song.uuid]))

        self.assertFalse(Favorite.objects.exists())
