import base64
import io
import os
from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from vault.models import Song, Visibility
from vault.storage import get_blob_storage
from vault.tests.helpers import TempLocalStorageMixin

PUBLIC_KEY = base64.b64encode(b"k" * 32).decode()


class CommunityApiTests(TempLocalStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.ana = User.objects.create_user(username="ana", email="ana@example.com", password="x")
        self.beto = User.objects.create_user(username="beto", email="beto@example.com", password="x")
        self.client.force_authenticate(self.ana)

    def make_song(self, owner=None, title="Starlight", artist="", public=True, size=1000, published_at=None):
        extra = {}
        if public:
            extra = {
                "visibility": Visibility.PUBLIC,
                "public_file_key": PUBLIC_KEY,
                "published_at": published_at or timezone.now(),
            }
        return Song.objects.create(
            owner=owner or self.beto, title=title, artist=artist, duration=10, size=size,
            file_iv="aXY=", wrapped_file_key="a2V5", wrapped_key_iv="aXY=", **extra,
        )

    def listed(self, **params):
        response = self.client.get(reverse("community-songs"), params)
        self.assertEqual(response.status_code, 200)
        return response.json()["results"]

    def titles(self, **params):
        return [s["title"] for s in self.listed(**params)]

    def detail_url(self, song):
        return reverse("community-song-detail", args=[song.uuid])

    def blob_url(self, song):
        return reverse("community-song-blob", args=[song.uuid])

    # --- Autenticación ---

    def test_requires_authentication(self):
        song = self.make_song()
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse("community-songs")).status_code, 401)
        self.assertEqual(self.client.get(self.detail_url(song)).status_code, 401)
        self.assertEqual(self.client.get(self.blob_url(song)).status_code, 401)

    # --- Listado ---

    def test_community_lists_only_public_songs_of_other_users(self):
        self.make_song(title="De Beto")
        self.make_song(title="Privada de Beto", public=False)
        self.make_song(owner=self.ana, title="Mía pública")

        self.assertEqual(self.titles(), ["De Beto"])
        self.assertEqual(self.titles(scope="community"), ["De Beto"])

    def test_mine_lists_only_my_public_songs(self):
        self.make_song(title="De Beto")
        self.make_song(owner=self.ana, title="Mía pública")
        self.make_song(owner=self.ana, title="Mía privada", public=False)

        self.assertEqual(self.titles(scope="mine"), ["Mía pública"])

    def test_invalid_scope_is_400(self):
        response = self.client.get(reverse("community-songs"), {"scope": "todas"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "invalid_scope")

    def test_newest_published_first(self):
        now = timezone.now()
        self.make_song(title="Vieja", published_at=now - timedelta(days=3))
        self.make_song(title="Nueva", published_at=now)
        self.make_song(title="Media", published_at=now - timedelta(days=1))

        self.assertEqual(self.titles(), ["Nueva", "Media", "Vieja"])

    def test_search_matches_title_artist_and_owner(self):
        self.make_song(title="Nocturno", artist="Chopin")
        self.make_song(title="Otra", artist="Aethel")
        carla = User.objects.create_user(username="carla", email="carla@example.com", password="x")
        self.make_song(owner=carla, title="Tercera")

        self.assertEqual(self.titles(q="noct"), ["Nocturno"])
        self.assertEqual(self.titles(q="aethel"), ["Otra"])
        self.assertEqual(self.titles(q="carla"), ["Tercera"])

    def test_list_is_paginated(self):
        for i in range(3):
            self.make_song(title=f"Canción {i}")

        body = self.client.get(reverse("community-songs"), {"page_size": 2}).json()

        self.assertEqual(body["count"], 3)
        self.assertEqual(len(body["results"]), 2)
        self.assertIsNotNone(body["next"])

    def test_song_shape_includes_public_key_owner_and_is_mine_only(self):
        self.make_song(title="De Beto")
        mine = self.make_song(owner=self.ana, title="Mía")

        by_title = {s["title"]: s for s in self.listed(scope="community")}
        self.assertEqual(
            set(by_title["De Beto"]),
            {"id", "title", "artist", "duration", "size", "published_at", "file_iv", "public_file_key", "owner", "is_mine"},
        )
        self.assertEqual(by_title["De Beto"]["public_file_key"], PUBLIC_KEY)
        self.assertEqual(by_title["De Beto"]["owner"], "beto")
        self.assertFalse(by_title["De Beto"]["is_mine"])
        self.assertTrue(self.listed(scope="mine")[0]["is_mine"])
        self.assertEqual(self.listed(scope="mine")[0]["id"], str(mine.uuid))

    def test_a_blocked_owner_disappears_from_the_community(self):
        self.make_song(title="De Beto")
        self.beto.is_active = False
        self.beto.save()

        self.assertEqual(self.titles(), [])

    def test_unpublished_songs_disappear(self):
        song = self.make_song(title="De Beto")
        self.assertEqual(self.titles(), ["De Beto"])

        song.visibility = Visibility.PRIVATE
        song.public_file_key = ""
        song.published_at = None
        song.save()

        self.assertEqual(self.titles(), [])

    # --- Detalle ---

    def test_detail_of_a_public_song(self):
        song = self.make_song()
        response = self.client.get(self.detail_url(song))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], str(song.uuid))
        self.assertEqual(response.json()["public_file_key"], PUBLIC_KEY)

    def test_detail_of_a_private_or_unknown_song_is_404(self):
        private = self.make_song(public=False)
        gone = self.make_song()
        url = self.detail_url(gone)
        gone.delete()

        self.assertEqual(self.client.get(self.detail_url(private)).status_code, 404)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get(self.detail_url(private)).json()["code"], "not_found")

    def test_private_song_never_leaks_its_key_even_to_its_owner_here(self):
        mine = self.make_song(owner=self.ana, public=False)
        self.assertEqual(self.client.get(self.detail_url(mine)).status_code, 404)

    def test_numeric_ids_are_not_accepted(self):
        song = self.make_song()
        self.assertEqual(self.client.get(f"/api/community/songs/{song.pk}").status_code, 404)

    # --- Proxy del blob ---

    def put_blob(self, song, ciphertext):
        get_blob_storage().put(song.storage_key, io.BytesIO(ciphertext), len(ciphertext))

    def test_any_user_gets_the_exact_ciphertext_of_a_public_song(self):
        ciphertext = os.urandom(200_000)
        song = self.make_song(size=len(ciphertext))
        self.put_blob(song, ciphertext)

        response = self.client.get(self.blob_url(song))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), ciphertext)
        self.assertEqual(response["Content-Type"], "application/octet-stream")
        self.assertEqual(response["Content-Length"], str(len(ciphertext)))
        self.assertEqual(response["Cache-Control"], "private, no-store")

    def test_blob_of_a_private_song_is_404_for_everyone(self):
        ciphertext = os.urandom(1000)
        song = self.make_song(public=False, size=len(ciphertext))
        self.put_blob(song, ciphertext)

        self.assertEqual(self.client.get(self.blob_url(song)).status_code, 404)
        self.client.force_authenticate(self.beto)  # ni siquiera su dueño, por esta ruta
        self.assertEqual(self.client.get(self.blob_url(song)).status_code, 404)

    def test_blob_stops_being_served_after_unpublishing(self):
        ciphertext = os.urandom(1000)
        song = self.make_song(size=len(ciphertext))
        self.put_blob(song, ciphertext)
        self.assertEqual(self.client.get(self.blob_url(song)).status_code, 200)

        song.visibility = Visibility.PRIVATE
        song.public_file_key = ""
        song.published_at = None
        song.save()

        self.assertEqual(self.client.get(self.blob_url(song)).status_code, 404)

    def test_blob_of_a_blocked_owner_is_404(self):
        ciphertext = os.urandom(1000)
        song = self.make_song(size=len(ciphertext))
        self.put_blob(song, ciphertext)
        self.beto.is_active = False
        self.beto.save()

        self.assertEqual(self.client.get(self.blob_url(song)).status_code, 404)

    def test_missing_blob_is_reported_and_logged(self):
        song = self.make_song()  # fila sin blob en el almacenamiento

        with self.assertLogs("vault.views", level="ERROR"):
            response = self.client.get(self.blob_url(song))

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["code"], "blob_missing")