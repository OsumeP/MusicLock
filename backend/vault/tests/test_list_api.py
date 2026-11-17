from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from vault.models import Song


class ListSongsApiTests(APITestCase):
    def setUp(self):
        self.ana = User.objects.create_user(username="ana", email="ana@example.com", password="x")
        self.beto = User.objects.create_user(username="beto", email="beto@example.com", password="x")
        self.client.force_authenticate(self.ana)

    def make_song(self, owner, title, artist="", minutes_ago=0):
        song = Song.objects.create(
            owner=owner,
            title=title,
            artist=artist,
            duration=200,
            size=1000,
            file_iv="aXY=",
            wrapped_file_key="a2V5",
            wrapped_key_iv="aXY=",
        )
        Song.objects.filter(pk=song.pk).update(creation_date=timezone.now() - timedelta(minutes=minutes_ago))
        return song

    def list(self, **params):
        return self.client.get(reverse("songs"), params)

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.list().status_code, 401)

    def test_lists_only_own_songs_newest_first_with_key_material(self):
        old = self.make_song(self.ana, "Vieja", minutes_ago=10)
        new = self.make_song(self.ana, "Nueva", minutes_ago=1)
        self.make_song(self.beto, "Secreta de Beto")

        body = self.list().json()

        self.assertEqual(body["count"], 2)
        self.assertEqual([s["id"] for s in body["results"]], [str(new.uuid), str(old.uuid)])
        self.assertEqual(
            set(body["results"][0]),
            {
                "id", "title", "artist", "duration", "size", "creation_date",
                "file_iv", "wrapped_file_key", "wrapped_key_iv", "is_favorite", "favorited_at",
            },
        )
        self.assertNotIn("Secreta de Beto", str(body))

    def test_search_matches_title_or_artist_case_insensitively(self):
        self.make_song(self.ana, "Starlight Odyssey", "Aethel Audio")
        self.make_song(self.ana, "Nocturne", "Chopin")
        self.make_song(self.beto, "Starlight (de Beto)")

        titles = lambda q: sorted(s["title"] for s in self.list(q=q).json()["results"])

        self.assertEqual(titles("starlight"), ["Starlight Odyssey"])
        self.assertEqual(titles("CHOPIN"), ["Nocturne"])
        self.assertEqual(titles("   "), ["Nocturne", "Starlight Odyssey"])
        self.assertEqual(titles("no existe"), [])

    def test_paginates(self):
        for i in range(25):
            self.make_song(self.ana, f"Canción {i:02d}", minutes_ago=i)

        first = self.list().json()
        second = self.list(page=2).json()
        small = self.list(page_size=5).json()

        self.assertEqual((first["count"], len(first["results"])), (25, 20))
        self.assertIsNotNone(first["next"])
        self.assertEqual(len(second["results"]), 5)
        self.assertIsNone(second["next"])
        self.assertEqual(len(small["results"]), 5)

    def test_page_out_of_range_is_404(self):
        self.assertEqual(self.list(page=3).status_code, 404)
