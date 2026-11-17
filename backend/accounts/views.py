"""
Endpoints de autenticación (PlanMVP §6). El "password" que viaja es siempre el
authKey derivado en el navegador (decisión D1).
"""

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenRefreshView

from . import services
from .serializers import (
    ChangePasswordSerializer,
    KeyMaterialSerializer,
    KeyPairSerializer,
    LoginSerializer,
    LogoutSerializer,
    MeSerializer,
    PreloginSerializer,
    RegisterSerializer,
    SafeTokenRefreshSerializer,
    VerifyPasswordSerializer,
    session_payload,
)


class PublicAuthView(APIView):
    """Base de los endpoints sin sesión: públicos y con límite de peticiones (anti fuerza bruta)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "auth"


class PreloginView(PublicAuthView):
    """POST {email} → {kdf_salt, kdf_params}. Responde igual exista o no la cuenta."""

    def post(self, request):
        serializer = PreloginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(services.prelogin_params(serializer.validated_data["email"]))


class RegisterView(PublicAuthView):
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = services.register_user(
            email=data["email"],
            username=data["username"],
            auth_key=data["auth_key"],
            vault={
                "kdf_salt": data["kdf_salt"],
                "kdf_params": data["kdf_params"],
                "wrapped_master_key": data["wrapped_master_key"],
                "master_key_iv": data["master_key_iv"],
            },
        )
        return Response(session_payload(result), status=status.HTTP_201_CREATED)


class LoginView(PublicAuthView):
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = services.login_user(**serializer.validated_data)
        except services.InvalidCredentials:
            return Response(
                {"detail": "Correo o contraseña incorrectos.", "code": "invalid_credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except services.AccountBlocked:
            return Response(
                {"detail": "Esta cuenta está bloqueada. Contacta al administrador.", "code": "account_blocked"},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(session_payload(result))


class RefreshView(TokenRefreshView):
    """POST {refresh} → {access, refresh}. Rota el refresh y pone el anterior en la lista negra."""

    serializer_class = SafeTokenRefreshSerializer
    throttle_scope = "auth"


class LogoutView(PublicAuthView):
    """
    POST {refresh} → 204. No exige access token: se debe poder cerrar sesión
    aunque el access ya haya expirado.
    """

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.logout(serializer.validated_data["refresh"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """GET → perfil, plan y almacenamiento del usuario autenticado."""

    def get(self, request):
        return Response(MeSerializer(request.user).data)


# --- Cambio de contraseña (día 14) ---------------------------------------------------

INVALID_PASSWORD = {"detail": "La contraseña actual no es correcta.", "code": "invalid_password"}


class PasswordCheckView(APIView):
    """
    Base de los dos pasos: requieren sesión Y el authKey actual. Responden 400 (no
    401) si no coincide, para que el cliente no lo confunda con un token caducado.
    Con límite de peticiones por usuario: un access token robado no basta para
    probar contraseñas sin freno.
    """

    throttle_scope = "auth"


class KeyMaterialView(PasswordCheckView):
    """POST /api/me/vault {auth_key} → {kdf_salt, kdf_params, wrapped_master_key, master_key_iv}."""

    def post(self, request):
        serializer = VerifyPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = services.verify_password(request.user, serializer.validated_data["auth_key"])
        except services.InvalidPassword:
            return Response(INVALID_PASSWORD, status=status.HTTP_400_BAD_REQUEST)
        return Response(KeyMaterialSerializer(user).data)


class ChangePasswordView(PasswordCheckView):
    """
    POST /api/me/password {current_auth_key, new_auth_key, kdf_salt, kdf_params,
    wrapped_master_key, master_key_iv} → sesión nueva (como el login). Cierra las demás.
    """

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        try:
            result = services.change_password(
                request.user,
                current_auth_key=data.pop("current_auth_key"),
                new_auth_key=data.pop("new_auth_key"),
                vault=data,
            )
        except services.InvalidPassword:
            return Response(INVALID_PASSWORD, status=status.HTTP_400_BAD_REQUEST)
        return Response(session_payload(result))


# --- Par de claves para compartir (día 16) -------------------------------------------


class KeyPairView(APIView):
    """
    GET → par propio (404 `no_keypair` si aún no existe). La privada va envuelta con
    la Master Key: no sirve sin la contraseña, así que basta con la sesión.
    PUT → guarda el par generado en el navegador (201); si ya existe, 409
    `keypair_exists` (reemplazarlo rompería lo ya compartido).
    """

    def get(self, request):
        if not request.user.has_keypair:
            return Response({"detail": "Aún no hay par de claves.", "code": "no_keypair"}, status=status.HTTP_404_NOT_FOUND)
        return Response(KeyPairSerializer(request.user).data)

    def put(self, request):
        serializer = KeyPairSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = services.set_keypair(request.user, **serializer.validated_data)
        except services.KeyPairAlreadyExists:
            return Response(
                {"detail": "La cuenta ya tiene un par de claves.", "code": "keypair_exists"},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(KeyPairSerializer(user).data, status=status.HTTP_201_CREATED)
