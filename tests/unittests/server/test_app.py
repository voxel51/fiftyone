"""
FiftyOne Server app unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import importlib

import pytest

import fiftyone as fo
import fiftyone.server.app as fosa


def _static_mount(app):
    return next(r for r in app.routes if getattr(r, "name", None) == "static")


def test_follow_static_symlinks_defaults_to_true():
    assert fo.AppConfig().follow_static_symlinks is True


@pytest.mark.parametrize("value, expected", [("false", False), ("true", True)])
def test_follow_static_symlinks_env_var(monkeypatch, value, expected):
    monkeypatch.setenv("FIFTYONE_APP_FOLLOW_STATIC_SYMLINKS", value)
    assert fo.AppConfig().follow_static_symlinks is expected


@pytest.mark.parametrize("follow", [False, True])
def test_static_mount_uses_follow_static_symlinks(monkeypatch, follow):
    monkeypatch.setattr(fo.app_config, "follow_static_symlinks", follow)
    try:
        app = importlib.reload(fosa).app
        assert _static_mount(app).app.follow_symlink is follow
    finally:
        monkeypatch.undo()
        importlib.reload(fosa)
