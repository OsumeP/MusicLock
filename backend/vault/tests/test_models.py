from django.test import TestCase

from accounts.models import User
from vault.models import Song


class SongModelTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="ana", email="ana@example.com", password="x")

    def make_song(self, **extra):
        fields = {
            "owner": self.owner,
            "title": "Canción",
            "duration": 180,
            "size": 1024,
            "file_iv": "aXY=",
            "wrapped_file_key": "a2V5",
            "wrapped_key_iv": "aXY=",
            **extra,
        }
        return Song.objects.create(**fields)

    def test_storage_key_uses_owner_and_uuid_but_not_title(self):
        song = self.make_song(title="Mi canción secreta")

        self.assertEqual(song.storage_key, f"users/{self.owner.id}/songs/{song.uuid}.bin")
        self.assertNotIn("secreta", song.storage_key)

    def test_songs_are_private_by_default(self):
        self.assertFalse(self.make_song().is_public)  # BR-19

    def test_deleting_user_deletes_their_songs(self):
        self.make_song()
        self.owner.delete()
        self.assertEqual(Song.objects.count(), 0)
