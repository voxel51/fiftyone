"""
FiftyOne Server events

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from dataclasses import asdict, dataclass
import typing as t

import asyncio
from sse_starlette import ServerSentEvent
from starlette.requests import Request

import fiftyone as fo
from fiftyone.core.session.events import EventType, ListenPayload, StateUpdate
import fiftyone.core.state as fos


@dataclass(frozen=True)
class Listener:
    queue: asyncio.Queue[EventType]
    subscription: str


_listeners: t.Dict[str, t.Set[Listener]] = defaultdict(set)
_state: t.Optional[fos.StateDescription] = None


async def dispatch_event(subscription: str, event: EventType) -> None:
    """Dispatch an event to all listeners registed for the server process

    Args:
        subscription: the calling subscription id
        event: the event
    """
    if isinstance(event, StateUpdate):
        global _state
        _state = event.state

    events = []
    for listener in _listeners[event.get_event_name()]:
        if listener.subscription == subscription:
            continue

        events.append(listener.queue.put(event))

    await asyncio.gather(*events)


async def add_event_listener(
    request: Request, payload: ListenPayload
) -> t.AsyncIterator[ServerSentEvent]:
    """Add an event listenere to the server.

    Args:
        request: the event source request
        payload: the initialization payload

    Returns:
        A server sent event source
    """
    state = get_state()
    if (
        isinstance(payload.initializer, (str, type(None)))
        and payload.initializer != state.dataset
    ):
        dataset = (
            fo.load_dataset(payload.initializer)
            if payload.initializer is not None
            else None
        )
        state.selected = []
        state.selected_labels = []
        state.view = None
        state.dataset = dataset or None

        await dispatch_event(payload.subscription, StateUpdate(state))

    elif isinstance(payload.initializer, fos.StateDescription):
        state = payload.initializer
        await dispatch_event(payload.subscription, StateUpdate(state))

    request_listeners: t.Set[t.Tuple[str, Listener]] = set()
    for event_name in payload.events:
        listener = Listener(
            queue=asyncio.LifoQueue(maxsize=1),
            subscription=payload.subscription,
        )
        _listeners[event_name].add(listener)
        request_listeners.add((event_name, listener))

    try:
        while True:
            disconnected = await request.is_disconnected()
            if disconnected:
                for event_name, listener in request_listeners:
                    _listeners[event_name].remove(listener)
                break

            for _, listener in request_listeners:
                try:
                    result = listener.queue.get_nowait()
                except asyncio.QueueEmpty:
                    continue

                yield ServerSentEvent(
                    event=result.__class__.__name__, data=asdict(result)
                )

            await asyncio.sleep(0.2)

    except asyncio.CancelledError as e:
        for event_name, listener in request_listeners:
            _listeners[event_name].remove(listener)
        raise e


def get_state() -> fos.StateDescription:
    """Get the current state description singleton on the server

    Returns:
        the :class:`fiftyone.core.state.StateDescription` server singleton
    """
    global _state
    if _state is None:
        _state = fos.StateDescription()

    return _state
