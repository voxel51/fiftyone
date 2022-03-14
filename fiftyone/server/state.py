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

import fiftyone as fo

import fiftyone.core.state as fos


T = t.TypeVar("T")


@dataclass
class Event(t.Generic[T]):
    data: T


class Update(Event):
    data: fos.StateDescription


class Capture(Event):
    data: dict


def _serialize(event: Event) -> ServerSentEvent:
    return ServerSentEvent(
        **{"event": event.__class__.__name__, **asdict(event)}
    )


_listeners: t.Dict[str, asyncio.Queue[Event]] = {}
_state = fos.StateDescription()


def get_state() -> fos.StateDescription:
    return fos.StateDescription()


async def set_state(subscription: str, state: fos.StateDescription) -> None:
    global _state
    _state = state

    await dispatch_event(
        Update(data=state), subscription,
    )


async def dispatch_event(event: Event, subscription: str = None) -> None:
    events = []
    for sub, queue in _listeners.items():
        if sub == subscription:
            continue

        events.append(queue.put(event))

    await asyncio.gather(*events)


@dataclass
class ListenPayload:
    dataset: t.Optional[str]
    subscription: str


async def listen(
    request: Request, payload: ListenPayload
) -> t.AsyncIterator[ServerSentEvent]:
    dataset = fo.load_dataset(payload.dataset) if payload.dataset else None

    state = get_state()
    if dataset != state.dataset:
        state.selected = []
        state.selected_labels = []
        state.view = None
        state.dataset = dataset or None

        await set_state(payload.subscription, state)

    _listeners[payload.subscription] = asyncio.LifoQueue(maxsize=1)

    try:
        while True:
            disconnected = await request.is_disconnected()
            if disconnected:
                _listeners.pop(payload.subscription)
                break

            try:
                event = _listeners[payload.subscription].get_nowait()
                yield _serialize(event)
            except asyncio.QueueEmpty:
                pass

            await asyncio.sleep(0.2)

    except asyncio.CancelledError as e:
        _listeners.pop(payload.subscription)
        raise e
