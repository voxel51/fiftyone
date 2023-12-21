"""
FiftyOne dynamic version

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os


VERSION = "0.24.0"


if "RELEASE_VERSION" in os.environ:
    version = os.environ["RELEASE_VERSION"]
    if not version.startswith(VERSION):
        raise ValueError(
            "Release version does not match version: %s and %s"
            % (version, VERSION)
        )
    VERSION = version
