from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import User
from playlists.models import Playlist, PlaylistSong
from vault.models import Favorite, Song
from vault.tests.helpers import TempLocalStorageMixin


class PlaylistTestCase(TempLocalStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.ana = User.objects.create_user(username="ana", email="ana@example.com", password="x")
        self.beto = User.objects.create_user(username="beto", email="beto@example.com", password="x")
        self.client.force_authenticate(self.ana)

    def make_song(self, owner=None, title="Starlight", size=1000, duration=100):
        return Song.objects.create(
            owner=owner or self.ana, title=title, duration=duration, size=size,
            file_iv="aXY=", wrapped_file_key="a2V5", wrapped_key_iv="aXY=",
        )

    def make_playlist(self, owner=None, name="Mi playlist", songs=()):
        playlist = Playlist.objects.create(owner=owner or self.ana, name=name)
        for position, song in enumerate(songs):
            PlaylistSong.objects.create(playlist=playlist, song=song, position=position)
        return playlist

    def song_url(self, playlist, song):
        return reverse("playlist-song", args=[playlist.uuid, song.uuid])

    def detail(self, playlist):
        return self.client.get(reverse("playlist-detail", args=[playlist.uuid]))

    def titles(self, playlist):
        return [s["title"] for s in self.detail(playlist).json()["songs"]]


class PlaylistCrudTests(PlaylistTestCase):
    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse("playlists")).status_code, 401)

    def test_create_trims_and_returns_an_empty_summary(self):
        response = self.client.post(reverse("playlists"), {"name": "  Para correr  ", "description": "Rápidas"}, format="json")

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual((body["name"], body["description"]), ("Para correr", "Rápidas"))
        self.assertEqual((body["song_count"], body["total_size"], body["total_duration"]), (0, 0, 0))
        self.assertNotIn("contains_song", body)
        self.assertEqual(Playlist.objects.get(uuid=body["id"]).owner, self.ana)

    def test_create_rejects_blank_or_too_long_names(self):
        for data in [{}, {"name": "   "}, {"name": "x" * 151}, {"name": "ok", "description": "d" * 301}]:
            with self.subTest(data=data):
                self.assertEqual(self.client.post(reverse("playlists"), data, format="json").status_code, 400)

    def test_list_only_own_with_totals_most_recently_modified_first(self):
        a, b = self.make_song(size=1000, duration=60), self.make_song(size=500, duration=30)
        older = self.make_playlist(name="Vieja", songs=[a])
        newer = self.make_playlist(name="Nueva", songs=[a, b])
        self.make_playlist(owner=self.beto, name="De Beto")
        Playlist.objects.filter(pk=older.pk).update(updated_at=newer.updated_at.replace(year=2020))

        body = self.client.get(reverse("playlists")).json()

        self.assertEqual([p["name"] for p in body], ["Nueva", "Vieja"])
        self.assertEqual((body[0]["song_count"], body[0]["total_size"], body[0]["total_duration"]), (2, 1500, 90))

    def test_list_can_say_which_playlists_contain_a_song(self):
        song = self.make_song()
        self.make_playlist(name="Con", songs=[song])
        self.make_playlist(name="Sin")

        body = self.client.get(reverse("playlists"), {"song": str(song.uuid)}).json()

        self.assertEqual({p["name"]: p["contains_song"] for p in body}, {"Con": True, "Sin": False})
        self.assertEqual(self.client.get(reverse("playlists"), {"song": "no-es-uuid"}).status_code, 400)

    def test_detail_lists_songs_in_order_with_favorite_flag(self):
        a, b, c = self.make_song(title="A"), self.make_song(title="B"), self.make_song(title="C")
        playlist = self.make_playlist(songs=[c, a, b])
        Favorite.objects.create(user=self.ana, song=a)

        songs = self.detail(playlist).json()["songs"]

        self.assertEqual([s["title"] for s in songs], ["C", "A", "B"])
        self.assertEqual([s["is_favorite"] for s in songs], [False, True, False])
        self.assertIn("wrapped_file_key", songs[0])  # se puede reproducir directamente

    def test_rename_and_change_description(self):
        playlist = self.make_playlist()
        url = reverse("playlist-detail", args=[playlist.uuid])

        response = self.client.patch(url, {"name": "Renombrada"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.client.patch(url, {"description": "Nueva descripción"}, format="json")

        playlist.refresh_from_db()
        self.assertEqual((playlist.name, playlist.description), ("Renombrada", "Nueva descripción"))
        self.assertEqual(self.client.patch(url, {}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"name": ""}, format="json").status_code, 400)

    def test_delete_keeps_the_songs(self):
        song = self.make_song()
        playlist = self.make_playlist(songs=[song])

        response = self.client.delete(reverse("playlist-detail", args=[playlist.uuid]))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Playlist.objects.exists())
        self.assertFalse(PlaylistSong.objects.exists())
        self.assertTrue(Song.objects.filter(pk=song.pk).exists())

    def test_someone_elses_playlist_is_404_everywhere(self):
        betos = self.make_playlist(owner=self.beto, name="De Beto")
        mine = self.make_song()
        url = reverse("playlist-detail", args=[betos.uuid])

        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.patch(url, {"name": "hack"}, format="json").status_code, 404)
        self.assertEqual(self.client.delete(url).status_code, 404)
        self.assertEqual(self.client.put(self.song_url(betos, mine)).status_code, 404)
        self.assertEqual(self.client.delete(self.song_url(betos, mine)).status_code, 404)
        betos.refresh_from_db()
        self.assertEqual(betos.name, "De Beto")
        self.assertFalse(betos.entries.exists())


class PlaylistSongsTests(PlaylistTestCase):
    def test_add_appends_at_the_end(self):
        a, b = self.make_song(title="A"), self.make_song(title="B")
        playlist = self.make_playlist(songs=[a])

        response = self.client.put(self.song_url(playlist, b))

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["song_count"], 2)
        self.assertEqual(self.titles(playlist), ["A", "B"])

    def test_adding_twice_does_not_duplicate(self):
        song = self.make_song()
        playlist = self.make_playlist(songs=[song])

        response = self.client.put(self.song_url(playlist, song))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(playlist.entries.count(), 1)

    def test_cannot_add_someone_elses_song(self):
        playlist = self.make_playlist()
        betos = self.make_song(owner=self.beto)

        response = self.client.put(self.song_url(playlist, betos))

        self.assertEqual((response.status_code, response.json()["code"]), (404, "song_not_found"))
        self.assertFalse(playlist.entries.exists())

    def test_remove_closes_the_gap_and_is_idempotent(self):
        a, b, c = self.make_song(title="A"), self.make_song(title="B"), self.make_song(title="C")
        playlist = self.make_playlist(songs=[a, b, c])

        self.assertEqual(self.client.delete(self.song_url(playlist, b)).status_code, 204)
        self.assertEqual(self.client.delete(self.song_url(playlist, b)).status_code, 204)

        self.assertEqual(self.titles(playlist), ["A", "C"])
        self.assertEqual(list(playlist.entries.values_list("position", flat=True)), [0, 1])
        self.assertTrue(Song.objects.filter(pk=b.pk).exists())

    def test_move_reorders_and_clamps_to_the_end(self):
        a, b, c, d = (self.make_song(title=t) for t in "ABCD")
        playlist = self.make_playlist(songs=[a, b, c, d])
        move = lambda song, position: self.client.patch(self.song_url(playlist, song), {"position": position}, format="json")

        response = move(d, 0)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([s["title"] for s in response.json()["songs"]], ["D", "A", "B", "C"])

        move(a, 99)
        self.assertEqual(self.titles(playlist), ["D", "B", "C", "A"])
        self.assertEqual(list(playlist.entries.values_list("position", flat=True)), [0, 1, 2, 3])

    def test_move_validates_position_and_membership(self):
        a, outside = self.make_song(), self.make_song()
        playlist = self.make_playlist(songs=[a])

        self.assertEqual(self.client.patch(self.song_url(playlist, a), {"position": -1}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(self.song_url(playlist, outside), {"position": 0}, format="json").status_code, 404)

    def test_changes_mark_the_playlist_as_modified(self):
        song = self.make_song()
        playlist = self.make_playlist()
        Playlist.objects.filter(pk=playlist.pk).update(updated_at=playlist.updated_at.replace(year=2020))

        self.client.put(self.song_url(playlist, song))

        playlist.refresh_from_db()
        self.assertGreater(playlist.updated_at.year, 2020)

    def test_deleting_a_song_removes_it_from_playlists(self):
        a, b = self.make_song(title="A"), self.make_song(title="B")
        playlist = self.make_playlist(songs=[a, b])

        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(reverse("song-detail", args=[a.uuid]))

        self.assertEqual(self.titles(playlist), ["B"])
        self.assertEqual(self.detail(playlist).json()["song_count"], 1)
