"""
FiftyOne Server /events route

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import typing as t

import anyio
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from sse_starlette.sse import EventSourceResponse

from fiftyone.core.session.events import ListenPayload

from fiftyone.server.events import (
    add_event_listener,
    dispatch_polling_event_listener,
)
from fiftyone.server.decorators import route


class Events(HTTPEndpoint):
    @route
    async def post(
        self, request: Request, data: dict
    ) -> t.Union[t.Dict, EventSourceResponse]:
        polling = data.pop("polling", False)
        payload = await ListenPayload.from_dict(data)
        if polling:
            return await dispatch_polling_event_listener(request, payload)

        return _EventSourceResponse(
            add_event_listener(request, payload),
            ping=2,
        )


class _EventSourceResponse(EventSourceResponse):
    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            # A cancelled send can leave the listener suspended at a yield.
            with anyio.CancelScope(shield=True):
                await self.body_iterator.aclose()
