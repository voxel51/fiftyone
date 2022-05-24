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
import fiftyone.server.view as fosv


class Sort(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        dataset_name = data.get("dataset", None)
        filters = data.get("filters", {})
        stages = data.get("view", None)
        similarity = data.get("similarity", None)

        dataset = fod.load_dataset(dataset_name)
        dist_field = similarity.get("dist_field", None)

        if dist_field and not dataset.get_field(dist_field):
            dataset.add_sample_field(dist_field, fof.FloatField)

        fosv.get_view(dataset_name, stages, filters, similarity=similarity)

        state = fose.get_state().copy()
        view = fosv.get_view(dataset_name, stages, filters)
        state.dataset = view._dataset

        if isinstance(view, fov.DatasetView):
            state.view = view
        else:
            view = None

        return {"state": state.serialize()}
