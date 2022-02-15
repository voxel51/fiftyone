"""
FiftyOne Server /session route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

from starlette.endpoints import WebSocketEndpoint
from starlette.websockets import WebSocket

import fiftyone.core.state as fos

from fiftyone.server.json_util import FiftyOneJSONEncoder
from fiftyone.server.state import set_state, subscribe


_clients: t.Dict[WebSocket, t.Callable[[], None]] = {}


class Session(WebSocketEndpoint):
    async def on_connect(self, websocket: WebSocket) -> None:
        async def on_update(state: fos.StateDescription):
            await websocket.send(FiftyOneJSONEncoder.dumps(state.serialize()))

        cleanup = subscribe(websocket, on_update)
        _clients[websocket] = cleanup
        await super().on_connect(websocket)

    async def on_receive(self, websocket: WebSocket, data: t.Any) -> None:
        state = fos.StateDescription.from_dict(data)
        set_state(state, source=websocket)

    async def on_disconnect(
        self, websocket: WebSocket, close_code: int
    ) -> None:
        cleanup = _clients.pop(websocket)
        cleanup()
