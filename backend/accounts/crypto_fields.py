"""
Validación del material criptográfico que envía el navegador.

El servidor no puede (ni debe) descifrar nada, pero sí puede comprobar que los
valores tienen el formato y el tamaño esperados según el esquema v1 del cliente
(frontend/src/crypto/constants.ts). Así se rechazan datos corruptos o
malintencionados antes de guardarlos.
"""

import base64
import binascii

from rest_framework import serializers

MIN_PBKDF2_ITERATIONS = 600_000
SUPPORTED_KDF_ALGORITHMS = {"PBKDF2-SHA256"}

AUTH_KEY_BYTES = 32  # salida de HKDF
SALT_BYTES = 16
IV_BYTES = 12
# AES-GCM sobre una clave AES-256 cruda: 32 bytes + 16 de tag
WRAPPED_KEY_BYTES = 32 + 16


class Base64BytesField(serializers.CharField):
    """Texto base64 que debe decodificar exactamente a `num_bytes` bytes. Conserva el texto original."""

    def __init__(self, num_bytes: int, **kwargs):
        self.num_bytes = num_bytes
        kwargs.setdefault("max_length", 4 * ((num_bytes + 2) // 3))
        kwargs.setdefault("trim_whitespace", True)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        try:
            decoded = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError):
            raise serializers.ValidationError("Debe ser base64 válido.")
        if len(decoded) != self.num_bytes:
            raise serializers.ValidationError(f"Debe contener exactamente {self.num_bytes} bytes.")
        return value


class KdfParamsField(serializers.JSONField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        if not isinstance(value, dict) or set(value) != {"alg", "iterations"}:
            raise serializers.ValidationError('Formato esperado: {"alg": ..., "iterations": ...}.')
        if value["alg"] not in SUPPORTED_KDF_ALGORITHMS:
            raise serializers.ValidationError(f"Algoritmo no soportado: {value['alg']!r}.")
        iterations = value["iterations"]
        if not isinstance(iterations, int) or isinstance(iterations, bool) or iterations < MIN_PBKDF2_ITERATIONS:
            raise serializers.ValidationError(f"Se requieren al menos {MIN_PBKDF2_ITERATIONS} iteraciones.")
        return value


# --- Par de claves para compartir (día 16) -------------------------------------------

# SPKI DER de una clave RSA de 3072 bits con exponente 65537: siempre 422 bytes y
# siempre empieza por la misma cabecera (SEQUENCE + AlgorithmIdentifier rsaEncryption).
RSA_PUBLIC_KEY_BYTES = 422
RSA_SPKI_PREFIX = bytes.fromhex("308201a2300d06092a864886f70d01010105000382018f00")
# PKCS#8 de RSA-3072 ocupa ~1790-1796 bytes (varía con los ceros a la izquierda) + 16 de tag.
WRAPPED_PRIVATE_KEY_MIN_BYTES = 1700
WRAPPED_PRIVATE_KEY_MAX_BYTES = 1900


def _decode(value: str) -> bytes:
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        raise serializers.ValidationError("Debe ser base64 válido.")


class RsaPublicKeyField(serializers.CharField):
    """Clave pública RSA-OAEP 3072 en SPKI/base64 (la que genera el navegador)."""

    def __init__(self, **kwargs):
        kwargs.setdefault("max_length", 4 * ((RSA_PUBLIC_KEY_BYTES + 2) // 3))
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        decoded = _decode(value)
        if len(decoded) != RSA_PUBLIC_KEY_BYTES or not decoded.startswith(RSA_SPKI_PREFIX):
            raise serializers.ValidationError("Debe ser una clave pública RSA de 3072 bits (SPKI).")
        return value


class WrappedPrivateKeyField(serializers.CharField):
    """Clave privada PKCS#8 envuelta con AES-GCM: solo se comprueba el tamaño."""

    def __init__(self, **kwargs):
        kwargs.setdefault("max_length", 4 * ((WRAPPED_PRIVATE_KEY_MAX_BYTES + 2) // 3))
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        size = len(_decode(value))
        if not WRAPPED_PRIVATE_KEY_MIN_BYTES <= size <= WRAPPED_PRIVATE_KEY_MAX_BYTES:
            raise serializers.ValidationError("Tamaño de clave privada envuelta inesperado.")
        return value
