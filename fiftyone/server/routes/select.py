"""
FiftyOne Server /select route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

from fiftyone.server.decorators import route
from fiftyone.server.state import get_state, set_state


class Select(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        ids = data.get("ids", None)
        labels = data.get("labels", None)

        state = get_state()

        if ids is not None:
            state.selected = ids

        if labels is not None:
            state.selected_labels = labels

        set_state(state)
