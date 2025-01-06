"""
FiftyOne Server /events route

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import typing as t

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

        return EventSourceResponse(
            add_event_listener(request, payload),
            ping=2,
        )
