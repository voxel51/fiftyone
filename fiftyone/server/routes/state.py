"""
FiftyOne Server /state route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dacite import from_dict
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from sse_starlette.sse import EventSourceResponse

from fiftyone.server.state import ListenPayload, listen
from fiftyone.server.decorators import route


class State(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> EventSourceResponse:
        return EventSourceResponse(
            listen(request, from_dict(ListenPayload, data))
        )
