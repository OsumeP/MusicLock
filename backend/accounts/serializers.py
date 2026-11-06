from django.contrib.auth.validators import UnicodeUsernameValidator
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.exceptions import AuthenticationFailed

from .crypto_fields import (
    AUTH_KEY_BYTES,
    IV_BYTES,
    SALT_BYTES,
    WRAPPED_KEY_BYTES,
    Base64BytesField,
    KdfParamsField,
)
from .models import Plan, User
from .services import normalize_email


class PreloginSerializer(serializers.Serializer):
    email = serializers.EmailField()


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=150)
    username = serializers.CharField(max_length=150, validators=[UnicodeUsernameValidator()])
    auth_key = Base64BytesField(AUTH_KEY_BYTES, write_only=True)
    kdf_salt = Base64BytesField(SALT_BYTES)
    kdf_params = KdfParamsField()
    wrapped_master_key = Base64BytesField(WRAPPED_KEY_BYTES)
    master_key_iv = Base64BytesField(IV_BYTES)

    def validate_email(self, value: str) -> str:
        value = normalize_email(value)
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Ya existe una cuenta con este correo.")
        return value

    def validate_username(self, value: str) -> str:
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Este nombre de usuario ya está en uso.")
        return value


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    auth_key = Base64BytesField(AUTH_KEY_BYTES, write_only=True)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = ["code", "name", "max_storage_bytes", "max_file_size_bytes"]


class MeSerializer(serializers.ModelSerializer):
    plan = PlanSerializer(source="active_plan", read_only=True)
    storage_available = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "username", "plan", "used_storage", "storage_available"]
        read_only_fields = fields


class VaultSerializer(serializers.ModelSerializer):
    """Master Key envuelta: inútil sin la contraseña del usuario."""

    class Meta:
        model = User
        fields = ["wrapped_master_key", "master_key_iv"]
        read_only_fields = fields


def session_payload(result) -> dict:
    """Respuesta común de registro y login."""
    return {
        "access": result.access,
        "refresh": result.refresh,
        "user": MeSerializer(result.user).data,
        "vault": VaultSerializer(result.user).data,
    }


class SafeTokenRefreshSerializer(TokenRefreshSerializer):
    """El de simplejwt lanza DoesNotExist (error 500) si el usuario del token fue eliminado."""

    def validate(self, attrs):
        try:
            return super().validate(attrs)
        except User.DoesNotExist:
            raise AuthenticationFailed("La cuenta ya no existe.", "no_active_account")
