"""
FiftyOne Server events polling.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import asdict
from datetime import datetime
import typing as t

from starlette.requests import Request

from fiftyone.core.session.events import (
    DeactivateNotebookCell,
    dict_factory,
    EventType,
    ListenPayload,
    StateUpdate,
)

from fiftyone.server.events.initialize import initialize_listener
from fiftyone.server.events.state import Listener, get_listeners, get_requests


_polling_listener: t.Optional[
    t.Tuple[str, t.Set[t.Tuple[str, Listener]]]
] = None


async def dispatch_polling_event_listener(
    _: Request, payload: ListenPayload
) -> t.Dict:
    """Polling event listener interface

    Note:

        The polling event listener is a singleton, and is only a fallback for
        Google's Colaboratory connections

    Args:
        request: the event source request
        payload: the initialization payload

    Returns:
        A server sent event source
    """
    global _polling_listener
    sub = None

    if _polling_listener is not None:
        sub, _ = _polling_listener

    if (
        sub != payload.subscription
        and payload.subscription not in get_listeners()
    ):
        data = await initialize_listener(payload)
        _polling_listener = (payload.subscription, data.request_listeners)

        return {
            "events": [
                {
                    "event": StateUpdate.get_event_name(),
                    "data": asdict(
                        StateUpdate(state=data.state),
                        dict_factory=dict_factory,
                    ),
                }
            ]
        }

    events: t.List[t.Tuple[datetime, EventType]] = []
    disconnect = False
    for _, listener in get_requests()[payload.subscription]:
        while listener.queue.qsize():
            event_tuple = listener.queue.get_nowait()
            if isinstance(event_tuple[1], DeactivateNotebookCell):
                disconnect = True

            events.append(event_tuple)

    if disconnect:
        del get_requests()[payload.subscription]

    events = sorted(events, key=lambda event: event[0])
    return {
        "events": [
            {
                "event": e.get_event_name(),
                "data": asdict(e, dict_factory=dict_factory),
            }
            for (_, e) in events
        ],
    }
