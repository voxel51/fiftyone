"""
Tests related to Session behavior.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import sys
import subprocess

import fiftyone as fo
import fiftyone.core.session.session as fos


def _run_helper(*args):
    # -u: unbuffered output, to ensure that the warning gets captured
    return (
        subprocess.check_output(
            [
                sys.executable,
                "-u",
                os.path.join(
                    os.path.dirname(os.path.abspath(__file__)),
                    "utils",
                    "session_helper.py",
                ),
            ]
            + list(args)
        )
        .decode()
        .replace("\r", "")
    )


def test_slow_shutdown(capsys):
    out = _run_helper("--slow")
    assert fos._WAIT_INSTRUCTIONS not in out
