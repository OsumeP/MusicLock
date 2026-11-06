from unittest import mock

from django.db.utils import OperationalError
from django.test import TestCase
from django.urls import reverse

from vault.tests.helpers import TempLocalStorageMixin


class HealthEndpointTests(TempLocalStorageMixin, TestCase):
    def test_health_is_public_and_reports_ok(self):
        response = self.client.get(reverse("health"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"status": "ok", "service": "musiclock-api", "database": "ok", "storage": "ok"},
        )

    def test_health_reports_degraded_when_database_fails(self):
        with mock.patch("core.views.connection.cursor", side_effect=OperationalError):
            response = self.client.get(reverse("health"))

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["database"], "error")

    def test_health_reports_degraded_when_storage_fails(self):
        with mock.patch("core.views.get_blob_storage", side_effect=RuntimeError("down")):
            response = self.client.get(reverse("health"))

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["storage"], "error")
