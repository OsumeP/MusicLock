import tempfile

from django.test import override_settings

from vault.storage import get_blob_storage


class TempLocalStorageMixin:
    """Hace que `get_blob_storage()` use una carpeta temporal durante el test."""

    def setUp(self):
        super().setUp()
        self._tmp = tempfile.TemporaryDirectory()
        self._override = override_settings(STORAGE_BACKEND="local", LOCAL_BLOB_ROOT=self._tmp.name)
        self._override.enable()
        get_blob_storage.cache_clear()

    def tearDown(self):
        get_blob_storage.cache_clear()
        self._override.disable()
        self._tmp.cleanup()
        super().tearDown()
