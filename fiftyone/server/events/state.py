"""
FiftyOne Server events state.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from collections import defaultdict
from dataclasses import dataclass
import typing as t

import asyncio

import fiftyone.core.state as fos


@dataclass(frozen=True)
class Listener:
    queue: asyncio.Queue
    subscription: str


_LISTENERS: t.Dict[str, t.Set[Listener]] = defaultdict(set)
_REQUESTS: t.Dict[str, t.Set[t.Tuple[str, Listener]]] = {}


_app_count: int = 0
_port: t.Optional[int] = None
_state: t.Optional[fos.StateDescription] = None


def get_state() -> fos.StateDescription:
    """Get the current state description singleton on the server if it
    exists. Otherwise, initializes and sets the state description with
    default values.

    Returns:
        the :class:`fiftyone.core.state.StateDescription` server singleton
    """
    global _state
    if _state is None:
        _state = fos.StateDescription()

    return _state


def set_state(state: fos.StateDescription):
    """Set the current state.

    Args:
        state: a :class:`fiftyone.core.state.StateDescription` instance
    """
    global _state
    _state = state


def get_app_count():
    return _app_count


def decrement_app_count():
    global _app_count

    if _app_count:
        _app_count -= 1


def increment_app_count():
    global _app_count
    _app_count += 1


def get_listeners():
    return _LISTENERS


def get_requests():
    return _REQUESTS


def get_port():
    return _port


def set_port(port: int):
    global _port
    _port = port
