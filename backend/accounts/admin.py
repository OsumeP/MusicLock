from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.template.defaultfilters import filesizeformat

from .models import Plan, User


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "monthly_price", "storage", "file_size")

    @admin.display(description="Almacenamiento")
    def storage(self, plan):
        return filesizeformat(plan.max_storage_bytes)

    @admin.display(description="Máx. por archivo")
    def file_size(self, plan):
        return filesizeformat(plan.max_file_size_bytes)


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """Admin de usuarios. Desmarcar `is_active` bloquea la cuenta (BR-06)."""

    list_display = ("email", "username", "active_plan", "storage_used", "is_active", "date_joined")
    list_filter = ("active_plan", "is_active", "is_staff")
    search_fields = ("email", "username")
    ordering = ("-date_joined",)

    crypto_fields = (
        "kdf_salt",
        "kdf_params",
        "wrapped_master_key",
        "master_key_iv",
        "public_key",
        "wrapped_private_key",
        "private_key_iv",
    )
    readonly_fields = ("used_storage", *crypto_fields, "last_login", "date_joined")

    fieldsets = (
        (None, {"fields": ("email", "username", "password")}),
        ("Plan y almacenamiento", {"fields": ("active_plan", "used_storage")}),
        (
            "Material criptográfico (envuelto; el servidor no puede usarlo)",
            {"fields": crypto_fields, "classes": ("collapse",)},
        ),
        ("Estado", {"fields": ("is_active", "is_staff", "is_superuser", "last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "username", "password1", "password2")}),
    )

    @admin.display(description="Usado", ordering="used_storage")
    def storage_used(self, user):
        return filesizeformat(user.used_storage)
