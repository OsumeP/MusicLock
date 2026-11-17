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
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
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


# --- Cambio de contraseña (día 14) ---------------------------------------------------
#
# La Master Key NO cambia: el navegador la desenvuelve con la KEK actual y la vuelve
# a envolver con la KEK de la nueva contraseña (PlanMVP §4.2). Ninguna canción se
# vuelve a cifrar. El servidor solo ve authKeys y la Master Key envuelta.


class InvalidPassword(Exception):
    """El authKey de la contraseña actual no coincide."""


def verify_password(user: User, auth_key: str) -> User:
    """Comprueba el authKey actual antes de entregar la Master Key envuelta (paso 1)."""
    if not user.has_vault or not user.check_password(auth_key):
        raise InvalidPassword
    return user


@transaction.atomic
def change_password(user: User, *, current_auth_key: str, new_auth_key: str, vault: dict) -> LoginResult:
    """
    Paso 2: guarda el nuevo authKey y la Master Key re-envuelta, e invalida TODAS
    las sesiones (refresh tokens a la lista negra; los access tokens dejan de valer
    porque llevan el resumen del hash anterior, CHECK_REVOKE_TOKEN). La sesión que
    hizo el cambio recibe tokens nuevos.
    """
    user = User.objects.select_for_update().select_related("active_plan").get(pk=user.pk)
    verify_password(user, current_auth_key)

    user.set_password(new_auth_key)
    for field, value in vault.items():
        setattr(user, field, value)
    user.save(update_fields=["password", *vault])

    pending = OutstandingToken.objects.filter(user=user, blacklistedtoken__isnull=True)
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=token) for token in pending], ignore_conflicts=True
    )
    return issue_tokens(user)


# --- Par de claves para compartir (día 16) ---------------------------------------------


class KeyPairAlreadyExists(Exception):
    """El par no se reemplaza: invalidaría todo lo que ya se compartió con el usuario."""


@transaction.atomic
def set_keypair(user: User, *, public_key: str, wrapped_private_key: str, private_key_iv: str) -> User:
    """Guarda el par generado en el navegador. Solo una vez por cuenta."""
    user = User.objects.select_for_update().get(pk=user.pk)
    if user.has_keypair:
        raise KeyPairAlreadyExists
    user.public_key = public_key
    user.wrapped_private_key = wrapped_private_key
    user.private_key_iv = private_key_iv
    user.save(update_fields=["public_key", "wrapped_private_key", "private_key_iv"])
    return user
