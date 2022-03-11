"""
FiftyOne Server /update route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.state as fos

from fiftyone.server.decorators import route
from fiftyone.server.state import set_state


class Update(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        state = fos.StateDescription.from_dict(data.get("state"))

        await set_state(state)

        return {"state": state.serialize()}
