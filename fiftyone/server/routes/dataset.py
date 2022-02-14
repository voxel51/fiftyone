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


class DatasetHandler(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        dataset = data.get("dataset", None)
        dataset = fod.load_dataset(dataset) if dataset else None

        config = fos.StateDescription.from_dict(StateHandler.state).config
        active_handle = StateHandler.state["active_handle"]
        StateHandler.state = fos.StateDescription(
            dataset=dataset, config=config, active_handle=active_handle
        ).serialize()

        await StateHandler.on_update(StateHandler, StateHandler.state)
        return {}
