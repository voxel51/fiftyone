"""
FiftyOne Server app unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import sys

import pytest
from starlette.applications import Starlette
from starlette.routing import Mount
from starlette.testclient import TestClient

import fiftyone as fo
import fiftyone.server.app as fosa

_INDEX = "<html>app</html>"

# Windows collapses ``..`` before resolving symlinks, so this layout can't be
# built there
_posix_only = pytest.mark.skipif(
    sys.platform == "win32", reason="Windows resolves '..' lexically"
)


def _symlinked_file(tmp_path):
    """``static/index.html`` is a symlink to a file outside of ``static``.

    Only ``abspath`` keeps the file inside ``static``; ``realpath`` resolves
    it outside.
    """
    cache = tmp_path / "cache"
    cache.mkdir()
    (cache / "index.html").write_text(_INDEX)

    static = tmp_path / "static"
    static.mkdir()
    os.symlink(cache / "index.html", static / "index.html")

    return str(static)


def _symlink_then_parent(tmp_path):
    """The directory is reached through a symlink followed by ``..``.

    ``realpath`` resolves the symlink before applying ``..`` and finds
    ``static``; ``abspath`` drops the symlink as text and points at a
    directory that does not exist.
    """
    static = tmp_path / "real" / "pkg" / "static"
    static.mkdir(parents=True)
    (static / "index.html").write_text(_INDEX)

    os.symlink(tmp_path / "real" / "pkg", tmp_path / "link")

    return os.path.join(str(tmp_path), "link", "..", "pkg", "static")


def _get_index(directory):
    app = Starlette(routes=[Mount("/", app=fosa._app_static(directory))])
    return TestClient(app).get("/", follow_redirects=False)


def test_follow_static_symlinks_defaults_to_true(monkeypatch):
    monkeypatch.delenv("FIFTYONE_APP_FOLLOW_STATIC_SYMLINKS", raising=False)
    assert fo.AppConfig().follow_static_symlinks is True


@pytest.mark.parametrize("value, expected", [("false", False), ("true", True)])
def test_follow_static_symlinks_env_var(monkeypatch, value, expected):
    monkeypatch.setenv("FIFTYONE_APP_FOLLOW_STATIC_SYMLINKS", value)
    assert fo.AppConfig().follow_static_symlinks is expected


@pytest.mark.parametrize(
    "layout, follow, served",
    [
        (_symlinked_file, True, True),
        (_symlinked_file, False, False),
        pytest.param(_symlink_then_parent, True, False, marks=_posix_only),
        pytest.param(_symlink_then_parent, False, True, marks=_posix_only),
    ],
)
def test_static_layouts(monkeypatch, tmp_path, layout, follow, served):
    monkeypatch.setattr(fo.app_config, "follow_static_symlinks", follow)

    response = _get_index(layout(tmp_path))

    if served:
        assert response.status_code == 200
        assert response.text == _INDEX
    else:
        assert response.status_code == 404
        assert response.text == "Not Found"
