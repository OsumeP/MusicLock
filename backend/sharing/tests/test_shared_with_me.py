"""
"Compartido conmigo" (día 18), lado del destinatario: listado y acceso al blob
cifrado a través del Proxy de `sharing`, con permiso "Consulta" (Accesos FR-06,
FR-07).
"""

import io
import os

from django.urls import reverse

from sharing.models import SongShare
from vault.storage import get_blob_storage

from .test_sharing_api import SharingTestCase, shared_key


class SharedWithMeTestCase(SharingTestCase):
    def setUp(self):
        super().setUp()
        self.blob = os.urandom(1000)
        get_blob_storage().put(self.song.storage_key, io.BytesIO(self.blob), len(self.blob))
        self.key_for_beto = shared_key()
        self.share(username="beto", key=self.key_for_beto)
        self.client.force_authenticate(self.beto)

    def shared(self, **params):
        return self.client.get(reverse("shared-with-me"), params)

    def shared_blob(self, song=None):
        return self.client.get(reverse("shared-blob", args=[(song or self.song).uuid]))


class SharedListTests(SharedWithMeTestCase):
    def test_lists_the_song_with_the_key_wrapped_for_me_and_its_owner(self):
        body = self.shared().json()

        self.assertEqual(body["count"], 1)
        item = body["results"][0]
        self.assertEqual(item["id"], str(self.song.uuid))
        self.assertEqual((item["title"], item["owner"], item["role"]), ("Aurora", "ana", "query"))
        self.assertEqual(item["shared_file_key"], self.key_for_beto)
        self.assertEqual(item["file_iv"], self.song.file_iv)
        # Nada que dependa de la Master Key de Ana.
        self.assertNotIn("wrapped_file_key", item)
        self.assertNotIn("wrapped_key_iv", item)

    def test_only_my_shares_newest_first_and_searchable(self):
        brisa = self.make_song(self.ana, title="Brisa")
        carlas = self.make_song(self.carla, title="De Carla")
        self.client.force_authenticate(self.ana)
        self.share(song=brisa, username="beto")
        self.share(song=brisa, username="carla")  # no es para Beto
        self.client.force_authenticate(self.carla)
        self.share(song=carlas, username="beto")
        self.client.force_authenticate(self.beto)

        titles = lambda **p: [s["title"] for s in self.shared(**p).json()["results"]]

        self.assertEqual(titles(), ["De Carla", "Brisa", "Aurora"])
        self.assertEqual(titles(q="bri"), ["Brisa"])
        self.assertEqual(titles(q="carla"), ["De Carla"])  # por propietario

    def test_the_owner_does_not_see_their_own_songs_here(self):
        self.client.force_authenticate(self.ana)
        self.assertEqual(self.shared().json()["count"], 0)

    def test_revoked_and_blocked_owners_disappear(self):
        self.ana.is_active = False
        self.ana.save()
        self.assertEqual(self.shared().json()["count"], 0)
        self.assertEqual(self.shared_blob().status_code, 404)

        self.ana.is_active = True
        self.ana.save()
        SongShare.objects.all().delete()
        self.assertEqual(self.shared().json()["count"], 0)

    def test_requires_a_session(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.shared().status_code, 401)
        self.assertEqual(self.shared_blob().status_code, 401)


class SharedBlobTests(SharedWithMeTestCase):
    def test_the_recipient_gets_the_same_encrypted_blob(self):
        response = self.shared_blob()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), self.blob)
        self.assertEqual(response["Cache-Control"], "private, no-store")

    def test_after_revoking_the_blob_is_404(self):
        self.client.force_authenticate(self.ana)
        self.client.delete(reverse("song-share", args=[self.song.uuid, "beto"]))
        self.client.force_authenticate(self.beto)

        self.assertEqual(self.shared_blob().status_code, 404)

    def test_a_third_user_gets_404(self):
        self.client.force_authenticate(self.carla)
        self.assertEqual(self.shared_blob().status_code, 404)
        self.assertEqual(self.client.get(reverse("song-blob", args=[self.song.uuid])).status_code, 404)

    def test_the_owner_uses_their_own_proxy(self):
        """El Proxy de compartidas no es una vía alternativa para el propietario."""
        self.client.force_authenticate(self.ana)
        self.assertEqual(self.shared_blob().status_code, 404)
        own = self.client.get(reverse("song-blob", args=[self.song.uuid]))
        self.assertEqual(own.status_code, 200)
        # Consumir el streaming cierra el blob (en Windows no se puede borrar un archivo abierto).
        # No usar own.close(): emite request_finished y Django cierra la conexión a PostgreSQL.
        self.assertEqual(b"".join(own.streaming_content), self.blob)


class ConsultaRoleTests(SharedWithMeTestCase):
    """Con "Consulta" el destinatario solo reproduce y descarga (Accesos FR-07)."""

    def test_the_recipient_cannot_edit_delete_favorite_or_use_the_owner_endpoints(self):
        url = lambda name: reverse(name, args=[self.song.uuid])
        attempts = [
            self.client.get(url("song-blob")),
            self.client.patch(url("song-detail"), {"title": "Mía"}, format="json"),
            self.client.delete(url("song-detail")),
            self.client.put(url("song-favorite")),
            self.client.post(url("song-plays")),
        ]
        self.assertEqual([r.status_code for r in attempts], [404] * len(attempts))
        self.song.refresh_from_db()
        self.assertEqual(self.song.title, "Aurora")

    def test_shared_songs_do_not_count_against_the_recipients_quota(self):
        self.assertEqual(self.client.get(reverse("me")).json()["used_storage"], 0)

    def test_blob_missing_is_reported(self):
        get_blob_storage().delete(self.song.storage_key)
        response = self.shared_blob()
        self.assertEqual((response.status_code, response.json()["code"]), (404, "blob_missing"))

