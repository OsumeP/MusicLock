from django.db import IntegrityError
from django.test import TestCase

from accounts.models import GiB, MiB, Plan, User


class PlanSeedTests(TestCase):
    def test_free_and_premium_plans_are_seeded_with_business_limits(self):
        free = Plan.objects.get(code=Plan.FREE)
        premium = Plan.objects.get(code=Plan.PREMIUM)

        self.assertEqual((free.max_storage_bytes, free.max_file_size_bytes), (500 * MiB, 20 * MiB))
        self.assertEqual((premium.max_storage_bytes, premium.max_file_size_bytes), (5 * GiB, 100 * MiB))


class UserModelTests(TestCase):
    def make_user(self, email="ana@example.com", **extra):
        return User.objects.create_user(username=email.split("@")[0], email=email, password="x", **extra)

    def test_new_users_get_the_free_plan(self):
        self.assertEqual(self.make_user().active_plan.code, Plan.FREE)  # BR-07

    def test_email_is_unique_and_is_the_login_field(self):
        self.make_user()
        self.assertEqual(User.USERNAME_FIELD, "email")
        with self.assertRaises(IntegrityError):
            User.objects.create_user(username="otra", email="ana@example.com", password="x")

    def test_password_is_never_stored_in_plain_text(self):
        user = User.objects.create_user(username="ana", email="ana@example.com", password="authKey-b64")
        self.assertNotIn("authKey-b64", user.password)
        self.assertTrue(user.check_password("authKey-b64"))

    def test_can_store_enforces_file_size_and_quota(self):
        user = self.make_user()

        self.assertTrue(user.can_store(20 * MiB))
        self.assertFalse(user.can_store(20 * MiB + 1))  # BR-10: máx. 20 MB por archivo en Free
        self.assertFalse(user.can_store(0))

        user.used_storage = 490 * MiB
        self.assertEqual(user.storage_available, 10 * MiB)
        self.assertTrue(user.can_store(10 * MiB))
        self.assertFalse(user.can_store(10 * MiB + 1))  # BR-09: cuota excedida

    def test_premium_limits_apply_after_upgrade(self):
        user = self.make_user(active_plan=Plan.objects.get(code=Plan.PREMIUM))
        self.assertTrue(user.can_store(100 * MiB))

    def test_has_vault_only_with_key_material(self):
        self.assertFalse(self.make_user().has_vault)
        self.assertTrue(self.make_user("beto@example.com", wrapped_master_key="d3JhcHBlZA==").has_vault)

    def test_superuser_can_be_created_without_vault(self):
        admin = User.objects.create_superuser(username="admin", email="admin@example.com", password="x")
        self.assertTrue(admin.is_superuser)
        self.assertEqual(admin.active_plan.code, Plan.FREE)
