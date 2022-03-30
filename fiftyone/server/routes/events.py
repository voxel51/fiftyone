"""
FiftyOne Server /events route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from sse_starlette.sse import EventSourceResponse

from fiftyone.server.events import ListenPayload, add_event_listener
from fiftyone.server.decorators import route


class Events(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> EventSourceResponse:
        return EventSourceResponse(
            add_event_listener(request, ListenPayload.from_dict(data))
        )
