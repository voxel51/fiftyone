"""
FiftyOne Server events.

| Copyright 2017-2023, Voxel51, Inc.
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

import fiftyone.core.context as focx
import fiftyone.core.dataset as fod
from fiftyone.core.json import FiftyOneJSONEncoder
from fiftyone.core.session.events import (
    add_screenshot,
    CaptureNotebookCell,
    CloseSession,
    DeactivateNotebookCell,
    ReactivateNotebookCell,
    dict_factory,
    EventType,
    ListenPayload,
    StateUpdate,
)
import fiftyone.core.state as fos
import fiftyone.core.utils as fou

from fiftyone.server.query import serialize_dataset


@dataclass(frozen=True)
class Listener:
    queue: asyncio.Queue
    subscription: str


_listeners: t.Dict[str, t.Set[Listener]] = defaultdict(set)
_requests: t.Dict[str, t.Set[t.Tuple[str, Listener]]] = {}
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
    if isinstance(event, CaptureNotebookCell) and focx.is_databricks_context():
        add_screenshot(event)
        return

    if isinstance(event, StateUpdate):
        global _state
        _state = event.state

    if isinstance(event, ReactivateNotebookCell):
        await dispatch_event(subscription, DeactivateNotebookCell())

    for listener in _listeners[event.get_event_name()]:
        if listener.subscription == subscription:
            continue

        listener.queue.put_nowait((datetime.now(), event))


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
            d = asdict(
                StateUpdate(state=data.state),
                dict_factory=dict_factory,
            )
            if data.state.dataset is not None:
                d["dataset"] = await serialize_dataset(
                    dataset_name=data.state.dataset.name,
                    serialized_view=data.state.view._serialize()
                    if data.state.view is not None
                    else [],
                    saved_view_slug=fou.to_slug(data.state.view.name)
                    if data.state.view is not None and data.state.view.name
                    else None,
                )

            yield ServerSentEvent(
                event=StateUpdate.get_event_name(),
                data=FiftyOneJSONEncoder.dumps(d),
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
                d = asdict(event, dict_factory=dict_factory)

                if (
                    data.is_app
                    and isinstance(event, StateUpdate)
                    and event.state.dataset is not None
                ):
                    d["dataset"] = await serialize_dataset(
                        dataset_name=event.state.dataset.name,
                        serialized_view=event.state.view._serialize()
                        if event.state.view is not None
                        else [],
                        saved_view_slug=fou.to_slug(event.state.view.name)
                        if event.state.view is not None
                        and event.state.view.name
                        else None,
                    )

                yield ServerSentEvent(
                    event=event.get_event_name(),
                    data=FiftyOneJSONEncoder.dumps(d),
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
    global _requests
    sub = None

    if _polling_listener is not None:
        sub, _ = _polling_listener

    if sub != payload.subscription and payload.subscription not in _requests:
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

    events: t.List[t.Tuple[datetime, EventType]] = []
    disconnect = False
    for _, listener in _requests[payload.subscription]:
        while listener.queue.qsize():
            event_tuple = listener.queue.get_nowait()
            if isinstance(event_tuple[1], DeactivateNotebookCell):
                disconnect = True

            events.append(event_tuple)

    if disconnect:
        del _requests[payload.subscription]

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


async def _disconnect(
    is_app: bool, listeners: t.Set[t.Tuple[str, Listener]]
) -> None:
    for event_name, listener in listeners:
        _listeners[event_name].remove(listener)

    if is_app:
        global _app_count
        _app_count -= 1

        if not _app_count and focx._get_context() == focx._NONE:
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

    current = state.dataset.name if state.dataset else None
    current_saved_view_slug = state.saved_view_slug
    if not isinstance(payload.initializer, fos.StateDescription):
        update = False
        if (
            payload.initializer.dataset
            and payload.initializer.dataset != current
        ):
            update = True
            try:
                state.dataset = fod.load_dataset(payload.initializer.dataset)
                state.selected = []
                state.selected_labels = []
                state.view = None
                state.view_name = None
                state.saved_view_slug = None
            except:
                state.dataset = None
                state.selected = []
                state.selected_labels = []
                state.view = None
                state.view_name = None
                state.saved_view_slug = None
            else:
                if payload.initializer.view:
                    try:
                        doc = state.dataset._get_saved_view_doc(
                            payload.initializer.view, slug=True
                        )
                        state.view = state.dataset.load_saved_view(doc.name)
                        state.selected = []
                        state.selected_labels = []
                        state.saved_view_slug = payload.initializer.view
                        state.view_name = doc.name
                    except:
                        pass
        elif (
            payload.initializer.view
            and payload.initializer.view != current_saved_view_slug
        ):
            update = True
            try:
                doc = state.dataset._get_saved_view_doc(
                    payload.initializer.view, slug=True
                )
                state.view = state.dataset.load_saved_view(doc.name)
                state.selected = []
                state.selected_labels = []
                state.saved_view_slug = payload.initializer.view
                state.view_name = doc.name
            except:
                state.view = None
                state.selected = []
                state.selected_labels = []
                state.view_name = None
                state.saved_view_slug = None
                pass

        if update:
            await dispatch_event(payload.subscription, StateUpdate(state))

    elif not is_app:
        state = payload.initializer
        await dispatch_event(payload.subscription, StateUpdate(state))

    request_listeners: t.Set[t.Tuple[str, Listener]] = set()
    for event_name in payload.events:
        listener = Listener(
            queue=asyncio.LifoQueue(maxsize=1000),
            subscription=payload.subscription,
        )
        _listeners[event_name].add(listener)
        request_listeners.add((event_name, listener))

    global _requests
    _requests[payload.subscription] = request_listeners

    return InitializedListener(is_app, request_listeners, state)


_PORT = None


def set_port(port: int):
    global _PORT
    _PORT = port


def get_port() -> int:
    return _PORT
