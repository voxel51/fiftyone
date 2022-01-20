"""
FiftyOne Server filtering.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import tornado

import fiftyone.core.state as fos
import fiftyone.core.stages as fost
import fiftyone.core.view as fov

from fiftyone.server.state import catch_errors, StateHandler
from fiftyone.server.utils import AsyncRequestHandler
import fiftyone.server.view as fosv


class PinHandler(AsyncRequestHandler):
    @catch_errors
    async def post_response(self):
        data = tornado.escape.json_decode(self.request.body)

        filters = data.get("filters", None)
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        sample_ids = data.get("sample_ids", None)
        labels = data.get("labels", None)
        add_stages = data.get("add_stages", None)

        view = fosv.get_view(dataset, stages, filters)

        if sample_ids:
            view = fov.make_optimized_select_view(view, sample_ids)

        if labels:
            view = view.select_labels(labels)

        for d in add_stages:
            stage = fost.ViewStage._from_dict(d)
            view = view.add_stage(stage)

        state = fos.StateDescription.from_dict(StateHandler.state)
        state.selected = []
        state.selected_labels = []
        state.view = view

        await StateHandler.on_update(StateHandler, state.serialize())
