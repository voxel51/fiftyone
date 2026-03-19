"""
FiftyOne Server /media route unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from pathlib import Path
from urllib.parse import urlencode

import pytest
from starlette.requests import Request

from fiftyone.server.media_cache import add_allowed_dir, clear
from fiftyone.server.routes.media import (
    _is_media_file,
    _validate_media_path,
)

_ALLOWED_DIR = "/data/datasets"

_MEDIA_ALLOWED = [
    "/d/image.jpg",
    "/d/image.png",
    "/d/video.mp4",
    "/d/video.mov",
    "/d/cloud.pcd",
    "/d/scene.fo3d",
    "/d/mask.npy",
    "/d/data.rrd",
    "/d/model.obj",
    "/d/material.mtl",
    "/d/noext",
    "/etc/passwd",
]

_MEDIA_BLOCKED = [
    "/d/script.py",
    "/d/page.html",
    "/d/config.json",
    "/d/data.xml",
    "/d/app.js",
]


def _make_request(filepath=None):
    scope = {
        "type": "http",
        "method": "GET",
        "query_string": b"",
        "headers": [],
    }
    if filepath is not None:
        scope["query_string"] = urlencode({"filepath": filepath}).encode()
    return Request(scope)


@pytest.fixture(autouse=True)
def _clear_cache():
    """Resets the allowlist between tests."""
    clear()
    yield
    clear()


@pytest.fixture()
def allowed_dir():
    """Registers and returns the standard test directory."""
    add_allowed_dir(_ALLOWED_DIR)
    return _ALLOWED_DIR


class TestIsMediaFile:
    """Verifies MIME-based media type detection (Layer 2)."""

    @pytest.mark.parametrize("filepath", _MEDIA_ALLOWED)
    def test_allowed(self, filepath):
        """Files with media or unrecognized MIME types pass Layer 2."""
        assert _is_media_file(filepath) is True

    @pytest.mark.parametrize("filepath", _MEDIA_BLOCKED)
    def test_blocked(self, filepath):
        """Files with known non-media MIME types are rejected."""
        assert _is_media_file(filepath) is False


_VALIDATE_REJECTED = {
    "outside allowed dirs": "/etc/passwd",
    "traversal normalized then rejected": "../../../etc/passwd",
    "valid MIME but outside allowed dirs": "/tmp/rogue.jpg",
    "traversal escapes allowed dir": "/data/datasets/../../etc/passwd",
    "non-media MIME blocked": "/data/datasets/script.py",
}

_VALIDATE_ALLOWED = {
    "standard image": "image.jpg",
    "point cloud": "cloud.pcd",
    "3D scene": "scene.fo3d",
    "numpy mask": "mask.npy",
    "rerun data": "data.rrd",
    "unknown MIME passes to Layer 3": "material.mtl",
}


class TestValidateMediaPath:
    """Verifies the full three-layer validation pipeline."""

    def test_missing_filepath_returns_400(self):
        """Requests without a filepath param get 400."""
        _, error = _validate_media_path(_make_request())
        assert error is not None and error.status_code == 400

    @pytest.mark.parametrize(
        "filepath",
        _VALIDATE_REJECTED.values(),
        ids=_VALIDATE_REJECTED.keys(),
    )
    def test_rejected(self, allowed_dir, filepath):
        """Invalid or unauthorized paths are rejected."""
        _, error = _validate_media_path(_make_request(filepath))
        assert error is not None and error.status_code == 403

    @pytest.mark.parametrize(
        "filename",
        _VALIDATE_ALLOWED.values(),
        ids=_VALIDATE_ALLOWED.keys(),
    )
    def test_allowed(self, allowed_dir, filename):
        """Valid media files in an allowed directory pass all layers."""
        filepath = f"{_ALLOWED_DIR}/{filename}"
        path, error = _validate_media_path(_make_request(filepath))
        assert error is None
        assert path == str(Path(filepath).resolve())
