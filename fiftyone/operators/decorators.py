"""
FiftyOne operator decorators.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
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


def dir_state(dir_path):
    return max(
        os.path.getmtime(os.path.join(dir_path, f))
        for f in os.listdir(dir_path)
    )


def plugins_cache(func):
    """Decorator that returns the cached function result as long as no
    subdirectories of ``fo.config.plugins_dir`` have been modified since last
    time.
    """
    cache = {}
    dir_state_cache = {"state": None}
    dir_path = fo.config.plugins_dir

    @wraps(func)
    def wrapper(*args, **kwargs):
        if fo.config.plugins_cache_enabled:
            current_dir_state = dir_state(dir_path)
            if current_dir_state != dir_state_cache["state"]:
                cache.clear()
                cache[current_dir_state] = func(*args, **kwargs)
                dir_state_cache["state"] = current_dir_state
            return cache[current_dir_state]
        else:
            return func(*args, **kwargs)

    return wrapper
