from django.test import TestCase

from faq.models import FAQ


class FAQApiTests(TestCase):
    def test_list_is_public(self):
        response = self.client.get("/api/faq/")
        self.assertEqual(response.status_code, 200)

    def test_inactive_questions_are_hidden(self):
        FAQ.objects.create(question="Oculta", answer="x", is_active=False)
        response = self.client.get("/api/faq/")
        questions = [item["question"] for item in response.json()]
        self.assertNotIn("Oculta", questions)