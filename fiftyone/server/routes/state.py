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


class State(HTTPEndpoint):
    async def post(self, request: Request):
        return EventSourceResponse(listen(request))
