"""
FiftyOne operator decorators.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
import glob

from cachetools.keys import hashkey
from contextlib import contextmanager
from functools import wraps
import signal
import os

import fiftyone as fo


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
    """Decorator that returns cached function results as long as no
    subdirectories of ``fo.config.plugins_dir`` have been modified since last
    time.
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
    if not os.path.isdir(dirpath):
        return None
    # we only need to check top level dir, which will update if any subdirs
    # change and in the case that files are deleted
    return os.path.getmtime(dirpath)
