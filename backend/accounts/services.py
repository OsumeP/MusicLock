"""
Casos de uso de cuentas (capa de aplicación). Las vistas solo traducen HTTP ⇄
estos servicios; aquí viven las reglas.
"""

import base64
import hashlib
import hmac
from dataclasses import dataclass

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import update_last_login
from django.db import transaction
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .crypto_fields import MIN_PBKDF2_ITERATIONS, SALT_BYTES
from .models import User

DEFAULT_KDF_PARAMS = {"alg": "PBKDF2-SHA256", "iterations": MIN_PBKDF2_ITERATIONS}


def normalize_email(email: str) -> str:
    """Los correos se comparan sin distinguir mayúsculas: Ana@X.com y ana@x.com son la misma cuenta."""
    return email.strip().lower()


# --- Prelogin ----------------------------------------------------------------------


def _fake_salt(email: str) -> str:
    """
    Salt falso pero DETERMINISTA para correos sin cuenta: siempre el mismo para el
    mismo correo, así que la respuesta no revela si la cuenta existe (PlanMVP §4.1).
    """
    key = hashlib.sha256(f"musiclock/prelogin/{settings.SECRET_KEY}".encode()).digest()
    digest = hmac.new(key, email.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest[:SALT_BYTES]).decode()


def prelogin_params(email: str) -> dict:
    email = normalize_email(email)
    user = User.objects.filter(email=email).only("kdf_salt", "kdf_params", "wrapped_master_key").first()
    if user is not None and user.has_vault:
        return {"kdf_salt": user.kdf_salt, "kdf_params": user.kdf_params}
    return {"kdf_salt": _fake_salt(email), "kdf_params": DEFAULT_KDF_PARAMS}


# --- Registro y login ----------------------------------------------------------------


@dataclass(frozen=True)
class LoginResult:
    user: User
    access: str
    refresh: str


class InvalidCredentials(Exception):
    pass


class AccountBlocked(Exception):
    pass


def issue_tokens(user: User) -> LoginResult:
    refresh = RefreshToken.for_user(user)
    return LoginResult(user=user, access=str(refresh.access_token), refresh=str(refresh))


@transaction.atomic
def register_user(*, email: str, username: str, auth_key: str, vault: dict) -> LoginResult:
    """Crea la cuenta (plan Free por defecto) y abre sesión directamente."""
    user = User(email=normalize_email(email), username=username, **vault)
    user.set_password(auth_key)  # se guarda el hash del authKey, nunca la contraseña real
    user.save()
    return issue_tokens(user)


def login_user(*, email: str, auth_key: str) -> LoginResult:
    user = User.objects.select_related("active_plan").filter(email=normalize_email(email)).first()
    if user is None or not user.has_vault:
        # Se calcula un hash igualmente para que el tiempo de respuesta no revele si el correo existe.
        make_password(auth_key)
        raise InvalidCredentials
    if not user.check_password(auth_key):
        raise InvalidCredentials
    if not user.is_active:
        raise AccountBlocked  # BR-06
    update_last_login(None, user)
    return issue_tokens(user)


def logout(refresh_token: str) -> None:
    """
    Invalida el refresh token (FR-04). Idempotente: si el token ya estaba en la
    lista negra, expiró o es inválido, la sesión ya no sirve y no es un error.
    """
    try:
        RefreshToken(refresh_token).blacklist()
    except TokenError:
        pass
