import io
import os
from unittest import mock

from django.db import transaction
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import User
from vault.models import Song
from vault.storage import get_blob_storage
from vault.tests.helpers import TempLocalStorageMixin


class SongManagementTestCase(TempLocalStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.ana = User.objects.create_user(username="ana", email="ana@example.com", password="x")
        self.beto = User.objects.create_user(username="beto", email="beto@example.com", password="x")
        self.client.force_authenticate(self.ana)

    def make_song(self, owner=None, size=1000, title="Starlight", artist="Aethel"):
        owner = owner or self.ana
        song = Song.objects.create(
            owner=owner, title=title, artist=artist, duration=10, size=size,
            file_iv="aXY=", wrapped_file_key="a2V5", wrapped_key_iv="aXY=",
        )
        get_blob_storage().put(song.storage_key, io.BytesIO(os.urandom(size)), size)
        User.objects.filter(pk=owner.pk).update(used_storage=owner.used_storage + size)
        owner.refresh_from_db()
        return song

    def used(self, user):
        user.refresh_from_db()
        return user.used_storage


class UpdateSongTests(SongManagementTestCase):
    def patch(self, song, data):
        return self.client.patch(reverse("song-detail", args=[song.uuid]), data, format="json")

    def test_updates_title_and_artist_only(self):
        song = self.make_song()
        before = (song.file_iv, song.wrapped_file_key, song.size, song.storage_key)

        response = self.patch(song, {"title": "Nuevo título", "artist": ""})

        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.json()["title"], response.json()["artist"]), ("Nuevo título", ""))
        song.refresh_from_db()
        self.assertEqual((song.title, song.artist), ("Nuevo título", ""))
        self.assertEqual((song.file_iv, song.wrapped_file_key, song.size, song.storage_key), before)

    def test_partial_update_keeps_the_other_field(self):
        song = self.make_song()
        self.patch(song, {"artist": "Otro"})
        song.refresh_from_db()
        self.assertEqual((song.title, song.artist), ("Starlight", "Otro"))

    def test_rejects_empty_title_too_long_values_and_empty_body(self):
        song = self.make_song()
        for data in [{"title": ""}, {"title": "x" * 151}, {"artist": "y" * 151}, {}]:
            with self.subTest(data=data):
                self.assertEqual(self.patch(song, data).status_code, 400)

    def test_ignores_attempts_to_change_crypto_or_size(self):
        song = self.make_song()
        self.patch(song, {"title": "ok", "size": 1, "wrapped_file_key": "hack", "owner": self.beto.pk})
        song.refresh_from_db()
        self.assertEqual((song.size, song.wrapped_file_key, song.owner_id), (1000, "a2V5", self.ana.pk))


class DeleteSongTests(SongManagementTestCase):
    def delete(self, song):
        return self.client.delete(reverse("song-detail", args=[song.uuid]))

    def test_deletes_row_blob_and_frees_quota(self):
        keep = self.make_song(size=300)
        song = self.make_song(size=1000)
        self.assertEqual(self.used(self.ana), 1300)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.delete(song)

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Song.objects.filter(pk=song.pk).exists())
        self.assertFalse(get_blob_storage().exists(song.storage_key))
        self.assertTrue(get_blob_storage().exists(keep.storage_key))
        self.assertEqual(self.used(self.ana), 300)

    def test_deleting_twice_is_404(self):
        song = self.make_song()
        self.delete(song)
        self.assertEqual(self.delete(song).status_code, 404)

    def test_quota_never_goes_negative(self):
        song = self.make_song(size=1000)
        User.objects.filter(pk=self.ana.pk).update(used_storage=10)  # contador desincronizado
        self.delete(song)
        self.assertEqual(self.used(self.ana), 0)

    def test_blob_is_kept_if_the_transaction_rolls_back(self):
        song = self.make_song()

        with self.captureOnCommitCallbacks(execute=True):
            try:
                with transaction.atomic():
                    Song.objects.filter(pk=song.pk).delete()
                    raise RuntimeError("fallo después de borrar")
            except RuntimeError:
                pass

        self.assertTrue(Song.objects.filter(pk=song.pk).exists())
        self.assertTrue(get_blob_storage().exists(song.storage_key))

    def test_blob_deletion_failure_is_logged_not_raised(self):
        song = self.make_song()
        with mock.patch("vault.storage.LocalBlobStorage.delete", side_effect=OSError("MinIO caído")), self.assertLogs(
            "vault.signals", level="ERROR"
        ), self.captureOnCommitCallbacks(execute=True):
            response = self.delete(song)
        self.assertEqual(response.status_code, 204)

    def test_deleting_a_user_deletes_all_their_blobs(self):
        songs = [self.make_song(), self.make_song(), self.make_song(owner=self.beto)]

        with self.captureOnCommitCallbacks(execute=True):
            self.ana.delete()

        self.assertFalse(get_blob_storage().exists(songs[0].storage_key))
        self.assertFalse(get_blob_storage().exists(songs[1].storage_key))
        self.assertTrue(get_blob_storage().exists(songs[2].storage_key))  # el de Beto sigue


class OwnershipMatrixTests(SongManagementTestCase):
    """PlanMVP §8 paso 6: el usuario B no puede ver ni tocar NADA del usuario A."""

    def test_another_user_cannot_access_a_song_through_any_endpoint(self):
        song = self.make_song()
        self.client.force_authenticate(self.beto)

        list_body = self.client.get(reverse("songs")).json()
        blob = self.client.get(reverse("song-blob", args=[song.uuid]))
        patch = self.client.patch(reverse("song-detail", args=[song.uuid]), {"title": "hackeado"}, format="json")
        with self.captureOnCommitCallbacks(execute=True):
            delete = self.client.delete(reverse("song-detail", args=[song.uuid]))

        self.assertEqual(list_body["count"], 0)
        self.assertEqual((blob.status_code, patch.status_code, delete.status_code), (404, 404, 404))
        song.refresh_from_db()
        self.assertEqual(song.title, "Starlight")
        self.assertTrue(get_blob_storage().exists(song.storage_key))
        self.assertEqual(self.used(self.ana), 1000)

    def test_unauthenticated_requests_are_rejected_everywhere(self):
        song = self.make_song()
        self.client.force_authenticate(None)
        responses = [
            self.client.get(reverse("songs")),
            self.client.get(reverse("song-blob", args=[song.uuid])),
            self.client.patch(reverse("song-detail", args=[song.uuid]), {"title": "x"}, format="json"),
            self.client.delete(reverse("song-detail", args=[song.uuid])),
        ]
        self.assertEqual([r.status_code for r in responses], [401, 401, 401, 401])
