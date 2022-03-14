"""
FiftyOne Server /update route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.state as fos

from fiftyone.server.decorators import route
from fiftyone.server.state import set_state


class UpdateData(t.TypedDict):
    state: t.Optional[t.Dict]
    subscription: str


class Update(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> t.Dict:
        state = fos.StateDescription.from_dict(data.get("state"))

        await set_state(data["subscription"], state)

        return {"state": state.serialize()}
