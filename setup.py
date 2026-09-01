#!/usr/bin/env python
"""
Installs FiftyOne.

Package metadata lives in ``pyproject.toml``; only the version remains here,
because releases override it with the ``RELEASE_VERSION`` environment
variable (validated against the ``VERSION`` constant below), which static
metadata cannot express — and CI reads the ``VERSION`` line directly.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
from setuptools import setup

VERSION = "1.22.0"


def get_version():
    if "RELEASE_VERSION" in os.environ:
        version = os.environ["RELEASE_VERSION"]
        if not version.startswith(VERSION):
            raise ValueError(
                "Release version does not match version: %s and %s"
                % (version, VERSION)
            )
        return version
    return VERSION


setup(version=get_version())
