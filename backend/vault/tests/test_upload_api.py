import base64
import os
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import MiB, Plan, User
from vault.models import Song
from vault.storage import get_blob_storage
from vault.tests.helpers import TempLocalStorageMixin


def b64(num_bytes: int) -> str:
    return base64.b64encode(os.urandom(num_bytes)).decode()


class UploadSongApiTests(TempLocalStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(
            username="ana", email="ana@example.com", password="x", wrapped_master_key=b64(48)
        )
        self.client.force_authenticate(self.user)

    def payload(self, ciphertext: bytes = b"\x00" * 1024, **overrides):
        data = {
            "file": SimpleUploadedFile("blob.bin", ciphertext, content_type="application/octet-stream"),
            "title": "Starlight Odyssey",
            "artist": "Aethel Audio",
            "duration": 258,
            "file_iv": b64(12),
            "wrapped_file_key": b64(48),
            "wrapped_key_iv": b64(12),
        }
        data.update(overrides)
        return data

    def upload(self, **kwargs):
        return self.client.post(reverse("songs"), self.payload(**kwargs), format="multipart")

    def test_upload_stores_the_exact_ciphertext_and_updates_the_quota(self):
        ciphertext = os.urandom(4096)

        response = self.upload(ciphertext=ciphertext)

        self.assertEqual(response.status_code, 201, response.data)
        song = Song.objects.get()
        body = response.json()
        self.assertEqual(body["id"], str(song.uuid))
        self.assertEqual((body["title"], body["artist"], body["duration"], body["size"]), ("Starlight Odyssey", "Aethel Audio", 258, 4096))
        self.assertEqual(song.storage_key, f"users/{self.user.pk}/songs/{song.uuid}.bin")
        with get_blob_storage().open(song.storage_key) as blob:
            self.assertEqual(blob.read(), ciphertext)
        self.user.refresh_from_db()
        self.assertEqual(self.user.used_storage, 4096)

    def test_response_includes_key_material_needed_to_decrypt(self):
        data = self.payload()
        expected = {k: data[k] for k in ("file_iv", "wrapped_file_key", "wrapped_key_iv")}

        body = self.client.post(reverse("songs"), data, format="multipart").json()

        self.assertEqual({k: body[k] for k in expected}, expected)

    def test_artist_is_optional(self):
        data = self.payload()
        del data["artist"]
        response = self.client.post(reverse("songs"), data, format="multipart")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["artist"], "")

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.upload().status_code, 401)

    def test_rejects_files_bigger_than_the_plan_limit(self):
        response = self.upload(ciphertext=b"\x00" * (20 * MiB + 1))  # BR-10

        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["code"], "file_too_large")
        self.assertEqual(Song.objects.count(), 0)

    def test_premium_users_can_upload_bigger_files(self):
        self.user.active_plan = Plan.objects.get(code=Plan.PREMIUM)
        self.user.save()
        self.assertEqual(self.upload(ciphertext=b"\x00" * (20 * MiB + 1)).status_code, 201)

    def test_rejects_uploads_that_exceed_the_quota(self):
        User.objects.filter(pk=self.user.pk).update(used_storage=500 * MiB - 100)  # BR-09

        response = self.upload(ciphertext=b"\x00" * 101)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "quota_exceeded")
        self.assertEqual(Song.objects.count(), 0)

    def test_rejects_ciphertext_too_small_to_contain_audio(self):
        response = self.upload(ciphertext=b"\x00" * 16)
        self.assertEqual(response.json()["code"], "empty_file")

    def test_validates_metadata_and_key_material(self):
        cases = {
            "title": "",
            "duration": 0,
            "file_iv": b64(16),
            "wrapped_file_key": "no-es-base64!!",
            "wrapped_key_iv": b64(8),
        }
        for field, value in cases.items():
            with self.subTest(field=field):
                response = self.upload(**{field: value})
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json())
        self.assertEqual(Song.objects.count(), 0)

    def test_huge_uploads_are_rejected_by_content_length_before_reading_the_body(self):
        with mock.patch("vault.views.SongUploadSerializer") as serializer:
            response = self.upload(ciphertext=b"\x00" * (21 * MiB))

        self.assertEqual(response.status_code, 413)
        serializer.assert_not_called()

    def test_storage_failure_returns_503_and_creates_nothing(self):
        with mock.patch("vault.storage.LocalBlobStorage.put", side_effect=OSError("disco lleno")), self.assertLogs(
            "vault.views", level="ERROR"
        ):
            response = self.upload()

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "storage_unavailable")
        self.assertEqual(Song.objects.count(), 0)
        self.user.refresh_from_db()
        self.assertEqual(self.user.used_storage, 0)

    def test_database_failure_after_storing_deletes_the_blob(self):
        stored_keys = []
        real_put = get_blob_storage().put

        def spy_put(key, data, size):
            stored_keys.append(key)
            real_put(key, data, size)

        with mock.patch.object(get_blob_storage(), "put", side_effect=spy_put), mock.patch(
            "vault.models.Song.save", side_effect=RuntimeError("BD caída")
        ):
            with self.assertRaises(RuntimeError):
                self.upload()

        self.assertEqual(len(stored_keys), 1)
        self.assertFalse(get_blob_storage().exists(stored_keys[0]))  # sin blobs huérfanos
        self.user.refresh_from_db()
        self.assertEqual(self.user.used_storage, 0)

    def test_two_uploads_accumulate_storage(self):
        self.upload(ciphertext=b"\x01" * 1000)
        self.upload(ciphertext=b"\x02" * 500)
        self.user.refresh_from_db()
        self.assertEqual(self.user.used_storage, 1500)
        self.assertEqual(Song.objects.filter(owner=self.user).count(), 2)
