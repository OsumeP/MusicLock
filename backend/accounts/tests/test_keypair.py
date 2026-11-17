"""
Par de claves para compartir (día 16). El navegador genera RSA-OAEP 3072 y envía
la pública (SPKI) y la privada envuelta con su Master Key; aquí se simulan con
bytes del formato correcto.
"""

import base64
import os

from django.urls import reverse

from accounts.crypto_fields import RSA_SPKI_PREFIX
from accounts.models import User

from .test_auth_api import AuthApiTestCase, b64
from .test_change_password import new_material


def fake_public_key() -> str:
    return base64.b64encode(RSA_SPKI_PREFIX + os.urandom(422 - len(RSA_SPKI_PREFIX))).decode()


def keypair(**overrides):
    data = {"public_key": fake_public_key(), "wrapped_private_key": b64(1810), "private_key_iv": b64(12)}
    data.update(overrides)
    return data


class KeyPairTests(AuthApiTestCase):
    def setUp(self):
        super().setUp()
        self.data, response = self.register()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}")

    def put(self, data):
        return self.client.put(reverse("me-keypair"), data, format="json")

    def test_new_account_has_no_keypair(self):
        self.assertFalse(self.client.get(reverse("me")).json()["has_keypair"])
        response = self.client.get(reverse("me-keypair"))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["code"], "no_keypair")

    def test_store_and_read_back_the_keypair(self):
        data = keypair()

        response = self.put(data)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.client.get(reverse("me-keypair")).json(), data)
        self.assertTrue(self.client.get(reverse("me")).json()["has_keypair"])
        user = User.objects.get()
        self.assertEqual((user.public_key, user.private_key_iv), (data["public_key"], data["private_key_iv"]))

    def test_keypair_cannot_be_replaced(self):
        first = keypair()
        self.put(first)

        response = self.put(keypair())

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "keypair_exists")
        self.assertEqual(User.objects.get().public_key, first["public_key"])

    def test_rejects_malformed_material(self):
        not_rsa = base64.b64encode(os.urandom(422)).decode()
        cases = {
            "public_key": [not_rsa, b64(300), "no-es-base64!!"],
            "wrapped_private_key": [b64(48), b64(4000)],
            "private_key_iv": [b64(16)],
        }
        for field, values in cases.items():
            for value in values:
                with self.subTest(field=field, value=value[:12]):
                    response = self.put(keypair(**{field: value}))
                    self.assertEqual(response.status_code, 400)
                    self.assertIn(field, response.json())
        self.assertFalse(User.objects.get().has_keypair)

    def test_requires_a_session(self):
        self.client.credentials()
        self.assertEqual(self.client.get(reverse("me-keypair")).status_code, 401)
        self.assertEqual(self.put(keypair()).status_code, 401)

    def test_password_change_keeps_the_keypair(self):
        """La privada va envuelta con la Master Key, que no cambia al cambiar la contraseña."""
        data = keypair()
        self.put(data)

        changed = self.client.post(reverse("me-password"), new_material(self.data["auth_key"]), format="json")

        self.assertEqual(changed.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {changed.json()['access']}")
        self.assertEqual(self.client.get(reverse("me-keypair")).json(), data)
