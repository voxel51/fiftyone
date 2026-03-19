"""
FiftyOne Server /media route unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from pathlib import Path

import pytest
from starlette.requests import Request

from fiftyone.server.media_cache import add_allowed_dir, clear
from fiftyone.server.routes.media import _is_media_file, _validate_media_path


@pytest.fixture(autouse=True)
def _clear_cache():
    clear()
    yield
    clear()


# --- _is_media_file tests ---


class TestIsMediaFile:
    def test_image_allowed(self):
        assert _is_media_file("/data/image.jpg") is True
        assert _is_media_file("/data/image.png") is True
        assert _is_media_file("/data/image.gif") is True
        assert _is_media_file("/data/image.bmp") is True
        assert _is_media_file("/data/image.webp") is True

    def test_video_allowed(self):
        assert _is_media_file("/data/video.mp4") is True
        assert _is_media_file("/data/video.avi") is True
        assert _is_media_file("/data/video.mov") is True

    def test_pcd_allowed(self):
        assert _is_media_file("/data/cloud.pcd") is True

    def test_fo3d_allowed(self):
        assert _is_media_file("/data/scene.fo3d") is True

    def test_npy_allowed(self):
        assert _is_media_file("/data/mask.npy") is True

    def test_rrd_allowed(self):
        assert _is_media_file("/data/recording.rrd") is True

    def test_obj_allowed(self):
        # .obj has incorrect system MIME (application/x-tgif) but is not
        # in the blocklist, so it passes through
        assert _is_media_file("/data/model.obj") is True

    def test_mtl_allowed(self):
        # .mtl has no MIME type on most systems (None), which passes through
        assert _is_media_file("/data/material.mtl") is True

    def test_text_plain_blocked(self):
        assert _is_media_file("/etc/passwd") is False

    def test_python_file_blocked(self):
        assert _is_media_file("/data/script.py") is False

    def test_shell_script_blocked(self):
        assert _is_media_file("/data/run.sh") is False

    def test_html_blocked(self):
        assert _is_media_file("/data/page.html") is False

    def test_json_blocked(self):
        assert _is_media_file("/data/config.json") is False

    def test_xml_blocked(self):
        assert _is_media_file("/data/data.xml") is False

    def test_javascript_blocked(self):
        assert _is_media_file("/data/app.js") is False

    def test_no_extension_allowed(self):
        # No MIME type (None) — passes through to Layer 3
        assert _is_media_file("/data/somefile") is True


# --- _validate_media_path tests ---


def _make_request(filepath=None):
    """Create a mock Starlette Request with the given filepath query param."""
    scope = {
        "type": "http",
        "method": "GET",
        "query_string": b"",
        "headers": [],
    }
    if filepath is not None:
        from urllib.parse import urlencode

        scope["query_string"] = urlencode({"filepath": filepath}).encode()
    return Request(scope)


class TestValidateMediaPath:
    def test_missing_filepath_returns_400(self):
        request = _make_request()
        path, error = _validate_media_path(request)
        assert path is None
        assert error.status_code == 400

    def test_system_file_blocked_by_mime(self):
        request = _make_request("/etc/passwd")
        path, error = _validate_media_path(request)
        assert path is None
        assert error.status_code == 403

    def test_path_traversal_blocked(self):
        request = _make_request("../../../etc/passwd")
        path, error = _validate_media_path(request)
        assert path is None
        assert error.status_code == 403

    def test_media_outside_allowed_dir_blocked(self):
        request = _make_request("/tmp/rogue.jpg")
        path, error = _validate_media_path(request)
        assert path is None
        assert error.status_code == 403

    def test_valid_image_in_allowed_dir(self):
        add_allowed_dir("/data/datasets")
        request = _make_request("/data/datasets/image.jpg")
        path, error = _validate_media_path(request)
        expected = str(Path("/data/datasets/image.jpg").resolve())
        assert path == expected
        assert error is None

    def test_pcd_in_allowed_dir(self):
        add_allowed_dir("/data/datasets")
        request = _make_request("/data/datasets/cloud.pcd")
        path, error = _validate_media_path(request)
        assert error is None
        assert path is not None

    def test_fo3d_in_allowed_dir(self):
        add_allowed_dir("/data/datasets")
        request = _make_request("/data/datasets/scene.fo3d")
        path, error = _validate_media_path(request)
        assert error is None
        assert path is not None

    def test_npy_in_allowed_dir(self):
        add_allowed_dir("/data/datasets")
        request = _make_request("/data/datasets/mask.npy")
        path, error = _validate_media_path(request)
        assert error is None
        assert path is not None

    def test_rrd_in_allowed_dir(self):
        add_allowed_dir("/data/datasets")
        request = _make_request("/data/datasets/data.rrd")
        path, error = _validate_media_path(request)
        assert error is None
        assert path is not None

    def test_unknown_ext_in_allowed_dir(self):
        add_allowed_dir("/data/datasets")
        request = _make_request("/data/datasets/material.mtl")
        path, error = _validate_media_path(request)
        assert error is None
        assert path is not None

    def test_traversal_normalized_then_blocked(self):
        """Path with .. is resolved before checking, so it hits the real target."""
        add_allowed_dir("/data/datasets")
        request = _make_request("/data/datasets/../../etc/passwd")
        path, error = _validate_media_path(request)
        assert path is None
        assert error.status_code == 403

    def test_env_var_style_roots(self):
        """Simulates FIFTYONE_MEDIA_ALLOWED_ROOTS behavior."""
        add_allowed_dir("/external/media")
        request = _make_request("/external/media/photo.jpg")
        path, error = _validate_media_path(request)
        assert error is None
        assert path is not None
