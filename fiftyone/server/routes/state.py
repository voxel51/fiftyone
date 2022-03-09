"""
FiftyOne Server /state route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from sse_starlette.sse import EventSourceResponse

from fiftyone.server.state import listen
from fiftyone.server.decorators import route


class State(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        return EventSourceResponse(listen(request, data))
