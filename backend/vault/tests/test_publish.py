import base64
import os

from django.db import IntegrityError, transaction
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import User
from vault.models import Song, Visibility
from vault.serializers import SongUploadSerializer
from vault.tests.helpers import TempLocalStorageMixin


def new_key() -> str:
    return base64.b64encode(os.urandom(32)).decode()


class PublishApiTests(TempLocalStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.ana = User.objects.create_user(username="ana", email="ana@example.com", password="x")
        self.beto = User.objects.create_user(username="beto", email="beto@example.com", password="x")
        self.song = self.make_song()
        self.client.force_authenticate(self.ana)

    def make_song(self, owner=None, title="Starlight"):
        return Song.objects.create(
            owner=owner or self.ana, title=title, duration=10, size=1000,
            file_iv="aXY=", wrapped_file_key="a2V5", wrapped_key_iv="aXY=",
        )

    def url(self, song=None):
        return reverse("song-publish", args=[(song or self.song).uuid])

    def publish(self, key=None, song=None):
        return self.client.put(self.url(song), {"file_key": key or new_key()}, format="json")

    # --- Estado inicial (BR-19) ---

    def test_new_song_is_private_without_public_key(self):
        self.assertEqual(self.song.visibility, Visibility.PRIVATE)
        self.assertEqual(self.song.public_file_key, "")
        self.assertIsNone(self.song.published_at)

    def test_upload_serializer_does_not_accept_visibility(self):
        # El cliente no puede subir una canción ya pública: el campo ni existe en la entrada.
        self.assertNotIn("visibility", SongUploadSerializer().fields)
        self.assertNotIn("public_file_key", SongUploadSerializer().fields)

    # --- Publicar ---

    def test_publish_makes_the_song_public(self):
        key = new_key()

        response = self.publish(key)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], str(self.song.uuid))
        self.assertEqual(response.json()["visibility"], "public")
        self.assertIsNotNone(response.json()["published_at"])
        self.song.refresh_from_db()
        self.assertEqual(self.song.visibility, Visibility.PUBLIC)
        self.assertEqual(self.song.public_file_key, key)

    def test_the_response_never_exposes_the_public_key(self):
        key = new_key()
        response = self.publish(key)
        self.assertNotIn("public_file_key", response.json())
        self.assertNotIn(key, response.content.decode())

    def test_publish_is_idempotent_and_keeps_the_first_key_and_date(self):
        first = new_key()
        self.publish(first)
        self.song.refresh_from_db()
        published_at = self.song.published_at

        self.assertEqual(self.publish(new_key()).status_code, 200)

        self.song.refresh_from_db()
        self.assertEqual(self.song.public_file_key, first)
        self.assertEqual(self.song.published_at, published_at)

    def test_invalid_keys_are_rejected_and_the_song_stays_private(self):
        invalid = ["no-es-base64!!", base64.b64encode(b"corta").decode(), base64.b64encode(os.urandom(48)).decode(), ""]
        for bad in invalid:
            with self.subTest(key=bad):
                response = self.client.put(self.url(), {"file_key": bad}, format="json")
                self.assertEqual(response.status_code, 400)
        self.song.refresh_from_db()
        self.assertEqual(self.song.visibility, Visibility.PRIVATE)
        self.assertEqual(self.song.public_file_key, "")

    def test_missing_key_is_rejected(self):
        self.assertEqual(self.client.put(self.url(), {}, format="json").status_code, 400)

    # --- Despublicar ---

    def test_unpublish_clears_the_key_and_the_date(self):
        self.publish()

        response = self.client.delete(self.url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["visibility"], "private")
        self.assertIsNone(response.json()["published_at"])
        self.song.refresh_from_db()
        self.assertEqual(self.song.visibility, Visibility.PRIVATE)
        self.assertEqual(self.song.public_file_key, "")
        self.assertIsNone(self.song.published_at)

    def test_unpublish_is_idempotent(self):
        for _ in range(2):
            self.assertEqual(self.client.delete(self.url()).status_code, 200)
        self.song.refresh_from_db()
        self.assertEqual(self.song.visibility, Visibility.PRIVATE)

    def test_can_publish_again_after_unpublishing_with_a_new_key(self):
        self.publish()
        self.client.delete(self.url())
        second = new_key()

        self.assertEqual(self.publish(second).status_code, 200)

        self.song.refresh_from_db()
        self.assertEqual(self.song.public_file_key, second)

    # --- Permisos ---

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.publish().status_code, 401)
        self.assertEqual(self.client.delete(self.url()).status_code, 401)

    def test_another_user_gets_404_and_cannot_change_visibility(self):
        self.client.force_authenticate(self.beto)

        self.assertEqual(self.publish().status_code, 404)
        self.assertEqual(self.client.delete(self.url()).status_code, 404)

        self.song.refresh_from_db()
        self.assertEqual(self.song.visibility, Visibility.PRIVATE)
        self.assertEqual(self.song.public_file_key, "")

    def test_another_user_cannot_unpublish_a_public_song(self):
        self.publish()
        self.client.force_authenticate(self.beto)

        self.assertEqual(self.client.delete(self.url()).status_code, 404)

        self.song.refresh_from_db()
        self.assertEqual(self.song.visibility, Visibility.PUBLIC)

    def test_unknown_song_is_404(self):
        song = self.make_song()
        url = self.url(song)
        song.delete()
        self.assertEqual(self.client.put(url, {"file_key": new_key()}, format="json").status_code, 404)

    # --- Interacción con el resto de la API ---

    def test_list_shows_the_visibility_of_each_song(self):
        self.make_song(title="Privada")
        self.publish()

        results = self.client.get(reverse("songs")).json()["results"]

        self.assertEqual({s["title"]: s["visibility"] for s in results}, {"Starlight": "public", "Privada": "private"})

    def test_patch_response_keeps_the_visibility(self):
        self.publish()
        response = self.client.patch(reverse("song-detail", args=[self.song.uuid]), {"title": "Nuevo"}, format="json")
        self.assertEqual(response.json()["visibility"], "public")

    def test_publishing_does_not_touch_the_blob_or_the_quota(self):
        before = (self.song.storage_key, self.song.size, self.song.wrapped_file_key)
        self.publish()
        self.song.refresh_from_db()
        self.assertEqual((self.song.storage_key, self.song.size, self.song.wrapped_file_key), before)

    # --- Restricción de la base de datos ---

    def test_database_rejects_a_public_song_without_key_or_date(self):
        self.song.visibility = Visibility.PUBLIC
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.song.save()

    def test_database_rejects_a_public_song_with_key_but_no_date(self):
        self.song.visibility = Visibility.PUBLIC
        self.song.public_file_key = new_key()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.song.save()