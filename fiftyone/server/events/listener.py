"""
FiftyOne Server events listening.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
from dataclasses import asdict
from datetime import datetime
import typing as t

from bson import json_util
from sse_starlette import ServerSentEvent
from starlette.requests import Request

import fiftyone.core.context as focx
from fiftyone.core.session.events import (
    CloseSession,
    EventType,
    ListenPayload,
    StateUpdate,
    dict_factory,
)

from fiftyone.server.events.dispatch import dispatch_event
from fiftyone.server.events.initialize import initialize_listener
from fiftyone.server.events.state import (
    Listener,
    decrement_app_count,
    get_app_count,
    get_listeners,
)


async def add_event_listener(
    request: Request, payload: ListenPayload
) -> t.AsyncIterator:
    """Add an event listener to the server

    Args:
        request: the event source request
        payload: the initialization payload

    Returns:
        A server sent event source
    """
    data = await initialize_listener(payload)
    try:
        if data.is_app:
            yield ServerSentEvent(
                event=StateUpdate.get_event_name(),
                data=json_util.dumps(
                    asdict(
                        StateUpdate(state=data.state.serialize()),
                        dict_factory=dict_factory,
                    )
                ),
            )

        while True:
            disconnected = await request.is_disconnected()
            if disconnected:
                await _disconnect(
                    data.is_app,
                    data.request_listeners,
                )
                break

            events: t.List[t.Tuple[datetime, EventType]] = []
            for _, listener in data.request_listeners:
                if listener.queue.qsize():
                    events.append(listener.queue.get_nowait())

            events = sorted(events, key=lambda event: event[0])

            for _, event in events:
                if isinstance(event, StateUpdate):
                    # we copy here as this is a shared object
                    event = StateUpdate(state=event.state.serialize())

                yield ServerSentEvent(
                    event=event.get_event_name(),
                    data=json_util.dumps(
                        asdict(event, dict_factory=dict_factory)
                    ),
                )

            await asyncio.sleep(0.2)

    except asyncio.CancelledError as e:
        await _disconnect(data.is_app, data.request_listeners)
        raise e


async def _disconnect(
    is_app: bool, listeners: t.Set[t.Tuple[str, Listener]]
) -> None:
    for event_name, listener in listeners:
        get_listeners()[event_name].remove(listener)

    if is_app:
        decrement_app_count()

        if get_app_count() and focx._get_context() == focx._NONE:
            await dispatch_event(None, CloseSession())
