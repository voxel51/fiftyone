"""
Tests related to Session behavior.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import gc
import time
from unittest.mock import MagicMock, patch

import fiftyone.core.session.session as fos


def _make_session_shell(
    start_time: float, disable_warning: bool
) -> fos.Session:
    """Build a minimal Session-like object that exercises __del__ logic."""
    session = object.__new__(fos.Session)
    session._get_time = time.perf_counter
    session._disable_wait_warning = disable_warning
    session._client = MagicMock()
    session._client.start_time = start_time
    return session


def test_wait_warning_suppressed_when_flag_set(capsys):
    """_disable_wait_warning=True suppresses the fast-shutdown warning."""
    session = _make_session_shell(
        start_time=time.perf_counter(),  # just now → elapsed < 2.5s
        disable_warning=True,
    )
    with patch("fiftyone.core.session.session._unregister_session"):
        del session
        gc.collect()
    assert fos._WAIT_INSTRUCTIONS not in capsys.readouterr().out


def test_wait_warning_shown_on_fast_shutdown(capsys):
    """Warning is printed when session is destroyed in under 2.5 seconds."""
    session = _make_session_shell(
        start_time=time.perf_counter(),
        disable_warning=False,
    )
    with patch("fiftyone.core.session.session._unregister_session"):
        del session
        gc.collect()
    assert fos._WAIT_INSTRUCTIONS in capsys.readouterr().out


def test_no_warning_on_slow_shutdown(capsys):
    """No warning when session lived longer than 2.5 seconds."""
    session = _make_session_shell(
        start_time=time.perf_counter() - 3.0,  # 3s ago → elapsed > 2.5s
        disable_warning=False,
    )
    with patch("fiftyone.core.session.session._unregister_session"):
        del session
        gc.collect()
    assert fos._WAIT_INSTRUCTIONS not in capsys.readouterr().out
