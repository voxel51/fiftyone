"""
Decorator utils for unit tests.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from functools import wraps
import platform
import unittest
import fnmatch

import fiftyone as fo
import fiftyone.operators.store as foos


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


def drop_stores(func, pattern="*"):
    """Decorator that drops all stores from the database before running a test."""

    @wraps(func)
    def wrapper(*args, **kwargs):
        svc = foos.ExecutionStoreService()
        stores = svc.list_stores_global()
        for store in stores:
            store_name = store.store_name
            if fnmatch.fnmatch(store_name, pattern):
                try:
                    svc.delete_store_global(store_name)
                except Exception as e:
                    raise RuntimeError(
                        f"Failed to delete store '{store_name}'"
                    ) from e
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
