import base64

from django.db import IntegrityError, transaction
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from community.models import Follow
from vault.models import Song, Visibility
from vault.tests.helpers import TempLocalStorageMixin

PUBLIC_KEY = base64.b64encode(b"k" * 32).decode()


class FollowApiTests(TempLocalStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        cache.clear()  # límite de peticiones (`comments` / `follow`)
        self.ana = User.objects.create_user(username="ana", email="ana@example.com", password="x")
        self.beto = User.objects.create_user(username="beto", email="beto@example.com", password="x")
        self.carla = User.objects.create_user(username="carla", email="carla@example.com", password="x")
        self.client.force_authenticate(self.ana)

    def make_song(self, owner, title="Starlight", public=True):
        extra = (
            {"visibility": Visibility.PUBLIC, "public_file_key": PUBLIC_KEY, "published_at": timezone.now()}
            if public
            else {}
        )
        return Song.objects.create(
            owner=owner, title=title, duration=10, size=1000,
            file_iv="aXY=", wrapped_file_key="a2V5", wrapped_key_iv="aXY=", **extra,
        )

    def url(self, user):
        return reverse("community-follow", args=[user.username if hasattr(user, "username") else user])

    def listed(self, **params):
        response = self.client.get(reverse("community-songs"), params)
        self.assertEqual(response.status_code, 200)
        return response.json()["results"]

    def titles(self, **params):
        return [s["title"] for s in self.listed(**params)]

    # --- Acceso ---

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.put(self.url(self.beto)).status_code, 401)
        self.assertEqual(self.client.delete(self.url(self.beto)).status_code, 401)
        self.assertEqual(self.client.get(reverse("community-songs"), {"scope": "following"}).status_code, 401)

    # --- Seguir y dejar de seguir ---

    def test_follow_reports_the_state_and_is_idempotent(self):
        for _ in range(2):
            response = self.client.put(self.url(self.beto))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"username": "beto", "is_following": True})
        self.assertEqual(Follow.objects.filter(follower=self.ana, followed=self.beto).count(), 1)

    def test_unfollow_is_idempotent(self):
        Follow.objects.create(follower=self.ana, followed=self.beto)
        for _ in range(2):
            response = self.client.delete(self.url(self.beto))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"username": "beto", "is_following": False})
        self.assertFalse(Follow.objects.exists())

    def test_cannot_follow_yourself(self):
        response = self.client.put(self.url(self.ana))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "self_follow")
        self.assertFalse(Follow.objects.exists())

    def test_unknown_user_is_404(self):
        for method in (self.client.put, self.client.delete):
            response = method(self.url("nadie"))
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json()["code"], "user_not_found")

    def test_cannot_follow_a_blocked_account_but_can_unfollow_it(self):
        Follow.objects.create(follower=self.ana, followed=self.beto)
        self.beto.is_active = False
        self.beto.save()

        self.assertEqual(self.client.put(self.url(self.carla)).status_code, 200)
        blocked = self.client.put(self.url(self.beto))
        self.assertEqual(blocked.status_code, 404)
        self.assertEqual(blocked.json()["code"], "user_not_found")

        self.assertEqual(self.client.delete(self.url(self.beto)).status_code, 200)
        self.assertFalse(Follow.objects.filter(followed=self.beto).exists())

    def test_database_rejects_following_yourself(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Follow.objects.create(follower=self.ana, followed=self.ana)

    def test_deleting_a_user_removes_their_follows(self):
        Follow.objects.create(follower=self.ana, followed=self.beto)
        Follow.objects.create(follower=self.beto, followed=self.carla)
        self.beto.delete()
        self.assertFalse(Follow.objects.exists())

    # --- Pestaña "Siguiendo" ---

    def test_following_scope_lists_only_public_songs_of_followed_users(self):
        self.make_song(self.beto, title="De Beto")
        self.make_song(self.beto, title="Privada de Beto", public=False)
        self.make_song(self.carla, title="De Carla")
        self.make_song(self.ana, title="Mía")
        self.client.put(self.url(self.beto))

        self.assertEqual(self.titles(scope="following"), ["De Beto"])
        self.assertEqual(sorted(self.titles(scope="community")), ["De Beto", "De Carla"])

    def test_following_scope_is_empty_when_following_nobody(self):
        self.make_song(self.beto)
        self.assertEqual(self.titles(scope="following"), [])

    def test_unfollowing_removes_their_songs_from_following(self):
        self.make_song(self.beto, title="De Beto")
        self.client.put(self.url(self.beto))
        self.assertEqual(self.titles(scope="following"), ["De Beto"])

        self.client.delete(self.url(self.beto))

        self.assertEqual(self.titles(scope="following"), [])

    def test_a_blocked_account_disappears_from_following(self):
        self.make_song(self.beto)
        self.client.put(self.url(self.beto))
        self.beto.is_active = False
        self.beto.save()
        self.assertEqual(self.titles(scope="following"), [])

    def test_following_scope_supports_search(self):
        self.make_song(self.beto, title="Nocturno")
        self.make_song(self.beto, title="Alba")
        self.client.put(self.url(self.beto))
        self.assertEqual(self.titles(scope="following", q="noct"), ["Nocturno"])

    # --- Marca `is_following` ---

    def test_songs_carry_the_is_following_flag(self):
        self.make_song(self.beto, title="De Beto")
        self.make_song(self.carla, title="De Carla")
        self.client.put(self.url(self.beto))

        flags = {s["title"]: s["is_following"] for s in self.listed()}

        self.assertEqual(flags, {"De Beto": True, "De Carla": False})

    def test_the_detail_also_carries_the_flag(self):
        song = self.make_song(self.beto)
        detail = reverse("community-song-detail", args=[song.uuid])
        self.assertFalse(self.client.get(detail).json()["is_following"])
        self.client.put(self.url(self.beto))
        self.assertTrue(self.client.get(detail).json()["is_following"])

    def test_my_own_songs_are_never_flagged(self):
        self.make_song(self.ana, title="Mía")
        self.assertFalse(self.listed(scope="mine")[0]["is_following"])

    def test_follows_are_private_to_each_user(self):
        self.make_song(self.carla, title="De Carla")
        Follow.objects.create(follower=self.beto, followed=self.carla)

        self.assertEqual(self.titles(scope="following"), [])
        self.assertFalse(self.listed()[0]["is_following"])