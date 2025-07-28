"""
Logging utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import functools


def run_once(f):
    """Decorator that ensures that a function is run at most once.

    The function is run the first time it is called, and subsequent calls
    return the result of the first call.
    """
    has_run = False
    result = None

    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        nonlocal has_run
        nonlocal result

        if has_run:
            return result

        has_run = True
        result = f(*args, **kwargs)
        return result

    return wrapper
