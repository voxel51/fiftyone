"""
FiftyOne Server /state route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.requests import Request
from sse_starlette.sse import EventSourceResponse


from fiftyone.server.state import listen


async def state(request: Request):
    return EventSourceResponse(listen(request))
