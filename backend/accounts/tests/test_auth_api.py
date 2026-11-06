"""
Tests de los endpoints de autenticación. El navegador real envía valores
derivados con Web Crypto; aquí se simulan con bytes aleatorios del tamaño
correcto (el servidor no puede distinguirlos, que es justo la idea).
"""

import base64
import os
from unittest import mock

from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle

from accounts.models import Plan, User


def b64(num_bytes: int) -> str:
    return base64.b64encode(os.urandom(num_bytes)).decode()


def registration(email="ana@example.com", username="ana", **overrides):
    data = {
        "email": email,
        "username": username,
        "auth_key": b64(32),
        "kdf_salt": b64(16),
        "kdf_params": {"alg": "PBKDF2-SHA256", "iterations": 600_000},
        "wrapped_master_key": b64(48),
        "master_key_iv": b64(12),
    }
    data.update(overrides)
    return data


class AuthApiTestCase(APITestCase):
    def setUp(self):
        cache.clear()  # reinicia los contadores del límite de peticiones

    def register(self, **kwargs):
        data = registration(**kwargs)
        response = self.client.post(reverse("auth-register"), data, format="json")
        return data, response

    def login(self, email, auth_key):
        return self.client.post(reverse("auth-login"), {"email": email, "auth_key": auth_key}, format="json")


class RegisterTests(AuthApiTestCase):
    def test_register_creates_free_account_with_vault_and_opens_session(self):
        data, response = self.register()

        self.assertEqual(response.status_code, 201, response.data)
        body = response.json()
        self.assertEqual(set(body), {"access", "refresh", "user", "vault"})
        self.assertEqual(body["user"]["email"], "ana@example.com")
        self.assertEqual(body["user"]["plan"]["code"], Plan.FREE)
        self.assertEqual(body["vault"]["wrapped_master_key"], data["wrapped_master_key"])

        user = User.objects.get(email="ana@example.com")
        self.assertTrue(user.has_vault)
        self.assertEqual(user.kdf_salt, data["kdf_salt"])
        self.assertTrue(user.check_password(data["auth_key"]))
        self.assertNotIn(data["auth_key"], user.password)  # se guarda el hash, no el authKey

    def test_register_never_returns_the_auth_key(self):
        data, response = self.register()
        self.assertNotIn(data["auth_key"], response.content.decode())

    def test_email_is_case_insensitive_and_unique(self):
        self.register(email="Ana@Example.com")
        _, response = self.register(email="ana@example.COM", username="otra")

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json())
        self.assertEqual(User.objects.get().email, "ana@example.com")

    def test_username_is_unique_ignoring_case(self):
        self.register()
        _, response = self.register(email="otra@example.com", username="ANA")
        self.assertEqual(response.status_code, 400)
        self.assertIn("username", response.json())

    def test_rejects_malformed_crypto_material(self):
        cases = {
            "auth_key": b64(16),  # tamaño incorrecto
            "kdf_salt": "no-es-base64!!",
            "master_key_iv": b64(16),
            "wrapped_master_key": b64(32),
        }
        for field, value in cases.items():
            with self.subTest(field=field):
                _, response = self.register(email=f"{field}@example.com", username=field, **{field: value})
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json())

    def test_rejects_weak_or_unknown_kdf_params(self):
        for params in [
            {"alg": "PBKDF2-SHA256", "iterations": 1000},
            {"alg": "MD5", "iterations": 600_000},
            {"alg": "PBKDF2-SHA256", "iterations": True},
            {"alg": "PBKDF2-SHA256", "iterations": 600_000, "extra": 1},
        ]:
            with self.subTest(params=params):
                _, response = self.register(kdf_params=params)
                self.assertEqual(response.status_code, 400)
                self.assertIn("kdf_params", response.json())


class PreloginTests(AuthApiTestCase):
    def prelogin(self, email):
        return self.client.post(reverse("auth-prelogin"), {"email": email}, format="json")

    def test_returns_the_users_salt_and_params(self):
        data, _ = self.register()

        response = self.prelogin("ANA@example.com")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"kdf_salt": data["kdf_salt"], "kdf_params": data["kdf_params"]})

    def test_unknown_email_gets_a_fake_but_stable_salt(self):
        first = self.prelogin("nadie@example.com").json()
        second = self.prelogin("nadie@example.com").json()
        other = self.prelogin("otro@example.com").json()

        self.assertEqual(first, second)  # no se distingue de una cuenta real
        self.assertNotEqual(first["kdf_salt"], other["kdf_salt"])
        self.assertEqual(len(base64.b64decode(first["kdf_salt"])), 16)
        self.assertEqual(first["kdf_params"], {"alg": "PBKDF2-SHA256", "iterations": 600_000})

    def test_admin_accounts_without_vault_look_unknown(self):
        User.objects.create_superuser(username="admin", email="admin@example.com", password="x")
        self.assertEqual(self.prelogin("admin@example.com").json(), self.prelogin("admin@example.com").json())
        self.assertNotEqual(self.prelogin("admin@example.com").json()["kdf_salt"], "")


class LoginTests(AuthApiTestCase):
    def test_login_with_correct_auth_key_returns_tokens_and_wrapped_master_key(self):
        data, _ = self.register()

        response = self.login("ana@example.com", data["auth_key"])

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["vault"], {"wrapped_master_key": data["wrapped_master_key"], "master_key_iv": data["master_key_iv"]})
        self.assertTrue(body["access"] and body["refresh"])
        self.assertIsNotNone(User.objects.get().last_login)

    def test_wrong_auth_key_and_unknown_email_get_the_same_error(self):
        self.register()

        wrong = self.login("ana@example.com", b64(32))
        unknown = self.login("nadie@example.com", b64(32))

        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(wrong.json(), unknown.json())
        self.assertEqual(unknown.status_code, 401)

    def test_blocked_account_cannot_log_in(self):
        data, _ = self.register()
        User.objects.filter(email="ana@example.com").update(is_active=False)  # bloqueo desde el admin

        response = self.login("ana@example.com", data["auth_key"])

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "account_blocked")

    def test_admin_without_vault_cannot_log_into_the_app(self):
        User.objects.create_superuser(username="admin", email="admin@example.com", password="x")
        self.assertEqual(self.login("admin@example.com", b64(32)).status_code, 401)

    # DRF lee las tasas al importar la clase, por eso se parchea la clase y no settings.
    @mock.patch.object(ScopedRateThrottle, "THROTTLE_RATES", {"auth": "3/min"})
    def test_repeated_attempts_are_throttled(self):
        statuses = [self.login("ana@example.com", b64(32)).status_code for _ in range(4)]
        self.assertEqual(statuses, [401, 401, 401, 429])


class SessionTests(AuthApiTestCase):
    def setUp(self):
        super().setUp()
        self.data, response = self.register()
        self.tokens = response.json()

    def auth(self, access):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def refresh(self, token):
        return self.client.post(reverse("auth-refresh"), {"refresh": token}, format="json")

    def test_me_requires_authentication(self):
        self.assertEqual(self.client.get(reverse("me")).status_code, 401)

    def test_me_returns_profile_plan_and_storage(self):
        self.auth(self.tokens["access"])

        body = self.client.get(reverse("me")).json()

        self.assertEqual(body["email"], "ana@example.com")
        self.assertEqual(body["used_storage"], 0)
        self.assertEqual(body["storage_available"], 500 * 1024 * 1024)
        self.assertEqual(body["plan"]["max_file_size_bytes"], 20 * 1024 * 1024)

    def test_refresh_rotates_and_old_refresh_token_stops_working(self):
        response = self.refresh(self.tokens["refresh"])

        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.json()["refresh"], self.tokens["refresh"])
        self.assertEqual(self.refresh(self.tokens["refresh"]).status_code, 401)  # FR-03 + blacklist

    def test_logout_invalidates_the_refresh_token_and_is_idempotent(self):
        logout = lambda: self.client.post(reverse("auth-logout"), {"refresh": self.tokens["refresh"]}, format="json")

        self.assertEqual(logout().status_code, 204)
        self.assertEqual(self.refresh(self.tokens["refresh"]).status_code, 401)  # FR-04
        self.assertEqual(logout().status_code, 204)

    def test_blocked_user_cannot_refresh_or_use_access_token(self):
        User.objects.filter(email="ana@example.com").update(is_active=False)

        self.assertEqual(self.refresh(self.tokens["refresh"]).status_code, 401)
        self.auth(self.tokens["access"])
        self.assertEqual(self.client.get(reverse("me")).status_code, 401)  # BR-06

    def test_refresh_for_deleted_user_is_401_not_500(self):
        User.objects.all().delete()
        self.assertEqual(self.refresh(self.tokens["refresh"]).status_code, 401)
