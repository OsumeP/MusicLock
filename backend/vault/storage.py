"""
Puerto de almacenamiento de blobs cifrados (Arquitectura Hexagonal, PlanMVP §3.2).

El resto del backend solo conoce `BlobStorage` y `get_blob_storage()`. Los
adaptadores concretos son:

- `MinIOBlobStorage`: API S3 vía boto3 (MinIO u otro servidor compatible).
- `LocalBlobStorage`: carpeta del disco (tests, CI, desarrollo sin MinIO).

Se elige con `STORAGE_BACKEND=minio|local`. Ningún módulo fuera de este debe
importar boto3.
"""

from __future__ import annotations

import os
import tempfile
from functools import cache
from pathlib import Path
from typing import BinaryIO, Protocol

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


class BlobNotFound(Exception):
    """El blob pedido no existe en el almacenamiento."""


class BlobStorage(Protocol):
    def put(self, key: str, data: BinaryIO, size: int) -> None:
        """Guarda (o reemplaza) el blob `key` leyendo `size` bytes de `data`."""

    def open(self, key: str) -> BinaryIO:
        """Devuelve un objeto tipo archivo para leer el blob. Lanza `BlobNotFound`."""

    def delete(self, key: str) -> None:
        """Elimina el blob. Es idempotente: no falla si no existe."""

    def exists(self, key: str) -> bool: ...

    def ping(self) -> bool:
        """True si el almacenamiento está disponible (lo usa /api/health)."""


# --- Adaptador local -------------------------------------------------------------


class LocalBlobStorage:
    def __init__(self, root: Path | str):
        self.root = Path(root).resolve()

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        # Impide claves como "../../etc/passwd" que escapen de la carpeta raíz.
        if self.root not in path.parents:
            raise ValueError(f"Clave de blob inválida: {key!r}")
        return path

    def put(self, key: str, data: BinaryIO, size: int) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Escritura atómica: se escribe en un temporal y luego se renombra.
        fd, tmp_name = tempfile.mkstemp(dir=path.parent, suffix=".part")
        try:
            with os.fdopen(fd, "wb") as tmp:
                remaining = size
                while remaining > 0:
                    chunk = data.read(min(remaining, 1024 * 1024))
                    if not chunk:
                        break
                    tmp.write(chunk)
                    remaining -= len(chunk)
            if remaining != 0:
                raise ValueError(f"Se esperaban {size} bytes y faltaron {remaining}")
            os.replace(tmp_name, path)
        except BaseException:
            Path(tmp_name).unlink(missing_ok=True)
            raise

    def open(self, key: str) -> BinaryIO:
        try:
            return self._path(key).open("rb")
        except FileNotFoundError as exc:
            raise BlobNotFound(key) from exc

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def ping(self) -> bool:
        try:
            self.root.mkdir(parents=True, exist_ok=True)
            return os.access(self.root, os.W_OK)
        except OSError:
            return False


# --- Adaptador MinIO (S3) ----------------------------------------------------------


class MinIOBlobStorage:
    def __init__(self, endpoint_url: str, access_key: str, secret_key: str, bucket: str):
        import boto3
        from botocore.config import Config

        self.bucket = bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="us-east-1",  # MinIO ignora la región, pero boto3 la exige
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},  # MinIO usa http://host/bucket/key
                connect_timeout=3,
                read_timeout=30,
                retries={"max_attempts": 2},
            ),
        )

    @staticmethod
    def _is_not_found(exc: Exception) -> bool:
        from botocore.exceptions import ClientError

        return isinstance(exc, ClientError) and exc.response.get("Error", {}).get("Code") in {
            "404",
            "NoSuchKey",
            "NotFound",
        }

    def put(self, key: str, data: BinaryIO, size: int) -> None:
        self._client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentLength=size,
            ContentType="application/octet-stream",
        )

    def open(self, key: str) -> BinaryIO:
        try:
            return self._client.get_object(Bucket=self.bucket, Key=key)["Body"]
        except Exception as exc:
            if self._is_not_found(exc):
                raise BlobNotFound(key) from exc
            raise

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self.bucket, Key=key)

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception as exc:
            if self._is_not_found(exc):
                return False
            raise

    def ping(self) -> bool:
        try:
            self._client.head_bucket(Bucket=self.bucket)
            return True
        except Exception:
            return False


# --- Fábrica -------------------------------------------------------------------------


@cache
def get_blob_storage() -> BlobStorage:
    """Adaptador configurado en settings. Usar `get_blob_storage.cache_clear()` en tests."""
    backend = settings.STORAGE_BACKEND
    if backend == "local":
        return LocalBlobStorage(settings.LOCAL_BLOB_ROOT)
    if backend == "minio":
        return MinIOBlobStorage(
            endpoint_url=settings.MINIO_ENDPOINT_URL,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            bucket=settings.MINIO_BUCKET,
        )
    raise ImproperlyConfigured(f"STORAGE_BACKEND desconocido: {backend!r} (usar 'minio' o 'local')")
