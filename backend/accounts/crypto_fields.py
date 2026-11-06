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
