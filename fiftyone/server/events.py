"""
FiftyOne Server events

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from dataclasses import asdict, dataclass
import typing as t
from datetime import datetime

import asyncio
from sse_starlette import ServerSentEvent
from starlette.requests import Request

import fiftyone as fo
from fiftyone.core.json import FiftyOneJSONEncoder
from fiftyone.core.session.events import (
    CloseSession,
    dict_factory,
    EventType,
    ListenPayload,
    StateUpdate,
)
import fiftyone.core.state as fos


@dataclass(frozen=True)
class Listener:
    queue: asyncio.Queue
    subscription: str


_listeners: t.Dict[str, t.Set[Listener]] = defaultdict(set)
_polling_listener: t.Optional[
    t.Tuple[str, t.Set[t.Tuple[str, Listener]]]
] = None
_state: t.Optional[fos.StateDescription] = None
_app_count = 0


async def dispatch_event(
    subscription: t.Optional[str], event: EventType
) -> None:
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

        events.append(listener.queue.put((datetime.now(), event)))

    await asyncio.gather(*events)


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
    data = await _initialize_listener(payload)
    try:
        if data.is_app:
            yield ServerSentEvent(
                event=StateUpdate.get_event_name(),
                data=FiftyOneJSONEncoder.dumps(
                    asdict(
                        StateUpdate(state=data.state),
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

            for (_, event) in events:
                yield ServerSentEvent(
                    event=event.get_event_name(),
                    data=FiftyOneJSONEncoder.dumps(
                        asdict(event, dict_factory=dict_factory)
                    ),
                )

            await asyncio.sleep(0.2)

    except asyncio.CancelledError as e:
        await _disconnect(data.is_app, data.request_listeners)
        raise e


async def dispatch_polling_event_listener(
    request: Request, payload: ListenPayload
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
    listeners = None
    if _polling_listener is not None:
        sub, listeners = _polling_listener

    if sub != payload.subscription:
        if sub is not None and listeners:
            await _disconnect(True, listeners)

        data = await _initialize_listener(payload)
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

    if not listeners:
        raise ValueError("no listeners")

    events: t.List[t.Tuple[datetime, EventType]] = []
    for _, listener in listeners:
        if listener.queue.qsize():
            events.append(listener.queue.get_nowait())

    events = sorted(events, key=lambda event: event[0])

    return {
        "events": [
            {
                "event": e.get_event_name(),
                "data": asdict(e, dict_factory=dict_factory),
            }
            for e in events
        ]
    }


def get_state() -> fos.StateDescription:
    """Get the current state description singleton on the server

    Returns:
        the :class:`fiftyone.core.state.StateDescription` server singleton
    """
    global _state
    if _state is None:
        _state = fos.StateDescription()

    return _state


async def _disconnect(
    is_app: bool, listeners: t.Set[t.Tuple[str, Listener]]
) -> None:
    for event_name, listener in listeners:
        _listeners[event_name].remove(listener)

    if is_app:
        global _app_count
        _app_count -= 1

        if not _app_count:
            await dispatch_event(None, CloseSession())


@dataclass
class InitializedListener:
    is_app: bool
    request_listeners: t.Set[t.Tuple[str, Listener]]
    state: fos.StateDescription


async def _initialize_listener(payload: ListenPayload) -> InitializedListener:
    state = get_state()
    is_app = not isinstance(payload.initializer, fos.StateDescription)
    if is_app:
        global _app_count
        _app_count += 1

    current = state.dataset.name if state.dataset is not None else None
    if is_app and payload.initializer != current:
        if payload.initializer is not None:
            try:
                state.dataset = fo.load_dataset(payload.initializer)
            except:
                state.dataset = None
            state.selected = []
            state.selected_labels = []
            state.view = None

            await dispatch_event(payload.subscription, StateUpdate(state))

    elif not is_app:
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

    return InitializedListener(is_app, request_listeners, state)
