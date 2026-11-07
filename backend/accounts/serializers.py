from django.contrib.auth.validators import UnicodeUsernameValidator
from rest_framework import serializers
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.utils import get_md5_hash_password

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


class VerifyPasswordSerializer(serializers.Serializer):
    auth_key = Base64BytesField(AUTH_KEY_BYTES, write_only=True)


class ChangePasswordSerializer(serializers.Serializer):
    """authKey actual + material de la nueva contraseña (mismo formato que el registro)."""

    current_auth_key = Base64BytesField(AUTH_KEY_BYTES, write_only=True)
    new_auth_key = Base64BytesField(AUTH_KEY_BYTES, write_only=True)
    kdf_salt = Base64BytesField(SALT_BYTES)
    kdf_params = KdfParamsField()
    wrapped_master_key = Base64BytesField(WRAPPED_KEY_BYTES)
    master_key_iv = Base64BytesField(IV_BYTES)

    def validate(self, attrs):
        if attrs["new_auth_key"] == attrs["current_auth_key"]:
            # Con un salt nuevo esto solo pasa si el cliente no lo renovó.
            raise serializers.ValidationError({"new_auth_key": "Debe derivarse con un salt nuevo."})
        return attrs


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


class KeyMaterialSerializer(serializers.ModelSerializer):
    """Todo lo necesario para re-envolver la Master Key en el navegador (cambio de contraseña)."""

    class Meta:
        model = User
        fields = ["kdf_salt", "kdf_params", "wrapped_master_key", "master_key_iv"]
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
            self._check_not_revoked(attrs["refresh"])
            return super().validate(attrs)
        except User.DoesNotExist:
            raise AuthenticationFailed("La cuenta ya no existe.", "no_active_account")

    @staticmethod
    def _check_not_revoked(raw_token: str) -> None:
        """
        Defensa adicional a la lista negra: un refresh token emitido antes de un
        cambio de contraseña no sirve aunque se hubiera escapado del blacklist.
        """
        token = RefreshToken(raw_token)  # TokenError → 401 (lo traduce la vista de simplejwt)
        user_id = token.payload.get(jwt_settings.USER_ID_CLAIM)
        user = User.objects.filter(**{jwt_settings.USER_ID_FIELD: user_id}).only("password").first()
        if user is not None and token.payload.get(jwt_settings.REVOKE_TOKEN_CLAIM) != get_md5_hash_password(user.password):
            raise AuthenticationFailed("La contraseña de la cuenta cambió.", "password_changed")
