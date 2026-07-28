"""
Tests for package-wide constants.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.constants as foc


def test_author_metadata():
    assert foc.AUTHOR == "Voxel51, Inc."
    assert foc.AUTHOR_EMAIL == "info@voxel51.com"
