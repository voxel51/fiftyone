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


@pytest.fixture(autouse=True)
def _clear_cache():
    """Clear the media cache before and after each test."""
    clear()
    yield
    clear()


class TestAddAndCheckDir:
    def test_path_under_allowed_dir(self):
        add_allowed_dir("/data/datasets")
        resolved = str(Path("/data/datasets/coco/image.jpg").resolve())
        assert is_path_allowed(resolved) is True

    def test_nested_path_under_allowed_dir(self):
        add_allowed_dir("/data/datasets")
        resolved = str(Path("/data/datasets/a/b/c/image.jpg").resolve())
        assert is_path_allowed(resolved) is True

    def test_path_outside_allowed_dir(self):
        add_allowed_dir("/data/datasets")
        resolved = str(Path("/etc/passwd").resolve())
        assert is_path_allowed(resolved) is False

    def test_empty_cache_rejects_all(self):
        resolved = str(Path("/data/datasets/image.jpg").resolve())
        assert is_path_allowed(resolved) is False


class TestAddDirForFilepath:
    def test_parent_dir_registered(self):
        add_allowed_dir_for_filepath("/data/datasets/coco/image001.jpg")
        resolved = str(Path("/data/datasets/coco/image002.jpg").resolve())
        assert is_path_allowed(resolved) is True

    def test_sibling_dir_not_registered(self):
        add_allowed_dir_for_filepath("/data/datasets/coco/image001.jpg")
        resolved = str(Path("/data/datasets/voc/image001.jpg").resolve())
        assert is_path_allowed(resolved) is False


class TestNoPartialDirMatch:
    def test_partial_prefix_rejected(self):
        """``/data/foo`` must NOT match ``/data/foobar/file.jpg``."""
        add_allowed_dir("/data/foo")
        resolved = str(Path("/data/foobar/file.jpg").resolve())
        assert is_path_allowed(resolved) is False

    def test_exact_prefix_with_separator_accepted(self):
        add_allowed_dir("/data/foo")
        resolved = str(Path("/data/foo/file.jpg").resolve())
        assert is_path_allowed(resolved) is True


class TestClear:
    def test_clear_removes_all(self):
        add_allowed_dir("/data/datasets")
        resolved = str(Path("/data/datasets/image.jpg").resolve())
        assert is_path_allowed(resolved) is True

        clear()
        assert is_path_allowed(resolved) is False


class TestMultipleDirs:
    def test_paths_under_different_dirs(self):
        add_allowed_dir("/data/images")
        add_allowed_dir("/mnt/nas/videos")

        img = str(Path("/data/images/photo.jpg").resolve())
        vid = str(Path("/mnt/nas/videos/clip.mp4").resolve())
        other = str(Path("/tmp/rogue.jpg").resolve())

        assert is_path_allowed(img) is True
        assert is_path_allowed(vid) is True
        assert is_path_allowed(other) is False


class TestTildeExpansion:
    def test_tilde_resolved(self):
        home = str(Path.home())
        add_allowed_dir("~/fiftyone")
        resolved = str(Path(f"{home}/fiftyone/dataset/image.jpg").resolve())
        assert is_path_allowed(resolved) is True
