"""
FiftyOne Server media_cache unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from pathlib import Path

import pytest

from fiftyone.server.media_cache import (
    add_allowed_dir,
    add_allowed_dir_for_filepath,
    clear,
    is_path_allowed,
)


def _resolve(path):
    return str(Path(path).resolve())


@pytest.fixture(autouse=True)
def _clear_cache():
    """Resets the allowlist between tests."""
    clear()
    yield
    clear()


_ALLOWED_PATHS = [
    ("/data/datasets", "/data/datasets/coco/image.jpg"),
    ("/data/datasets", "/data/datasets/a/b/c/deep.png"),
    ("/data/foo", "/data/foo/file.jpg"),
]

_REJECTED_PATHS = [
    ("/data/datasets", "/etc/passwd"),
    ("/data/datasets", "/tmp/rogue.jpg"),
    ("/data/foo", "/data/foobar/file.jpg"),
]


class TestIsPathAllowed:
    """Verifies directory-based path allowlisting."""

    @pytest.mark.parametrize("allowed_dir,filepath", _ALLOWED_PATHS)
    def test_allowed(self, allowed_dir, filepath):
        """Paths under a registered directory are accepted."""
        add_allowed_dir(allowed_dir)
        assert is_path_allowed(_resolve(filepath)) is True

    @pytest.mark.parametrize("allowed_dir,filepath", _REJECTED_PATHS)
    def test_rejected(self, allowed_dir, filepath):
        """Paths outside registered directories are rejected."""
        add_allowed_dir(allowed_dir)
        assert is_path_allowed(_resolve(filepath)) is False

    def test_empty_cache_rejects_all(self):
        """An empty allowlist rejects everything."""
        assert is_path_allowed(_resolve("/data/image.jpg")) is False

    def test_multiple_dirs(self):
        """Paths under any registered directory are accepted."""
        add_allowed_dir("/data/images")
        add_allowed_dir("/mnt/nas/videos")
        assert is_path_allowed(_resolve("/data/images/a.jpg")) is True
        assert is_path_allowed(_resolve("/mnt/nas/videos/b.mp4")) is True
        assert is_path_allowed(_resolve("/tmp/c.jpg")) is False

    def test_tilde_expansion(self):
        """Tilde paths are expanded before registration."""
        add_allowed_dir("~/fiftyone")
        home = str(Path.home())
        path = _resolve(f"{home}/fiftyone/dataset/image.jpg")
        assert is_path_allowed(path) is True


class TestAddDirForFilepath:
    """Verifies that registering a filepath allows its sibling files."""

    def test_sibling_allowed(self):
        """A file in the same directory as a registered filepath passes."""
        add_allowed_dir_for_filepath("/data/coco/image001.jpg")
        assert is_path_allowed(_resolve("/data/coco/image002.jpg")) is True

    def test_different_parent_rejected(self):
        """A file in a different directory is rejected."""
        add_allowed_dir_for_filepath("/data/coco/image001.jpg")
        assert is_path_allowed(_resolve("/data/voc/image001.jpg")) is False


class TestClear:
    """Verifies that clear() invalidates all registrations."""

    def test_clear(self):
        add_allowed_dir("/data/datasets")
        path = _resolve("/data/datasets/image.jpg")
        assert is_path_allowed(path) is True
        clear()
        assert is_path_allowed(path) is False
