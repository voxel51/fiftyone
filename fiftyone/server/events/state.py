"""
FiftyOne Server events state.

| Copyright 2017-2026, Voxel51, Inc.
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


# open App connections per subscription; a client that reconnects before
# its old connection is detected as closed holds two for a while
_app_connections: t.Dict[t.Optional[str], int] = {}
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
    """Get the number of App clients connected to the server.

    Connections are counted by subscription, so a client whose reconnect
    overlaps its previous connection is counted once.

    Returns:
        the number of connected App clients
    """
    return len(_app_connections)


def decrement_app_count(subscription: t.Optional[str] = None):
    """Record that an App connection closed.

    Args:
        subscription (None): the subscription of the connection
    """
    connections = _app_connections.get(subscription, 0)
    if connections > 1:
        _app_connections[subscription] = connections - 1
    else:
        _app_connections.pop(subscription, None)


def increment_app_count(subscription: t.Optional[str] = None):
    """Record that an App connection opened.

    Args:
        subscription (None): the subscription of the connection
    """
    _app_connections[subscription] = _app_connections.get(subscription, 0) + 1


def get_listeners():
    return _LISTENERS


def get_requests():
    return _REQUESTS


def get_port():
    return _port


def set_port(port: int):
    global _port
    _port = port
