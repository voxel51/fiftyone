"""
FiftyOne Server /pin route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone as fo
from fiftyone.core.session.events import StateUpdate
import fiftyone.core.stages as fost
import fiftyone.core.view as fov

from fiftyone.server.decorators import route
from fiftyone.server.query import serialize_dataset
import fiftyone.server.events as fose
import fiftyone.server.view as fosv


class Pin(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        subscription: str = data.get("subscription")
        filters = data.get("filters", {})
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        sample_ids = data.get("sample_ids", None)
        add_stages = data.get("add_stages", None)
        extended = data.get("extended", None)
        group_slice = data.get("slice", None)

        view = fosv.get_view(dataset, stages, filters)
        if sample_ids:
            view = fov.make_optimized_select_view(view, sample_ids)

        if add_stages:
            for d in add_stages:
                stage = fost.ViewStage._from_dict(d)
                view = view.add_stage(stage)

        if extended:
            view = fosv.extend_view(view, extended, True)

        state = fose.get_state()
        state.selected = []
        state.selected_labels = []
        state.dataset = fo.load_dataset(dataset)

        if state.dataset != view:
            state.view = view

        if group_slice:
            if state.view is not None:
                state.view.group_slice = group_slice
            else:
                state.dataset.group_slice = group_slice

        await fose.dispatch_event(subscription, StateUpdate(state=state))

        return {
            "state": state.serialize(),
            "dataset": serialize_dataset(state.dataset, state.view),
        }
