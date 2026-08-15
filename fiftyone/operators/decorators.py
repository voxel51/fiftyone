"""
FiftyOne operator decorators.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio

from cachetools.keys import hashkey
from contextlib import contextmanager
from functools import wraps
import math
import signal
import os
import time

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
    """Context manager that raises a ``TimeoutError`` if its body runs for
    longer than the given number of seconds.

    Must be entered from the main thread of the main interpreter, because it
    installs a ``SIGALRM`` handler and ``signal.signal()`` raises a
    ``ValueError`` in any other thread.

    Args:
        seconds: the timeout, in seconds
    """
    prev_handler = signal.getsignal(signal.SIGALRM)
    signal.signal(
        signal.SIGALRM, lambda signum, frame: raise_timeout_error(seconds)
    )
    # Arming our alarm displaces any pending outer timer; its remaining
    # deadline is captured here and re-armed on exit
    prior_remaining = signal.alarm(seconds)
    start = time.monotonic()

    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, prev_handler)
        if prior_remaining:
            elapsed = time.monotonic() - start
            # Never 0 (that would cancel instead); an already-lapsed outer
            # deadline fires as soon as possible
            signal.alarm(max(1, math.ceil(prior_remaining - elapsed)))


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
    except Exception:
        return None

    for p in _iter_plugin_metadata_files(root_dir=dirpath):
        state ^= hash(os.path.getmtime(os.path.dirname(p)))

    return state
