"""
FiftyOne user ID utility unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
import uuid
from unittest.mock import patch, mock_open

import fiftyone.core.uid as fou


def _assert_is_uuid(test, value):
    """Asserts that ``value`` is a valid UUID string."""
    test.assertIsInstance(value, str)
    # ``uuid.UUID`` raises ``ValueError`` if ``value`` is not a valid UUID
    test.assertEqual(str(uuid.UUID(value)), value)


class GetUserIdTests(unittest.TestCase):
    """Tests for ``get_user_id``."""

    @patch("os.makedirs")
    def test_returns_persisted_uid_when_present(self, mock_makedirs):
        """The happy path returns the persisted UID and never writes."""

        existing = "12345678-1234-5678-1234-567812345678"

        def fresh_handle(*args, **kwargs):
            # Return a fresh handle each call so ``read()`` can be called
            # multiple times without exhausting the iterator
            return mock_open(read_data=existing + "\n")()

        with patch("builtins.open", side_effect=fresh_handle):
            uid = fou.get_user_id()

        self.assertEqual(uid, existing)
        mock_makedirs.assert_not_called()

    @patch("os.makedirs", side_effect=PermissionError("read-only filesystem"))
    @patch("builtins.open", side_effect=FileNotFoundError)
    def test_makedirs_permission_error_returns_ephemeral_uuid(
        self, _mock_open, mock_makedirs
    ):
        """A non-writable config dir must not crash; return a fresh UUID."""

        uid = fou.get_user_id()

        _assert_is_uuid(self, uid)
        mock_makedirs.assert_called_once()

    @patch("os.makedirs")
    def test_write_oserror_returns_ephemeral_uuid(self, _mock_makedirs):
        """A write failure (e.g. read-only FS) must not crash either."""

        def open_side_effect(path, *args, **kwargs):
            # First call is the read (no file yet); the write call fails
            if "w" in args or kwargs.get("mode") == "w":
                raise OSError("read-only file system")
            raise FileNotFoundError

        with patch("builtins.open", side_effect=open_side_effect):
            uid = fou.get_user_id()

        _assert_is_uuid(self, uid)


if __name__ == "__main__":
    unittest.main()
