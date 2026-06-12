"""
Test that certain fiftyone packages can be imported even when an incompatible
version of protobuf is installed.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import subprocess
import sys

MODULES = [
    "fiftyone.core.cli",
    "fiftyone.server.routes",
    "fiftyone.utils.data.importers",
]


def test_incompatible_protobuf():
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "protobuf==4.25.9"]
    )
    result = subprocess.run(
        [sys.executable, "-c", f"import {', '.join(MODULES)}"],
        capture_output=True,
        check=False,
        env={},  # VFF_MULTIMODAL not set
    )
    if result.returncode != 0:
        print(result.stdout.decode())
        print(result.stderr.decode())
        raise RuntimeError(
            "Failed to import a fiftyone module with incompatible protobuf"
        )
