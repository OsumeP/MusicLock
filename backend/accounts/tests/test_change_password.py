"""
Cambio de contraseña (día 14): el navegador re-envuelve la Master Key con la KEK
de la nueva contraseña; el servidor exige el authKey actual, guarda el material
nuevo y cierra las demás sesiones. Los valores cripto se simulan con bytes
aleatorios del tamaño correcto (el servidor no puede distinguirlos).
"""

from unittest import mock

from django.core.cache import cache
from django.urls import reverse
from rest_framework.throttling import ScopedRateThrottle

from accounts.models import User

from .test_auth_api import AuthApiTestCase, b64


def new_material(current_auth_key, **overrides):
    data = {
        "current_auth_key": current_auth_key,
        "new_auth_key": b64(32),
        "kdf_salt": b64(16),
        "kdf_params": {"alg": "PBKDF2-SHA256", "iterations": 600_000},
        "wrapped_master_key": b64(48),
        "master_key_iv": b64(12),
    }
    data.update(overrides)
    return data


class ChangePasswordTests(AuthApiTestCase):
    def setUp(self):
        super().setUp()
        self.data, response = self.register()
        self.tokens = response.json()
        # Una segunda sesión de Ana (otro navegador).
        self.other = self.login(self.data["email"], self.data["auth_key"]).json()

    def use(self, access):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def change(self, payload, access=None):
        self.use(access or self.tokens["access"])
        return self.client.post(reverse("me-password"), payload, format="json")

    def refresh(self, token):
        self.client.credentials()
        return self.client.post(reverse("auth-refresh"), {"refresh": token}, format="json")

    # --- Paso 1: material de claves ------------------------------------------------

    def test_key_material_requires_the_current_auth_key(self):
        self.use(self.tokens["access"])

        ok = self.client.post(reverse("me-vault"), {"auth_key": self.data["auth_key"]}, format="json")
        wrong = self.client.post(reverse("me-vault"), {"auth_key": b64(32)}, format="json")

        self.assertEqual(ok.status_code, 200)
        self.assertEqual(
            ok.json(),
            {key: self.data[key] for key in ("kdf_salt", "kdf_params", "wrapped_master_key", "master_key_iv")},
        )
        # 400 y no 401: el cliente no debe tomarlo por un token caducado.
        self.assertEqual(wrong.status_code, 400)
        self.assertEqual(wrong.json()["code"], "invalid_password")

    def test_key_material_requires_a_session(self):
        response = self.client.post(reverse("me-vault"), {"auth_key": self.data["auth_key"]}, format="json")
        self.assertEqual(response.status_code, 401)

    # --- Paso 2: cambio -----------------------------------------------------------

    def test_change_stores_new_material_and_returns_a_new_session(self):
        payload = new_material(self.data["auth_key"])

        response = self.change(payload)

        self.assertEqual(response.status_code, 200, response.data)
        body = response.json()
        self.assertEqual(set(body), {"access", "refresh", "user", "vault"})
        self.assertEqual(body["vault"]["wrapped_master_key"], payload["wrapped_master_key"])
        self.assertNotIn(payload["new_auth_key"], response.content.decode())

        user = User.objects.get(email=self.data["email"])
        self.assertTrue(user.check_password(payload["new_auth_key"]))
        self.assertFalse(user.check_password(self.data["auth_key"]))
        self.assertEqual(user.kdf_salt, payload["kdf_salt"])
        self.assertEqual(user.master_key_iv, payload["master_key_iv"])

        # El prelogin devuelve ya el salt nuevo; la contraseña anterior no sirve.
        prelogin = self.client.post(reverse("auth-prelogin"), {"email": self.data["email"]}, format="json")
        self.assertEqual(prelogin.json()["kdf_salt"], payload["kdf_salt"])
        self.assertEqual(self.login(self.data["email"], self.data["auth_key"]).status_code, 401)
        self.assertEqual(self.login(self.data["email"], payload["new_auth_key"]).status_code, 200)

    def test_wrong_current_password_changes_nothing(self):
        before = User.objects.get(email=self.data["email"])

        response = self.change(new_material(b64(32)))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "invalid_password")
        after = User.objects.get(email=self.data["email"])
        self.assertEqual((after.password, after.kdf_salt, after.wrapped_master_key), (before.password, before.kdf_salt, before.wrapped_master_key))
        self.assertEqual(self.refresh(self.other["refresh"]).status_code, 200)  # las sesiones siguen

    def test_other_sessions_are_closed_and_the_new_one_works(self):
        new = self.change(new_material(self.data["auth_key"])).json()

        # Otro navegador: ni su access token ni su refresh token sirven.
        self.use(self.other["access"])
        self.assertEqual(self.client.get(reverse("me")).status_code, 401)
        self.assertEqual(self.refresh(self.other["refresh"]).status_code, 401)
        # La sesión que hizo el cambio tampoco conserva sus tokens anteriores…
        self.use(self.tokens["access"])
        self.assertEqual(self.client.get(reverse("me")).status_code, 401)
        self.assertEqual(self.refresh(self.tokens["refresh"]).status_code, 401)
        # …pero los nuevos funcionan y se pueden renovar.
        self.use(new["access"])
        self.assertEqual(self.client.get(reverse("me")).status_code, 200)
        self.assertEqual(self.refresh(new["refresh"]).status_code, 200)

    def test_rejects_malformed_material_and_reused_auth_key(self):
        cases = {
            "wrapped_master_key": b64(32),
            "kdf_salt": "no-es-base64!!",
            "kdf_params": {"alg": "PBKDF2-SHA256", "iterations": 1000},
            "new_auth_key": self.data["auth_key"],  # sin salt nuevo saldría igual
        }
        for field, value in cases.items():
            with self.subTest(field=field):
                response = self.change(new_material(self.data["auth_key"], **{field: value}))
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json())
        self.assertTrue(User.objects.get(email=self.data["email"]).check_password(self.data["auth_key"]))

    def test_attempts_are_throttled_per_user(self):
        cache.clear()
        with mock.patch.object(ScopedRateThrottle, "THROTTLE_RATES", {"auth": "2/min"}):
            statuses = [self.change(new_material(b64(32))).status_code for _ in range(3)]
        self.assertEqual(statuses, [400, 400, 429])
