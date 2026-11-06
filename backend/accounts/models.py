"""
Modelos de cuentas: planes de suscripción y usuarios.

Los valores binarios del material criptográfico (salt, IVs, claves envueltas) se
guardan en **base64** como texto: así viajan tal cual en JSON entre el navegador
y la API. El servidor nunca puede usarlos para descifrar nada (PlanMVP §4).
"""

from django.contrib.auth.models import AbstractUser
from django.db import models

MiB = 1024 * 1024
GiB = 1024 * MiB


class Plan(models.Model):
    """Plan de suscripción con sus límites (BR-07, BR-08, BR-10)."""

    FREE = "free"
    PREMIUM = "premium"
    CODE_CHOICES = [(FREE, "Free"), (PREMIUM, "Premium")]

    code = models.SlugField(unique=True, choices=CODE_CHOICES)
    name = models.CharField(max_length=100)
    monthly_price = models.PositiveIntegerField(default=0, help_text="Precio mensual en COP.")
    max_storage_bytes = models.BigIntegerField()
    max_file_size_bytes = models.BigIntegerField()

    class Meta:
        ordering = ["max_storage_bytes"]

    def __str__(self) -> str:
        return self.name

    @classmethod
    def default(cls) -> "Plan":
        """Plan asignado a toda cuenta nueva (BR-07: Free por defecto)."""
        return cls.objects.get(code=cls.FREE)


class User(AbstractUser):
    """
    Cuenta de MusicLock. Se inicia sesión con el email.

    El campo `password` (heredado) guarda el hash del *authKey* derivado en el
    navegador, nunca la contraseña real (decisión D1).
    """

    email = models.EmailField("email", unique=True)
    active_plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="users")
    used_storage = models.BigIntegerField(default=0, help_text="Bytes cifrados almacenados.")

    # Material criptográfico (todo en base64). Vacío solo en cuentas creadas por
    # `createsuperuser`, que sirven para el admin pero no tienen bóveda.
    kdf_salt = models.CharField(max_length=64, blank=True)
    kdf_params = models.JSONField(default=dict, blank=True)
    wrapped_master_key = models.TextField(blank=True)
    master_key_iv = models.CharField(max_length=32, blank=True)
    public_key = models.TextField(blank=True, help_text="Reservado para compartir (backlog, BR-21).")

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    def save(self, *args, **kwargs):
        if self.active_plan_id is None:
            self.active_plan = Plan.default()
        super().save(*args, **kwargs)

    # --- Reglas de cuota (BR-09, BR-10) -----------------------------------------

    @property
    def storage_limit(self) -> int:
        return self.active_plan.max_storage_bytes

    @property
    def storage_available(self) -> int:
        return max(self.storage_limit - self.used_storage, 0)

    def can_store(self, size_bytes: int) -> bool:
        """¿Cabe un archivo de este tamaño según el plan? (tamaño máximo y cuota)."""
        return (
            0 < size_bytes <= self.active_plan.max_file_size_bytes
            and size_bytes <= self.storage_available
        )

    @property
    def has_vault(self) -> bool:
        """True si la cuenta tiene material de claves (se registró desde la app)."""
        return bool(self.wrapped_master_key)
