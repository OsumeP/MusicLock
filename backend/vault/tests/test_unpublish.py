"""
Despublicar ROTA la File Key (POST /api/songs/{id}/unpublish): el navegador sube el
audio cifrado de nuevo con una llave nueva y la vuelve a envolver para su Master
Key y para cada destinatario. La llave que el servidor vio al publicar ya no abre
ningún blob guardado.
"""

import base64
import io
import json
import os
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.tests.test_keypair import fake_public_key
from accounts.models import User
from sharing.models import SongShare
from sharing.tests.test_sharing_api import make_user
from vault.models import Song, Visibility
from vault.storage import get_blob_storage
from vault.tests.helpers import TempLocalStorageMixin


def b64(num_bytes: int) -> str:
    return base64.b64encode(os.urandom(num_bytes)).decode()


SIZE = 1000


class UnpublishApiTests(TempLocalStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.ana = User.objects.create_user(username="ana", email="ana@example.com", password="x")
        self.beto = User.objects.create_user(username="beto", email="beto@example.com", password="x")
        self.carla = User.objects.create_user(username="carla", email="carla@example.com", password="x")
        for user in (self.beto, self.carla):
            user.public_key = fake_public_key()
            user.save()
        self.storage = get_blob_storage()
        self.old_blob = os.urandom(SIZE)
        self.song = Song.objects.create(
            owner=self.ana, title="Starlight", duration=10, size=SIZE,
            file_iv=b64(12), wrapped_file_key=b64(48), wrapped_key_iv=b64(12),
            visibility=Visibility.PUBLIC, public_file_key=b64(32), published_at=timezone.now(),
        )
        self.storage.put(self.song.storage_key, io.BytesIO(self.old_blob), SIZE)
        self.client.force_authenticate(self.ana)

    def url(self, song=None):
        return reverse("song-unpublish", args=[(song or self.song).uuid])

    def share_with(self, user):
        return SongShare.objects.create(song=self.song, recipient=user, wrapped_file_key=b64(384))

    def payload(self, *, size=SIZE, share_keys=None, blob=None):
        self.new_blob = blob if blob is not None else os.urandom(size)
        self.new_material = {"file_iv": b64(12), "wrapped_file_key": b64(48), "wrapped_key_iv": b64(12)}
        return {
            "file": SimpleUploadedFile("audio.bin", self.new_blob, content_type="application/octet-stream"),
            **self.new_material,
            "share_keys": json.dumps(share_keys if share_keys is not None else {}),
        }

    def unpublish(self, **kwargs):
        return self.client.post(self.url(), self.payload(**kwargs), format="multipart")

    def read_blob(self, key):
        with self.storage.open(key) as blob:
            return blob.read()

    # --- Rotación ---

    def test_unpublish_rotates_key_material_and_makes_the_song_private(self):
        old_key = self.song.storage_key

        with self.captureOnCommitCallbacks(execute=True):
            response = self.unpublish()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["visibility"], "private")
        self.assertIsNone(response.json()["published_at"])
        for field, value in self.new_material.items():
            self.assertEqual(response.json()[field], value)

        self.song.refresh_from_db()
        self.assertEqual(self.song.visibility, Visibility.PRIVATE)
        self.assertEqual(self.song.public_file_key, "")
        self.assertIsNone(self.song.published_at)
        self.assertNotEqual(self.song.storage_key, old_key)
        self.assertEqual(self.read_blob(self.song.storage_key), self.new_blob)

    def test_the_old_blob_is_deleted_after_commit(self):
        old_key = self.song.storage_key

        with self.captureOnCommitCallbacks(execute=True):
            self.unpublish()

        self.assertFalse(self.storage.exists(old_key))

    def test_the_owner_downloads_the_new_blob(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.unpublish()

        response = self.client.get(reverse("song-blob", args=[self.song.uuid]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), self.new_blob)

    def test_quota_does_not_change(self):
        before = User.objects.get(pk=self.ana.pk).used_storage
        self.unpublish()
        self.assertEqual(User.objects.get(pk=self.ana.pk).used_storage, before)

    def test_the_song_stops_being_served_by_community(self):
        self.client.force_authenticate(self.beto)
        url = reverse("community-song-blob", args=[self.song.uuid])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        b"".join(response.streaming_content)  # cierra el archivo (Windows no borra archivos abiertos)

        self.client.force_authenticate(self.ana)
        with self.captureOnCommitCallbacks(execute=True):
            self.unpublish()

        self.client.force_authenticate(self.beto)
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_can_publish_again_after_rotating(self):
        self.unpublish()
        self.song.refresh_from_db()

        response = self.client.put(
            reverse("song-publish", args=[self.song.uuid]),
            {"file_key": b64(32), "file_iv": self.song.file_iv},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["visibility"], "public")

    # --- Comparticiones ---

    def test_share_keys_are_replaced_for_every_recipient(self):
        self.share_with(self.beto)
        self.share_with(self.carla)
        new_keys = {"beto": b64(384), "carla": b64(384)}

        self.assertEqual(self.unpublish(share_keys=new_keys).status_code, 200)

        stored = {s.recipient.username: s.wrapped_file_key for s in SongShare.objects.filter(song=self.song)}
        self.assertEqual(stored, new_keys)

    def test_the_recipient_downloads_the_new_blob(self):
        self.share_with(self.beto)
        with self.captureOnCommitCallbacks(execute=True):
            self.unpublish(share_keys={"beto": b64(384)})

        self.client.force_authenticate(self.beto)
        response = self.client.get(reverse("shared-blob", args=[self.song.uuid]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), self.new_blob)

    def test_missing_recipient_is_409_and_nothing_changes(self):
        self.share_with(self.beto)
        self.share_with(self.carla)
        before = (self.song.storage_key, self.song.wrapped_file_key)

        response = self.unpublish(share_keys={"beto": b64(384)})

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "shares_changed")
        self.song.refresh_from_db()
        self.assertEqual(self.song.visibility, Visibility.PUBLIC)
        self.assertEqual((self.song.storage_key, self.song.wrapped_file_key), before)
        self.assertEqual(self.read_blob(self.song.storage_key), self.old_blob)

    def test_extra_recipient_is_409(self):
        response = self.unpublish(share_keys={"beto": b64(384)})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "shares_changed")

    def test_invalid_share_key_is_400(self):
        self.share_with(self.beto)
        response = self.unpublish(share_keys={"beto": b64(10)})
        self.assertEqual(response.status_code, 400)
        self.assertIn("share_keys", response.json())

    def test_share_keys_must_be_a_json_object(self):
        for bad in ["no es json", "[]", json.dumps({"beto": 5})]:
            with self.subTest(bad=bad):
                payload = self.payload()
                payload["share_keys"] = bad
                response = self.client.post(self.url(), payload, format="multipart")
                self.assertEqual(response.status_code, 400)

    # --- Validación y consistencia ---

    def test_a_ciphertext_of_another_size_is_rejected(self):
        response = self.unpublish(size=SIZE + 16)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "size_mismatch")
        self.song.refresh_from_db()
        self.assertEqual(self.song.visibility, Visibility.PUBLIC)

    def test_requires_the_new_key_material(self):
        payload = self.payload()
        del payload["wrapped_file_key"]
        self.assertEqual(self.client.post(self.url(), payload, format="multipart").status_code, 400)

    def test_storage_failure_changes_nothing(self):
        before = self.song.storage_key
        with mock.patch.object(type(self.storage), "put", side_effect=OSError("MinIO caído")):
            response = self.unpublish()

        self.assertEqual(response.status_code, 503)
        self.song.refresh_from_db()
        self.assertEqual(self.song.storage_key, before)
        self.assertEqual(self.song.visibility, Visibility.PUBLIC)

    def test_database_failure_removes_the_new_blob_and_keeps_the_old_one(self):
        old_key = self.song.storage_key
        put = type(self.storage).put
        written = []

        def recording_put(storage, key, data, size):
            written.append(key)
            return put(storage, key, data, size)

        with (
            mock.patch.object(type(self.storage), "put", recording_put),
            mock.patch.object(Song, "save", side_effect=RuntimeError("fallo de la base de datos")),
            self.assertRaises(RuntimeError),
            transaction.atomic(),
        ):
            self.unpublish()

        self.assertEqual(len(written), 1)
        self.assertFalse(self.storage.exists(written[0]))
        self.assertTrue(self.storage.exists(old_key))

    # --- Idempotencia y permisos ---

    def test_unpublishing_a_private_song_changes_nothing(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.unpublish()
        self.song.refresh_from_db()
        rotated_blob = self.new_blob
        before = (self.song.storage_key, self.song.file_iv, self.song.wrapped_file_key)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.unpublish()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["visibility"], "private")
        self.song.refresh_from_db()
        self.assertEqual((self.song.storage_key, self.song.file_iv, self.song.wrapped_file_key), before)
        self.assertEqual(self.read_blob(self.song.storage_key), rotated_blob)

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.unpublish().status_code, 401)

    def test_another_user_gets_404_and_nothing_changes(self):
        self.client.force_authenticate(self.beto)

        self.assertEqual(self.unpublish().status_code, 404)

        self.song.refresh_from_db()
        self.assertEqual(self.song.visibility, Visibility.PUBLIC)
        self.assertEqual(self.read_blob(self.song.storage_key), self.old_blob)

    def test_the_old_delete_endpoint_no_longer_exists(self):
        """Despublicar sin rotar dejaría la llave que vio el servidor abriendo el blob."""
        response = self.client.delete(reverse("song-publish", args=[self.song.uuid]))
        self.assertEqual(response.status_code, 405)
        self.song.refresh_from_db()
        self.assertEqual(self.song.visibility, Visibility.PUBLIC)


class StaleKeyTests(TempLocalStorageMixin, APITestCase):
    """`file_iv` identifica el material con el que trabajó el navegador: si se rotó, 409."""

    def setUp(self):
        super().setUp()
        self.ana = make_user("ana")
        self.beto = make_user("beto")
        self.song = Song.objects.create(
            owner=self.ana, title="Starlight", duration=10, size=SIZE,
            file_iv=b64(12), wrapped_file_key=b64(48), wrapped_key_iv=b64(12),
        )
        self.client.force_authenticate(self.ana)

    def publish(self, file_iv):
        return self.client.put(
            reverse("song-publish", args=[self.song.uuid]), {"file_key": b64(32), "file_iv": file_iv}, format="json"
        )

    def share(self, file_iv):
        return self.client.put(
            reverse("song-share", args=[self.song.uuid, "beto"]),
            {"wrapped_file_key": b64(384), "file_iv": file_iv},
            format="json",
        )

    def test_publish_with_the_current_iv_works(self):
        self.assertEqual(self.publish(self.song.file_iv).status_code, 200)

    def test_publish_with_a_stale_iv_is_409(self):
        response = self.publish(b64(12))

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "stale_key")
        self.song.refresh_from_db()
        self.assertEqual(self.song.visibility, Visibility.PRIVATE)

    def test_share_with_the_current_iv_works(self):
        self.assertEqual(self.share(self.song.file_iv).status_code, 201)

    def test_share_with_a_stale_iv_is_409(self):
        response = self.share(b64(12))

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "stale_key")
        self.assertFalse(SongShare.objects.filter(song=self.song).exists())

    def test_the_owner_sees_the_recipient_public_key(self):
        self.share(self.song.file_iv)

        shares = self.client.get(reverse("song-shares", args=[self.song.uuid])).json()

        self.assertEqual(shares[0]["recipient"], "beto")
        self.assertEqual(shares[0]["recipient_public_key"], self.beto.public_key)
