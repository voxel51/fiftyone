"""
Decorator utils for unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from functools import wraps
import platform
import unittest


def skip_windows(func):
    """Decorator that skips a test when running on Windows."""

    @wraps(func)
    def wrapper(*args, **kwargs):
        if platform.system() == "Windows":
            return unittest.skip(
                "We've been instructed to skip this test on Windows..."
            )

        return func(*args, **kwargs)

    return wrapper
