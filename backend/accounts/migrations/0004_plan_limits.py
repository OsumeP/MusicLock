from django.db import migrations, models


def set_plan_limits(apps, schema_editor):
    Plan = apps.get_model("accounts", "Plan")
    Plan.objects.filter(code="free").update(
        max_monthly_downloads=10,
        max_shared_recipients=5,
    )
    Plan.objects.filter(code="premium").update(
        max_monthly_downloads=None,
        max_shared_recipients=None,
    )


def clear_plan_limits(apps, schema_editor):
    Plan = apps.get_model("accounts", "Plan")
    Plan.objects.all().update(max_monthly_downloads=None, max_shared_recipients=None)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_keypair"),
    ]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="max_monthly_downloads",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="plan",
            name="max_shared_recipients",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.RunPython(set_plan_limits, clear_plan_limits),
    ]
