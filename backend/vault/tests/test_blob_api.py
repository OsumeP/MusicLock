import io
import os
import uuid
from unittest import mock

from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import User
from vault.models import Song
from vault.storage import get_blob_storage
from vault.tests.helpers import TempLocalStorageMixin


class SongBlobApiTests(TempLocalStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.ana = User.objects.create_user(username="ana", email="ana@example.com", password="x")
        self.beto = User.objects.create_user(username="beto", email="beto@example.com", password="x")
        self.ciphertext = os.urandom(200_000)  # > un bloque de streaming
        self.song = Song.objects.create(
            owner=self.ana,
            title="Starlight",
            duration=10,
            size=len(self.ciphertext),
            file_iv="aXY=",
            wrapped_file_key="a2V5",
            wrapped_key_iv="aXY=",
        )
        get_blob_storage().put(self.song.storage_key, io.BytesIO(self.ciphertext), len(self.ciphertext))
        self.client.force_authenticate(self.ana)

    def download(self, song_id=None):
        return self.client.get(reverse("song-blob", args=[song_id or self.song.uuid]))

    def test_owner_gets_the_exact_ciphertext_with_private_headers(self):
        response = self.download()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), self.ciphertext)
        self.assertEqual(response["Content-Type"], "application/octet-stream")
        self.assertEqual(response["Content-Length"], str(len(self.ciphertext)))
        self.assertEqual(response["Cache-Control"], "private, no-store")

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.download().status_code, 401)

    def test_another_user_gets_404_not_403(self):
        # Mismo resultado que para una canción inexistente: no se revela que existe.
        self.client.force_authenticate(self.beto)

        response = self.download()

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["code"], "not_found")
        self.assertEqual(response.json(), self.download(uuid.uuid4()).json())

    def test_missing_blob_is_reported_and_logged(self):
        get_blob_storage().delete(self.song.storage_key)

        with self.assertLogs("vault.views", level="ERROR"):
            response = self.download()

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["code"], "blob_missing")

    def test_storage_down_is_503(self):
        with mock.patch("vault.storage.LocalBlobStorage.open", side_effect=OSError("MinIO caído")), self.assertLogs(
            "vault.views", level="ERROR"
        ):
            response = self.download()

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "storage_unavailable")

    def test_numeric_ids_are_not_accepted(self):
        response = self.client.get(f"/api/songs/{self.song.pk}/blob")
        self.assertEqual(response.status_code, 404)
