"""
FiftyOne Server state

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass
import typing as t

import asyncio
from starlette.requests import Request
from starlette.websockets import WebSocket

import fiftyone.core.state as fos


T = t.TypeVar("T", bound=dataclass)


@dataclass
class Event(t.Generic[T]):
    data: T


class Update(Event):
    data: fos.StateDescription


class Capture(Event):
    data: dict


_listeners: t.Dict[
    t.Union[Request, WebSocket],
    asyncio.Queue[t.Union[fos.StateDescription, Event]],
] = {}
_state = fos.StateDescription()


def get_state() -> fos.StateDescription:
    return _state


async def set_state(
    state: fos.StateDescription, source: Request = None
) -> None:
    global _state
    _state = state

    await dispatch_event(Update(data=state))


async def dispatch_event(event: Event, source: Request = None):
    events = []
    for listener, queue_or_callback in _listeners.items():
        if source is listener:
            continue

        if isinstance(queue_or_callback, asyncio.LifoQueue):
            event = queue_or_callback.put(event)
        else:
            event = queue_or_callback()

        events.append(event)

    await asyncio.gather(*events)


async def listen(request: Request,) -> t.AsyncIterator[Event]:
    def cleanup() -> None:
        _listeners.pop(request)

    _listeners[request] = asyncio.LifoQueue(maxsize=1)

    try:
        yield get_state()
        while True:
            event = await _listeners[request].get()
            disconnected = await request.is_disconnected

            if disconnected:
                cleanup()
                break

            yield event

    except asyncio.CancelledError as e:
        cleanup()
        raise e
