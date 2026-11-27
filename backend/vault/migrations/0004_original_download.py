import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("vault", "0003_listening_history"),
        ("accounts", "0004_plan_limits"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="OriginalDownload",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("downloaded_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="original_downloads",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "original download",
                "verbose_name_plural": "original downloads",
                "ordering": ["-downloaded_at", "-id"],
                "indexes": [models.Index(fields=["user", "downloaded_at"], name="vault_orig_user_id_0fc36c_idx")],
            },
        ),
    ]
