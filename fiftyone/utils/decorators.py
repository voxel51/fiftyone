"""
Python decorator utilities.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from functools import wraps
from cachetools import TTLCache


def route_requires_auth(RouteCls):
    """
    Check if a route requires authentication.

    Args:
        RouteCls (type): The route class to check.

    Returns:
        bool: True if the route requires authentication, False otherwise.
    """
    return (
        hasattr(RouteCls, "requires_authentication")
        and RouteCls.requires_authentication == True
    )


def async_ttl_cache(maxsize: float = 128, ttl: float = 600):
    cache = TTLCache(maxsize=maxsize, ttl=ttl)

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            key = (func.__name__, args, tuple(kwargs.items()))
            if not key in cache:
                cache[key] = await func(*args, **kwargs)
            return cache[key]

        return wrapper

    return decorator
