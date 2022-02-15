"""
FiftyOne Server state

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

import asyncio
from starlette.requests import Request
from starlette.websockets import WebSocket

import fiftyone.core.state as fos


_state = fos.StateDescription().serialize()


def get_state() -> fos.StateDescription:
    return _state


def set_state(
    state: fos.StateDescription, source: t.Union[Request, WebSocket] = None
) -> None:
    global _state
    _state = state

    events = []
    for listener, queue in _listeners.items():
        if source is listener:
            continue

        events.append(queue.put(state))

    asyncio.gather(*events)


_listeners: t.Dict[
    t.Union[Request, WebSocket], asyncio.Queue[fos.StateDescription]
] = {}


async def subscribe(
    websocket: WebSocket, callback: t.Callable[[]]
) -> t.Callable[[], None]:
    _listeners[websocket] = asyncio.LifoQueue(maxsize=1)

    def cleanup():
        _listeners.pop()

    return cleanup


async def listen(request: Request) -> t.AsyncGenerator[fos.StateDescription]:
    def cleanup():
        _listeners.pop(request)

    _listeners[request] = asyncio.LifoQueue(maxsize=1)

    try:
        yield get_state()
        while True:
            state = await _listeners[request].get()
            disconnected = await request.is_disconnected

            if disconnected:
                cleanup()
                break

            yield state

    except asyncio.CancelledError as e:
        cleanup()
        raise e
