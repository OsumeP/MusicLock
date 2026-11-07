"""
Estadísticas personales (día 19): top 7 y 30 días (Estadísticas FR-02, FR-03),
artistas más escuchados (FR-04) y reproducciones por canción (FR-05).
"""

from datetime import datetime, timedelta
from unittest import mock

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from vault.models import ListeningHistory, Song

# "Ahora" fijo: viernes 2026-11-06 a las 10:00 en Bogotá.
NOW = timezone.make_aware(datetime(2026, 11, 6, 10, 0), timezone.get_fixed_timezone(-300))


class StatsTests(APITestCase):
    def setUp(self):
        self.ana = User.objects.create_user(username="ana", email="ana@example.com", password="x")
        self.beto = User.objects.create_user(username="beto", email="beto@example.com", password="x")
        self.client.force_authenticate(self.ana)
        self.aurora = self.song("Aurora", "Aethel", 100)
        self.brisa = self.song("Brisa", "Aethel", 50)
        self.cierzo = self.song("Cierzo", "", 200)
        patcher = mock.patch("django.utils.timezone.now", return_value=NOW)
        patcher.start()
        self.addCleanup(patcher.stop)

    def song(self, title, artist, duration, owner=None):
        return Song.objects.create(
            owner=owner or self.ana, title=title, artist=artist, duration=duration, size=1000,
            file_iv="aXY=", wrapped_file_key="a2V5", wrapped_key_iv="aXY=",
        )

    def play(self, song, days_ago=0, hours_ago=0, user=None):
        ListeningHistory.objects.create(user=user or self.ana, song=song, played_at=NOW - timedelta(days=days_ago, hours=hours_ago))

    def stats(self, period=None):
        params = {"period": period} if period else {}
        return self.client.get(reverse("stats"), params)

    def test_empty_history(self):
        body = self.stats().json()

        self.assertEqual((body["period"], body["total_plays"], body["listening_seconds"], body["distinct_songs"]), ("7d", 0, 0, 0))
        self.assertEqual((body["top_songs"], body["top_artists"]), ([], []))
        self.assertEqual(len(body["daily"]), 7)
        self.assertEqual(body["since"], "2026-10-31")
        self.assertEqual(body["daily"][-1], {"date": "2026-11-06", "plays": 0})

    def test_totals_and_top_songs_in_the_last_7_days(self):
        for _ in range(3):
            self.play(self.brisa, days_ago=1)
        self.play(self.aurora, days_ago=2)
        self.play(self.aurora)
        self.play(self.cierzo, days_ago=10)  # fuera de los 7 días

        body = self.stats("7d").json()

        self.assertEqual(body["total_plays"], 5)
        self.assertEqual(body["distinct_songs"], 2)
        self.assertEqual(body["listening_seconds"], 3 * 50 + 2 * 100)
        self.assertEqual([(t["song"]["title"], t["plays"]) for t in body["top_songs"]], [("Brisa", 3), ("Aurora", 2)])
        self.assertIn("is_favorite", body["top_songs"][0]["song"])  # reproducible desde la pantalla

    def test_periods_are_calendar_days_and_daily_matches_the_total(self):
        self.play(self.aurora, days_ago=6, hours_ago=-13)  # 2026-10-31 23:00, primer día del periodo
        self.play(self.aurora, days_ago=6, hours_ago=11)  # 2026-10-30 23:00, fuera
        self.play(self.brisa, hours_ago=9)  # hoy a la 01:00

        week = self.stats("7d").json()
        month = self.stats("30d").json()

        self.assertEqual(week["total_plays"], 2)
        self.assertEqual(sum(d["plays"] for d in week["daily"]), week["total_plays"])
        self.assertEqual(week["daily"][0], {"date": "2026-10-31", "plays": 1})
        self.assertEqual(week["daily"][-1], {"date": "2026-11-06", "plays": 1})
        self.assertEqual((month["total_plays"], len(month["daily"]), month["since"]), (3, 30, "2026-10-08"))
        self.assertEqual(sum(d["plays"] for d in month["daily"]), 3)

    def test_ties_are_broken_by_the_most_recent_play(self):
        self.play(self.aurora, days_ago=3)
        self.play(self.brisa, days_ago=1)

        titles = [t["song"]["title"] for t in self.stats().json()["top_songs"]]

        self.assertEqual(titles, ["Brisa", "Aurora"])

    def test_top_artists_with_listening_time_and_songs(self):
        self.play(self.aurora)
        self.play(self.aurora)
        self.play(self.brisa)
        self.play(self.cierzo)

        artists = self.stats().json()["top_artists"]

        self.assertEqual(artists[0], {"artist": "Aethel", "plays": 3, "listening_seconds": 250, "songs": 2})
        self.assertEqual(artists[1], {"artist": "", "plays": 1, "listening_seconds": 200, "songs": 1})

    def test_on_a_tie_songs_without_artist_go_last(self):
        self.play(self.cierzo)  # sin artista
        self.play(self.aurora)

        artists = [a["artist"] for a in self.stats().json()["top_artists"]]

        self.assertEqual(artists, ["Aethel", ""])

    def test_all_time_gives_total_plays_per_song_and_no_daily(self):
        self.play(self.cierzo, days_ago=400)
        self.play(self.cierzo, days_ago=40)
        self.play(self.aurora)

        body = self.stats("all").json()

        self.assertEqual((body["since"], body["daily"]), (None, []))
        self.assertEqual([(t["song"]["title"], t["plays"]) for t in body["top_songs"]], [("Cierzo", 2), ("Aurora", 1)])

    def test_only_my_own_history(self):
        betos = self.song("De Beto", "X", 10, owner=self.beto)
        self.play(betos, user=self.beto)
        self.play(self.aurora, user=self.beto)  # imposible en la API, pero no debe contar para nadie

        self.assertEqual(self.stats().json()["total_plays"], 0)
        self.client.force_authenticate(self.beto)
        self.assertEqual(self.stats().json()["total_plays"], 1)

    def test_deleted_songs_disappear_from_the_stats(self):
        self.play(self.aurora)
        self.aurora.delete()
        self.assertEqual(self.stats().json()["total_plays"], 0)

    def test_invalid_period_and_authentication(self):
        response = self.stats("1y")
        self.assertEqual((response.status_code, response.json()["code"]), (400, "invalid_period"))
        self.client.force_authenticate(None)
        self.assertEqual(self.stats().status_code, 401)
