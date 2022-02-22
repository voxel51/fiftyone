"""
FiftyOne Server /pin route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone as fo
import fiftyone.core.stages as fost
import fiftyone.core.view as fov

from fiftyone.server.decorators import route
from fiftyone.server.state import get_state, set_state
import fiftyone.server.view as fosv


class Pin(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        filters = data.get("filters", {})
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        sample_ids = data.get("sample_ids", None)
        add_stages = data.get("add_stages", None)
        similarity = data.get("similarity", None)

        view = fosv.get_view(dataset, stages, filters, similarity=similarity)
        if sample_ids:
            view = fov.make_optimized_select_view(view, sample_ids)

        if add_stages:
            for d in add_stages:
                stage = fost.ViewStage._from_dict(d)
                view = view.add_stage(stage)

        state = get_state()
        state.selected = []
        state.selected_labels = []
        state.dataset = fo.load_dataset(dataset)
        state.view = view

        set_state(state)

        return {"state": state.serialize()}
