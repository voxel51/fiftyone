"""
Test that certain fiftyone packages can be imported even when an incompatible
version of protobuf is installed.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import importlib.metadata
import os
import subprocess
import sys

MODULES = [
    "fiftyone.core.cli",
    "fiftyone.server.routes",
    "fiftyone.utils.data.importers",
]


def _pip_install(spec):
    subprocess.check_call([sys.executable, "-m", "pip", "install", spec])


def _pip_uninstall(package):
    subprocess.check_call(
        [sys.executable, "-m", "pip", "uninstall", "-y", package]
    )


def _current_version(package):
    try:
        return importlib.metadata.version(package)
    except importlib.metadata.PackageNotFoundError:
        return None


def test_incompatible_protobuf():
    original_version = _current_version("protobuf")

    try:
        _pip_install("protobuf==4.25.9")

        env = os.environ.copy()
        env.pop("VFF_MULTIMODAL", None)
        result = subprocess.run(
            [sys.executable, "-c", f"import {', '.join(MODULES)}"],
            capture_output=True,
            check=False,
            env=env,
        )
        if result.returncode != 0:
            print(result.stdout.decode())
            print(result.stderr.decode())
            raise RuntimeError(
                "Failed to import a fiftyone module with incompatible protobuf"
            )
    finally:
        if original_version is None:
            _pip_uninstall("protobuf")
        else:
            _pip_install(f"protobuf=={original_version}")
