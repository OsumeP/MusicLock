"""Datos semilla de los planes (BR-07, BR-08, BR-10). Editables desde el admin."""

from django.db import migrations

MiB = 1024 * 1024
GiB = 1024 * MiB

PLANS = [
    # El precio de Premium es un valor provisional: el equipo aún no lo ha definido.
    {"code": "free", "name": "Free", "monthly_price": 0, "max_storage_bytes": 500 * MiB, "max_file_size_bytes": 20 * MiB},
    {"code": "premium", "name": "Premium", "monthly_price": 9900, "max_storage_bytes": 5 * GiB, "max_file_size_bytes": 100 * MiB},
]


def create_plans(apps, schema_editor):
    Plan = apps.get_model("accounts", "Plan")
    for plan in PLANS:
        Plan.objects.update_or_create(code=plan["code"], defaults=plan)


def delete_plans(apps, schema_editor):
    Plan = apps.get_model("accounts", "Plan")
    Plan.objects.filter(code__in=[p["code"] for p in PLANS]).delete()


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]

    operations = [migrations.RunPython(create_plans, delete_plans)]
