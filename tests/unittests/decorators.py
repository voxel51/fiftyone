"""
Decorator utils for unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from functools import wraps
import platform
import unittest

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
    """Decorator that drops a collection from the database before and after running a test."""

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
