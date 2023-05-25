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
from typing import Callable


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


def dir_state(dir_path: str) -> float:
    return max(
        os.path.getmtime(os.path.join(dir_path, f))
        for f in os.listdir(dir_path)
    )


def cached_based_on_dir(dir_path):
    cache = {}
    dir_state_cache = {"state": None}

    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Get the modification time of the directory.
            current_dir_state = dir_state(dir_path)
            if current_dir_state != dir_state_cache["state"]:
                # If directory state has changed (or it's the first run), call the function and store the result in cache.
                cache.clear()
                cache[current_dir_state] = func(*args, **kwargs)
                dir_state_cache["state"] = current_dir_state
            return cache[current_dir_state]

        return wrapper

    return decorator
