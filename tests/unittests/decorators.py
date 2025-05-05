"""
Decorator utils for unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from functools import wraps
import os
import platform
import unittest
from unittest import mock

import fiftyone as fo
import fiftyone.core.odm as foo


def drop_datasets(func):
    """Decorator that drops all non-persistent datasets from the database
    before running a test.
    """

    @wraps(func)
    def wrapper(*args, **kwargs):
        fo.delete_non_persistent_datasets()
        return func(*args, **kwargs)

    return wrapper


def drop_async_dataset(func):
    """Decorator that drops a provided dataset"""

    @wraps(func)
    async def wrapper(*args, **kwargs):
        dataset = fo.Dataset()
        dataset.persistent = True
        try:
            await func(args[0], dataset, *args[1:], **kwargs)
        except Exception as exc:
            dataset.delete()
            raise exc

        dataset.delete()

    return wrapper


def drop_collection(collection_name):
    """Decorator that drops a collection from the database before and after
    running a test.
    """

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            db = foo.get_db_conn()
            db.drop_collection(collection_name)
            try:
                return func(*args, **kwargs)
            finally:
                db.drop_collection(collection_name)

        return wrapper

    return decorator


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


def use_local_plugins(func_=None, plugins_dir=None):
    """Decorator that temporarily sets ``fiftyone.config.plugins_dir`` to a
    value of your choice for the lifetime of the function's execution.

    By default, the ``tests/unittests`` directory is used, which means that any
    plugins defined in subdirectories therein will be registered.
    """

    if plugins_dir is None:
        plugins_dir = os.path.dirname(os.path.abspath(__file__))

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            with mock.patch("fiftyone.config.plugins_dir", plugins_dir):
                return func(*args, **kwargs)

        return wrapper

    if func_ is not None:
        # decorator called without parentheses
        return decorator(func_)
    else:
        # decorator called with parentheses (possibly with kwargs)
        return decorator
