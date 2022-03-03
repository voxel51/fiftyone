"""
FiftyOne Server state setters.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.core.dataset as fod
import fiftyone.core.state as fos

from fiftyone.server.state import catch_errors, StateHandler
import fiftyone.server.utils as fosu


class DatasetHandler(fosu.AsyncRequestHandler):
    @catch_errors
    async def post_response(self, data):
        dataset = data.get("dataset", None)
        dataset = fod.load_dataset(dataset) if dataset else None

        config = fos.StateDescription.from_dict(StateHandler.state).config
        active_handle = StateHandler.state["active_handle"]
        StateHandler.state = fos.StateDescription(
            dataset=dataset, config=config, active_handle=active_handle
        ).serialize()

        await StateHandler.on_update(StateHandler, StateHandler.state)
        return {}
