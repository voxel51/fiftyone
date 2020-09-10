"""
Tests related to Session behavior.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import time

import fiftyone as fo
import fiftyone.core.session as fos


def test_fast_shutdown(capsys):
    session = fo.Session()
    session.__del__()
    out, _ = capsys.readouterr()
    assert fos._WAIT_INSTRUCTIONS in out


def test_fast_shutdown_remote(capsys):
    session = fo.Session(remote=True)
    session.__del__()
    out, _ = capsys.readouterr()
    assert fos._WAIT_INSTRUCTIONS in out


def test_slow_shutdown(capsys, monkeypatch):
    session = fo.Session(remote=True)
    monkeypatch.setattr(session, "_start_time", time.perf_counter() - 3600)
    session.__del__()
    out, _ = capsys.readouterr()
    assert fos._WAIT_INSTRUCTIONS not in out
