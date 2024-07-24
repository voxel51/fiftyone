"""
FiftyOne Server cache utilities.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from cachetools import cached, TLRUCache
import typing as t


R = t.TypeVar("R")


def create_tlru_cache(
    callable: t.Callable[..., R], cache: TLRUCache
) -> t.Callable[..., R]:
    """
    Create a cached callable using a :class:`cachetools.TLRUCache`

    Args:
        callable: a callable
        cache: a :class:`cachetools.TLRUCache`

    Returns:
        a cached callable
    """
    return cached(cache=cache)(callable)
