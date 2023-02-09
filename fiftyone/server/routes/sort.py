"""
FiftyOne Server ``/sort`` route.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.fields as fof
import fiftyone.core.utils as fou

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
        dist_field = data.get("dist_field", None)

        view = fosv.get_view(dataset_name, stages=stages, filters=filters)
        dataset = view._dataset

        state = fose.get_state().copy()
        state.dataset = dataset
        state.view = view

        if dist_field and not dataset.has_field(dist_field):
            dataset.add_sample_field(dist_field, fof.FloatField)
            _dataset = await serialize_dataset(
                dataset_name=dataset_name,
                serialized_view=view._serialize(),
                saved_view_slug=None,
            )
        else:
            _dataset = None

        return {"dataset": _dataset, "state": state.serialize()}
