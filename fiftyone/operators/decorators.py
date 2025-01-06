"""
FiftyOne operator decorators.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio

from cachetools.keys import hashkey
from contextlib import contextmanager
from functools import wraps
import signal
import os

import fiftyone as fo
from fiftyone.plugins.core import _iter_plugin_metadata_files


def coroutine_timeout(seconds):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                if asyncio.iscoroutinefunction(func):
                    return await asyncio.wait_for(
                        func(*args, **kwargs), timeout=seconds
                    )
                else:
                    raise TypeError(
                        f"Function {func.__name__} is not a coroutine function"
                    )
            except asyncio.TimeoutError:
                raise_timeout_error(seconds)

        return wrapper

    return decorator


@contextmanager
def timeout(seconds: int):
    signal.signal(
        signal.SIGALRM, lambda signum, frame: raise_timeout_error(seconds)
    )
    signal.alarm(seconds)

    try:
        yield
    finally:
        signal.signal(signal.SIGALRM, signal.SIG_IGN)


def raise_timeout_error(seconds):
    raise TimeoutError(f"Timeout occurred after {seconds} seconds") from None


cache = {}
dir_cache = {"state": None}


def plugins_cache(func):
    """Decorator that returns cached function results as long as no plugins
    have been modified since last time.
    """

    @wraps(func)
    def wrapper(*args, **kwargs):
        if not fo.config.plugins_cache_enabled:
            return func(*args, **kwargs)

        curr_dir_state = dir_state(fo.config.plugins_dir)
        if curr_dir_state != dir_cache["state"]:
            cache.clear()
            dir_cache["state"] = curr_dir_state

        key = hashkey(func, *args, **kwargs)
        if key not in cache:
            cache[key] = func(*args, **kwargs)

        return cache[key]

    return wrapper


def dir_state(dirpath):
    try:
        state = hash(os.path.getmtime(dirpath))
    except:
        return None

    for p in _iter_plugin_metadata_files(root_dir=dirpath):
        state ^= hash(os.path.getmtime(os.path.dirname(p)))

    return state
