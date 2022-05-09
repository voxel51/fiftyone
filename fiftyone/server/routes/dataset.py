"""
FiftyOne Server /dataset route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.dataset as fod
import fiftyone.core.state as fos

from fiftyone.server.decorators import route
from fiftyone.server.state import get_state, set_state


class Dataset(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        dataset = data.get("dataset", None)
        dataset = fod.load_dataset(dataset) if dataset else None

        state = get_state()

        return {}
