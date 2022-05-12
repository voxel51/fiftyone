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

        events.append(listener.queue.put(event))

    await asyncio.gather(*events)


async def add_event_listener(
    request: Request, payload: ListenPayload
) -> t.AsyncIterator:
    """Add an event listenere to the server.

    Args:
        request: the event source request
        payload: the initialization payload

    Returns:
        A server sent event source
    """
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

    try:
        if is_app:
            print("EVENT")
            yield ServerSentEvent(
                event=StateUpdate.get_event_name(),
                data=FiftyOneJSONEncoder.dumps(
                    asdict(
                        StateUpdate(state=state),
                        dict_factory=dict_factory,
                    )
                ),
            )

        while True:
            disconnected = await request.is_disconnected()
            if disconnected:
                await _disconnect(
                    is_app,
                    request_listeners,
                )
                break

            for _, listener in request_listeners:
                try:
                    result: EventType = listener.queue.get_nowait()
                except asyncio.QueueEmpty:
                    continue

                print("EVENT")
                yield ServerSentEvent(
                    event=result.get_event_name(),
                    data=FiftyOneJSONEncoder.dumps(
                        asdict(result, dict_factory=dict_factory)
                    ),
                )

            await asyncio.sleep(0.2)

    except asyncio.CancelledError as e:
        await _disconnect(is_app, request_listeners)
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
