"""
Decorator utils for unit tests.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from functools import wraps
import platform
import unittest

import fiftyone as fo


def drop_datasets(func):
    """Decorator that drops all non-persistent datasets from the database
    before running a test.
    """

    @wraps(func)
    def wrapper(*args, **kwargs):
        fo.delete_non_persistent_datasets()
        return func(*args, **kwargs)

    return wrapper


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
