from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from vault.models import Favorite, ListeningHistory, Song
from vault.tests.helpers import TempLocalStorageMixin


class HistoryApiTests(TempLocalStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.ana = User.objects.create_user(username="ana", email="ana@example.com", password="x")
        self.beto = User.objects.create_user(username="beto", email="beto@example.com", password="x")
        self.client.force_authenticate(self.ana)

    def make_song(self, owner=None, title="Starlight"):
        return Song.objects.create(
            owner=owner or self.ana, title=title, duration=10, size=1000,
            file_iv="aXY=", wrapped_file_key="a2V5", wrapped_key_iv="aXY=",
        )

    def play(self, song):
        return self.client.post(reverse("song-plays", args=[song.uuid]))

    def played(self, song, minutes_ago, user=None):
        return ListeningHistory.objects.create(
            user=user or self.ana, song=song, played_at=timezone.now() - timedelta(minutes=minutes_ago)
        )

    def history(self, **params):
        return self.client.get(reverse("history"), params)

    def test_requires_authentication(self):
        song = self.make_song()
        self.client.force_authenticate(None)
        self.assertEqual(self.play(song).status_code, 401)
        self.assertEqual(self.history().status_code, 401)
        self.assertEqual(self.client.delete(reverse("history")).status_code, 401)

    def test_recording_a_play_returns_the_entry_with_its_song(self):
        song = self.make_song()

        response = self.play(song)

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(set(body), {"id", "played_at", "song"})
        self.assertEqual(body["song"]["id"], str(song.uuid))
        self.assertIn("wrapped_file_key", body["song"])  # se puede volver a reproducir
        self.assertEqual(ListeningHistory.objects.filter(user=self.ana, song=song).count(), 1)

    def test_every_play_is_recorded(self):
        song = self.make_song()
        self.play(song)
        self.play(song)
        self.assertEqual(ListeningHistory.objects.count(), 2)

    def test_cannot_record_a_play_of_someone_elses_song(self):
        betos = self.make_song(owner=self.beto)
        self.assertEqual(self.play(betos).status_code, 404)
        self.assertFalse(ListeningHistory.objects.exists())

    def test_history_lists_only_own_plays_newest_first(self):
        a, b = self.make_song(title="A"), self.make_song(title="B")
        self.played(a, minutes_ago=30)
        self.played(b, minutes_ago=20)
        self.played(a, minutes_ago=10)
        betos = self.make_song(owner=self.beto, title="De Beto")
        self.played(betos, minutes_ago=1, user=self.beto)

        body = self.history().json()

        self.assertEqual(body["count"], 3)
        self.assertEqual([e["song"]["title"] for e in body["results"]], ["A", "B", "A"])
        self.assertNotIn("De Beto", str(body))

    def test_distinct_keeps_only_the_latest_play_of_each_song(self):
        a, b, c = self.make_song(title="A"), self.make_song(title="B"), self.make_song(title="C")
        self.played(a, minutes_ago=50)
        self.played(c, minutes_ago=40)
        self.played(b, minutes_ago=30)
        latest_a = self.played(a, minutes_ago=10)

        results = self.history(distinct=1).json()["results"]

        self.assertEqual([e["song"]["title"] for e in results], ["A", "B", "C"])
        self.assertEqual(results[0]["id"], latest_a.id)

    def test_history_includes_the_favorite_flag(self):
        song = self.make_song()
        self.played(song, minutes_ago=1)
        Favorite.objects.create(user=self.ana, song=song)

        entry = self.history().json()["results"][0]

        self.assertTrue(entry["song"]["is_favorite"])
        self.assertIsNotNone(entry["song"]["favorited_at"])

    def test_history_is_paginated(self):
        song = self.make_song()
        for minutes in range(25):
            self.played(song, minutes_ago=minutes)

        body = self.history(page_size=10).json()

        self.assertEqual((body["count"], len(body["results"])), (25, 10))
        self.assertIsNotNone(body["next"])

    def test_clear_deletes_only_own_history(self):
        song = self.make_song()
        betos = self.make_song(owner=self.beto)
        self.played(song, minutes_ago=2)
        self.played(song, minutes_ago=1)
        self.played(betos, minutes_ago=1, user=self.beto)

        response = self.client.delete(reverse("history"))

        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.history().json()["count"], 0)
        self.assertEqual(ListeningHistory.objects.filter(user=self.beto).count(), 1)
        self.assertTrue(Song.objects.filter(pk=song.pk).exists())  # solo se borra el historial

    def test_deleting_a_song_removes_its_plays(self):
        song = self.make_song()
        self.play(song)

        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(reverse("song-detail", args=[song.uuid]))

        self.assertFalse(ListeningHistory.objects.exists())
