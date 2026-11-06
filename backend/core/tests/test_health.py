from unittest import mock

from django.db.utils import OperationalError
from django.test import TestCase
from django.urls import reverse


class HealthEndpointTests(TestCase):
    def test_health_is_public_and_reports_ok(self):
        response = self.client.get(reverse("health"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"status": "ok", "service": "musiclock-api", "database": "ok"},
        )

    def test_health_reports_degraded_when_database_fails(self):
        with mock.patch("core.views.connection.cursor", side_effect=OperationalError):
            response = self.client.get(reverse("health"))

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["database"], "error")
