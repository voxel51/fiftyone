"""
FiftyOne Server state

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass, asdict
import typing as t

import asyncio
from sse_starlette import ServerSentEvent
from starlette.requests import Request

import fiftyone.core.state as fos


T = t.TypeVar("T")


@dataclass
class Event(t.Generic[T]):
    data: T


class Update(Event):
    data: fos.StateDescription


class Capture(Event):
    data: dict


def _serialize(event: Event):
    return ServerSentEvent(
        **{"event": event.__class__.__name__, **asdict(event)}
    )


_listeners: t.Dict[Request, asyncio.Queue[Event]] = {}
_state = fos.StateDescription()


def get_state() -> fos.StateDescription:
    return _state


async def set_state(state: fos.StateDescription) -> None:
    global _state
    _state = state

    await dispatch_event(Update(data=state))


async def dispatch_event(event: Event):
    events = []
    for queue in _listeners.values():
        events.append(queue.put(event))

    await asyncio.gather(*events)


async def listen(request: Request,) -> t.AsyncIterator[Event]:
    _listeners[request] = asyncio.LifoQueue(maxsize=1)

    yield _serialize(Capture(data={"helloo": "world"}))
    try:
        while True:
            disconnected = await request.is_disconnected()
            if disconnected:
                _listeners.pop(request)
                break

            try:
                event = _listeners[request].get_nowait()
                yield _serialize(event)
            except asyncio.QueueEmpty:
                pass

            await asyncio.sleep(0.2)

    except asyncio.CancelledError as e:
        _listeners.pop(request)
        raise e
