"""
Tests del puerto BlobStorage.

`BlobStorageContract` define el comportamiento que TODO adaptador debe cumplir;
se ejecuta contra el adaptador local siempre y contra MinIO cuando
STORAGE_BACKEND=minio (p. ej. `docker compose exec api python manage.py test`).
"""

import io
import tempfile
import uuid
from unittest import skipUnless

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings

from vault.storage import (
    BlobNotFound,
    LocalBlobStorage,
    MinIOBlobStorage,
    get_blob_storage,
)


class BlobStorageContract:
    storage = None  # lo asigna cada subclase en setUp

    def key(self, name: str = "song.bin") -> str:
        return f"tests/{self.prefix}/{name}"

    def put_bytes(self, key: str, payload: bytes) -> None:
        self.storage.put(key, io.BytesIO(payload), len(payload))

    def test_put_then_open_returns_same_bytes(self):
        payload = bytes(range(256)) * 1000
        self.put_bytes(self.key(), payload)

        with self.storage.open(self.key()) as blob:
            self.assertEqual(blob.read(), payload)

    def test_put_replaces_existing_blob(self):
        self.put_bytes(self.key(), b"version 1")
        self.put_bytes(self.key(), b"version 2")

        with self.storage.open(self.key()) as blob:
            self.assertEqual(blob.read(), b"version 2")

    def test_exists_reflects_put_and_delete(self):
        self.assertFalse(self.storage.exists(self.key()))
        self.put_bytes(self.key(), b"data")
        self.assertTrue(self.storage.exists(self.key()))

        self.storage.delete(self.key())
        self.assertFalse(self.storage.exists(self.key()))

    def test_open_missing_blob_raises_blob_not_found(self):
        with self.assertRaises(BlobNotFound):
            self.storage.open(self.key("missing.bin"))

    def test_delete_missing_blob_is_idempotent(self):
        self.storage.delete(self.key("missing.bin"))

    def test_ping(self):
        self.assertTrue(self.storage.ping())


class LocalBlobStorageTests(BlobStorageContract, SimpleTestCase):
    def setUp(self):
        self.prefix = uuid.uuid4().hex
        self._tmp = tempfile.TemporaryDirectory()
        self.storage = LocalBlobStorage(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_rejects_keys_that_escape_the_root(self):
        for key in ["../outside.bin", "users/../../outside.bin"]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.put_bytes(key, b"x")

    def test_incomplete_upload_leaves_no_blob(self):
        with self.assertRaises(ValueError):
            self.storage.put(self.key(), io.BytesIO(b"short"), size=100)
        self.assertFalse(self.storage.exists(self.key()))


@skipUnless(settings.STORAGE_BACKEND == "minio", "Requiere MinIO (STORAGE_BACKEND=minio)")
class MinIOBlobStorageTests(BlobStorageContract, SimpleTestCase):
    def setUp(self):
        self.prefix = uuid.uuid4().hex
        self.storage = MinIOBlobStorage(
            endpoint_url=settings.MINIO_ENDPOINT_URL,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            bucket=settings.MINIO_BUCKET,
        )

    def tearDown(self):
        for name in ["song.bin", "missing.bin"]:
            self.storage.delete(self.key(name))

    def test_ping_fails_for_unknown_bucket(self):
        other = MinIOBlobStorage(
            endpoint_url=settings.MINIO_ENDPOINT_URL,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            bucket=f"does-not-exist-{self.prefix}",
        )
        self.assertFalse(other.ping())


class GetBlobStorageTests(SimpleTestCase):
    def tearDown(self):
        get_blob_storage.cache_clear()

    def test_selects_adapter_from_settings(self):
        cases = [("local", LocalBlobStorage), ("minio", MinIOBlobStorage)]
        for backend, adapter in cases:
            with self.subTest(backend=backend), override_settings(STORAGE_BACKEND=backend):
                get_blob_storage.cache_clear()
                self.assertIsInstance(get_blob_storage(), adapter)

    @override_settings(STORAGE_BACKEND="ftp")
    def test_unknown_backend_is_a_configuration_error(self):
        get_blob_storage.cache_clear()
        with self.assertRaises(ImproperlyConfigured):
            get_blob_storage()
