"""
FiftyOne Server /sort route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.view as fov

from fiftyone.server.decorators import route
import fiftyone.server.events as fose
from fiftyone.server.query import serialize_dataset
import fiftyone.server.view as fosv


class Sort(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        dataset_name = data.get("dataset", None)
        filters = data.get("filters", {})
        stages = data.get("view", None)
        extended = data.get("extended", None)
        dist_field = data.get("dist_field", None)

        dataset = fod.load_dataset(dataset_name)

        changed = False
        if dist_field and not dataset.get_field(dist_field):
            dataset.add_sample_field(dist_field, fof.FloatField)
            changed = True

        fosv.get_view(dataset_name, stages, filters, extended_stages=None)

        state = fose.get_state().copy()
        view = fosv.get_view(dataset_name, stages, filters)
        state.dataset = view._dataset

        if isinstance(view, fov.DatasetView):
            state.view = view
        else:
            view = None

        return {
            "dataset": serialize_dataset(dataset, state.view)
            if changed
            else None,
            "state": state.serialize(),
        }
