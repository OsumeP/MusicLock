import base64
from unittest import mock

from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from community.models import MAX_DEPTH, Comment
from vault.models import Song, Visibility
from vault.tests.helpers import TempLocalStorageMixin

PUBLIC_KEY = base64.b64encode(b"k" * 32).decode()


class CommentsApiTests(TempLocalStorageMixin, APITestCase):
    def setUp(self):
        super().setUp()
        cache.clear()  # límite de peticiones (`comments` / `follow`)
        self.ana = User.objects.create_user(username="ana", email="ana@example.com", password="x")
        self.beto = User.objects.create_user(username="beto", email="beto@example.com", password="x")
        self.carla = User.objects.create_user(username="carla", email="carla@example.com", password="x")
        self.song = self.make_song(self.beto)  # pública, de Beto
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

    def list_url(self, song=None):
        return reverse("community-song-comments", args=[(song or self.song).uuid])

    def detail_url(self, comment):
        return reverse("community-comment-detail", args=[comment.pk])

    def comment(self, body="Hola", author=None, parent=None, song=None):
        return Comment.objects.create(
            song=song or self.song, author=author or self.ana, parent=parent,
            depth=0 if parent is None else parent.depth + 1, body=body,
        )

    def post(self, body="Hola", parent=None, song=None):
        data = {"body": body}
        if parent is not None:
            data["parent"] = parent.pk
        return self.client.post(self.list_url(song), data, format="json")

    def listed(self):
        response = self.client.get(self.list_url())
        self.assertEqual(response.status_code, 200)
        return response.json()

    def unpublish(self):
        self.song.visibility = Visibility.PRIVATE
        self.song.public_file_key = ""
        self.song.published_at = None
        self.song.save()

    # --- Acceso ---

    def test_requires_authentication(self):
        comment = self.comment()
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.list_url()).status_code, 401)
        self.assertEqual(self.post().status_code, 401)
        self.assertEqual(self.client.patch(self.detail_url(comment), {"body": "x"}, format="json").status_code, 401)
        self.assertEqual(self.client.delete(self.detail_url(comment)).status_code, 401)

    def test_comments_of_a_private_or_unknown_song_are_404(self):
        private = self.make_song(self.beto, public=False)
        gone = self.make_song(self.beto)
        url = self.list_url(gone)
        gone.delete()

        self.assertEqual(self.client.get(self.list_url(private)).status_code, 404)
        self.assertEqual(self.post(song=private).status_code, 404)
        self.assertEqual(self.client.get(url).status_code, 404)

    # --- Listado ---

    def test_lists_flat_in_chronological_order_with_the_parent_id(self):
        root = self.comment("raíz")
        reply = self.comment("respuesta", author=self.carla, parent=root)

        items = self.listed()

        self.assertEqual([c["id"] for c in items], [root.pk, reply.pk])
        self.assertIsNone(items[0]["parent"])
        self.assertEqual(items[1]["parent"], root.pk)
        self.assertEqual(items[1]["depth"], 1)
        self.assertEqual(items[1]["author"], "carla")

    def test_only_comments_of_this_song_are_listed(self):
        other = self.make_song(self.beto, title="Otra")
        self.comment("de esta")
        self.comment("de otra", song=other)

        self.assertEqual([c["body"] for c in self.listed()], ["de esta"])

    def test_permission_flags_depend_on_who_is_looking(self):
        self.comment("mío", author=self.ana)
        self.comment("de Carla", author=self.carla)

        def flags():
            return {c["body"]: (c["is_mine"], c["can_edit"], c["can_delete"]) for c in self.listed()}

        self.assertEqual(flags(), {"mío": (True, True, True), "de Carla": (False, False, False)})
        self.client.force_authenticate(self.beto)  # dueño de la canción: puede moderar todo
        self.assertEqual(flags(), {"mío": (False, False, True), "de Carla": (False, False, True)})

    # --- Crear ---

    def test_post_a_top_level_comment(self):
        response = self.post("  Qué temazo  ")

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["body"], "Qué temazo")  # sin espacios sobrantes
        self.assertEqual(body["author"], "ana")
        self.assertIsNone(body["parent"])
        self.assertEqual(body["depth"], 0)
        self.assertTrue(body["is_mine"])
        self.assertFalse(body["by_song_owner"])
        self.assertTrue(Comment.objects.filter(song=self.song, author=self.ana).exists())

    def test_reply_increases_the_depth(self):
        root = self.comment("raíz", author=self.carla)

        response = self.post("respuesta", parent=root)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["parent"], root.pk)
        self.assertEqual(response.json()["depth"], 1)

    def test_replies_stop_at_the_maximum_depth(self):
        node = self.comment("raíz")
        for _ in range(MAX_DEPTH):
            node = self.comment("nivel", parent=node)
        self.assertEqual(node.depth, MAX_DEPTH)

        response = self.post("demasiado profundo", parent=node)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "max_depth")
        self.assertEqual(self.post("todavía cabe", parent=node.parent).status_code, 201)

    def test_invalid_bodies_are_rejected(self):
        for bad in ["", "   ", "x" * 1001]:
            with self.subTest(body=bad[:10]):
                self.assertEqual(self.post(bad).status_code, 400)
        self.assertEqual(self.client.post(self.list_url(), {}, format="json").status_code, 400)
        self.assertFalse(Comment.objects.exists())

    def test_the_parent_must_exist_in_this_song_and_not_be_deleted(self):
        other = self.make_song(self.beto, title="Otra")
        elsewhere = self.comment("de otra canción", song=other)
        deleted = self.comment("borrado")
        deleted.is_deleted, deleted.body = True, ""
        deleted.save()

        for parent in (elsewhere, deleted):
            with self.subTest(parent=parent.pk):
                response = self.post("respuesta", parent=parent)
                self.assertEqual(response.status_code, 404)
                self.assertEqual(response.json()["code"], "not_found")
        self.assertEqual(
            self.client.post(self.list_url(), {"body": "x", "parent": 999999}, format="json").status_code, 404
        )

    def test_the_owner_cannot_open_threads_on_their_own_song_but_can_reply(self):
        root = self.comment("de Ana")
        self.client.force_authenticate(self.beto)

        top = self.post("mi propio hilo")
        self.assertEqual(top.status_code, 403)
        self.assertEqual(top.json()["code"], "owner_cannot_comment")

        reply = self.post("gracias", parent=root)
        self.assertEqual(reply.status_code, 201)
        self.assertTrue(reply.json()["by_song_owner"])

    def test_the_owner_policy_can_be_made_read_only(self):
        root = self.comment("de Ana")
        self.client.force_authenticate(self.beto)

        with mock.patch("community.services.OWNER_MAY_REPLY", False):
            response = self.post("gracias", parent=root)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "owner_cannot_comment")

    # --- Editar ---

    def test_the_author_edits_and_the_edit_is_marked(self):
        comment = self.comment("original")

        response = self.client.patch(self.detail_url(comment), {"body": "  editado  "}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["body"], "editado")
        self.assertIsNotNone(response.json()["edited_at"])
        comment.refresh_from_db()
        self.assertEqual(comment.body, "editado")

    def test_saving_the_same_text_does_not_mark_an_edit(self):
        comment = self.comment("igual")
        response = self.client.patch(self.detail_url(comment), {"body": "igual"}, format="json")
        self.assertIsNone(response.json()["edited_at"])

    def test_only_the_author_can_edit_not_even_the_song_owner(self):
        comment = self.comment("de Ana")
        for user in (self.carla, self.beto):
            self.client.force_authenticate(user)
            response = self.client.patch(self.detail_url(comment), {"body": "robado"}, format="json")
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.json()["code"], "forbidden")
        comment.refresh_from_db()
        self.assertEqual(comment.body, "de Ana")

    def test_cannot_edit_a_deleted_comment_or_with_an_invalid_body(self):
        comment = self.comment("a")
        self.assertEqual(self.client.patch(self.detail_url(comment), {"body": " "}, format="json").status_code, 400)
        comment.is_deleted, comment.body = True, ""
        comment.save()
        self.assertEqual(self.client.patch(self.detail_url(comment), {"body": "x"}, format="json").status_code, 404)

    # --- Eliminar ---

    def test_deleting_a_comment_without_replies_removes_it(self):
        comment = self.comment()
        self.assertEqual(self.client.delete(self.detail_url(comment)).status_code, 204)
        self.assertFalse(Comment.objects.exists())

    def test_deleting_a_comment_with_replies_keeps_the_thread(self):
        root = self.comment("raíz")
        reply = self.comment("respuesta", author=self.carla, parent=root)

        self.assertEqual(self.client.delete(self.detail_url(root)).status_code, 204)

        by_id = {c["id"]: c for c in self.listed()}
        self.assertTrue(by_id[root.pk]["is_deleted"])
        self.assertEqual(by_id[root.pk]["body"], "")
        self.assertIsNone(by_id[root.pk]["author"])
        self.assertFalse(by_id[root.pk]["can_delete"])
        self.assertEqual(by_id[reply.pk]["parent"], root.pk)
        self.assertEqual(by_id[reply.pk]["body"], "respuesta")

    def test_deleting_the_last_reply_also_removes_a_deleted_parent(self):
        root = self.comment("raíz")
        reply = self.comment("respuesta", author=self.carla, parent=root)
        self.client.delete(self.detail_url(root))  # queda como "eliminado"
        self.client.force_authenticate(self.carla)

        self.assertEqual(self.client.delete(self.detail_url(reply)).status_code, 204)

        self.assertFalse(Comment.objects.exists())

    def test_the_song_owner_can_delete_any_comment(self):
        comment = self.comment("de Ana")
        self.client.force_authenticate(self.beto)
        self.assertEqual(self.client.delete(self.detail_url(comment)).status_code, 204)
        self.assertFalse(Comment.objects.exists())

    def test_a_third_party_cannot_delete(self):
        comment = self.comment("de Ana")
        self.client.force_authenticate(self.carla)

        response = self.client.delete(self.detail_url(comment))

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "forbidden")
        self.assertTrue(Comment.objects.filter(pk=comment.pk).exists())

    def test_deleting_twice_is_idempotent(self):
        root = self.comment("raíz")
        self.comment("respuesta", author=self.carla, parent=root)
        self.assertEqual(self.client.delete(self.detail_url(root)).status_code, 204)
        self.assertEqual(self.client.delete(self.detail_url(root)).status_code, 204)

    def test_unknown_comment_is_404(self):
        comment = self.comment()
        url = self.detail_url(comment)
        comment.delete()
        self.assertEqual(self.client.delete(url).status_code, 404)

    # --- Relación con la visibilidad de la canción ---

    def test_unpublishing_hides_the_comments_and_republishing_restores_them(self):
        comment = self.comment("sigue aquí")
        self.unpublish()

        self.assertEqual(self.client.get(self.list_url()).status_code, 404)
        self.assertEqual(self.post("x").status_code, 404)
        self.assertEqual(self.client.patch(self.detail_url(comment), {"body": "x"}, format="json").status_code, 404)
        self.assertEqual(self.client.delete(self.detail_url(comment)).status_code, 404)

        self.song.visibility = Visibility.PUBLIC
        self.song.public_file_key = PUBLIC_KEY
        self.song.published_at = timezone.now()
        self.song.save()

        self.assertEqual([c["body"] for c in self.listed()], ["sigue aquí"])

    def test_a_blocked_owner_hides_the_comments(self):
        self.comment()
        self.beto.is_active = False
        self.beto.save()
        self.assertEqual(self.client.get(self.list_url()).status_code, 404)

    def test_deleting_the_song_deletes_its_comments(self):
        root = self.comment("raíz")
        self.comment("respuesta", author=self.carla, parent=root)

        self.song.delete()

        self.assertFalse(Comment.objects.exists())