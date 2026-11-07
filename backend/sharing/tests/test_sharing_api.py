"""
Compartir canciones (día 17), lado del propietario: buscar destinatario,
compartir, listar accesos y revocar. La File Key envuelta se simula con 384
bytes aleatorios (lo que produce RSA-OAEP 3072); el servidor no la distingue.
"""

import base64
import os

from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import User
from accounts.tests.test_keypair import fake_public_key
from sharing.models import SongShare
from vault.models import Song
from vault.tests.helpers import TempLocalStorageMixin


def shared_key() -> str:
    return base64.b64encode(os.urandom(384)).decode()


def make_user(username, *, keypair=True, **extra):
    user = User.objects.create_user(username=username, email=f"{username}@example.com", password="x", **extra)
    user.wrapped_master_key = "bXVzaWNsb2Nr"  # tiene bóveda
    if keypair:
        user.public_key = fake_public_key()
    user.save()
    return user


class SharingTestCase(TempLocalStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        cache.clear()  # límite de peticiones de la búsqueda
        self.ana = make_user("ana")
        self.beto = make_user("beto")
        self.carla = make_user("carla")
        self.song = self.make_song(self.ana)
        self.client.force_authenticate(self.ana)

    def make_song(self, owner, title="Aurora"):
        return Song.objects.create(
            owner=owner, title=title, duration=8, size=1000,
            file_iv="aXY=", wrapped_file_key="a2V5", wrapped_key_iv="aXY=",
        )

    def share(self, song=None, username="beto", key=None, **extra):
        url = reverse("song-share", args=[(song or self.song).uuid, username])
        return self.client.put(url, {"wrapped_file_key": key or shared_key(), **extra}, format="json")

    def shares(self, song=None):
        return self.client.get(reverse("song-shares", args=[(song or self.song).uuid]))

    def lookup(self, q):
        return self.client.get(reverse("user-lookup"), {"q": q})


class LookupTests(SharingTestCase):
    def test_finds_by_exact_email_or_username_ignoring_case(self):
        for q in ["beto@example.com", "BETO@Example.com", "beto", "  Beto "]:
            with self.subTest(q=q):
                response = self.lookup(q)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), {"username": "beto", "public_key": self.beto.public_key})

    def test_no_partial_matches_and_no_listing(self):
        for q in ["bet", "example.com", "", "%"]:
            with self.subTest(q=q):
                self.assertEqual(self.lookup(q).json()["code"], "recipient_not_found")

    def test_blocked_accounts_and_admins_without_vault_are_not_found(self):
        make_user("bloqueado", is_active=False)
        User.objects.create_superuser(username="admin", email="admin@example.com", password="x")
        for q in ["bloqueado", "admin"]:
            with self.subTest(q=q):
                self.assertEqual(self.lookup(q).status_code, 404)

    def test_self_and_users_without_keypair(self):
        make_user("sinclave", keypair=False)

        self.assertEqual(self.lookup("ana").json()["code"], "self_share")
        response = self.lookup("sinclave")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "recipient_without_key")

    def test_requires_a_session(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.lookup("beto").status_code, 401)


class ShareTests(SharingTestCase):
    def test_share_stores_the_wrapped_key_and_lists_the_access(self):
        key = shared_key()

        response = self.share(key=key)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.json()["recipient"], "beto")
        self.assertEqual(response.json()["role"], "query")
        share = SongShare.objects.get()
        self.assertEqual((share.song, share.recipient, share.wrapped_file_key), (self.song, self.beto, key))
        listed = self.shares().json()
        self.assertEqual([(s["recipient"], s["role"]) for s in listed], [("beto", "query")])
        self.assertNotIn("email", listed[0])  # del destinatario solo se muestra el usuario

    def test_sharing_again_replaces_the_key_without_duplicating(self):
        self.share()
        new_key = shared_key()

        response = self.share(key=new_key, role="query")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(SongShare.objects.get().wrapped_file_key, new_key)

    def test_share_with_several_people_newest_first(self):
        self.share(username="beto")
        self.share(username="carla")
        self.assertEqual([s["recipient"] for s in self.shares().json()], ["carla", "beto"])

    def test_recipient_errors(self):
        make_user("sinclave", keypair=False)
        cases = {"nadie": 404, "ana": 400, "sinclave": 409}
        for username, expected in cases.items():
            with self.subTest(username=username):
                self.assertEqual(self.share(username=username).status_code, expected)
        self.assertFalse(SongShare.objects.exists())

    def test_rejects_malformed_key_or_unknown_role(self):
        bad_key = base64.b64encode(os.urandom(256)).decode()
        self.assertEqual(self.share(key=bad_key).status_code, 400)
        self.assertEqual(self.share(role="editor").status_code, 400)
        self.assertFalse(SongShare.objects.exists())

    def test_cannot_share_or_list_someone_elses_song(self):
        betos = self.make_song(self.beto, title="De Beto")

        self.assertEqual(self.share(song=betos, username="carla").status_code, 404)
        self.assertEqual(self.shares(song=betos).status_code, 404)
        self.assertEqual(self.client.delete(reverse("song-share", args=[betos.uuid, "carla"])).status_code, 404)

    def test_the_recipient_cannot_manage_the_shares(self):
        """Con rol Consulta, Beto no puede volver a compartir ni ver quién más tiene acceso."""
        self.share(username="beto")
        self.client.force_authenticate(self.beto)

        self.assertEqual(self.share(username="carla").status_code, 404)
        self.assertEqual(self.shares().status_code, 404)


class RevokeTests(SharingTestCase):
    def revoke(self, username="beto"):
        return self.client.delete(reverse("song-share", args=[self.song.uuid, username]))

    def test_revoke_removes_only_that_access_and_is_idempotent(self):
        self.share(username="beto")
        self.share(username="carla")

        self.assertEqual(self.revoke("BETO").status_code, 204)
        self.assertEqual(self.revoke("beto").status_code, 204)

        self.assertEqual([s["recipient"] for s in self.shares().json()], ["carla"])

    def test_deleting_the_song_or_the_recipient_removes_the_shares(self):
        self.share(username="beto")
        self.share(username="carla")

        self.carla.delete()
        self.assertEqual(SongShare.objects.count(), 1)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(reverse("song-detail", args=[self.song.uuid]))
        self.assertFalse(SongShare.objects.exists())
