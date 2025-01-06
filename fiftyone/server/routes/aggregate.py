"""
FiftyOne Server /aggregation and /tagging routes

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.aggregations as foa
import fiftyone.core.view as fov

from fiftyone.server.decorators import route

import fiftyone.server.view as fosv


class Aggregate(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        filters = data.get("filters", None)
        dataset = data.get("dataset", None)
        sample_ids = data.get("sample_ids", None)
        stages = data.get("view", None)
        aggregations = data.get("aggregations", [])

        view = await fosv.get_view(
            dataset, stages=stages, filters=filters, awaitable=True
        )

        if sample_ids:
            view = fov.make_optimized_select_view(view, sample_ids)

        aggregate_result = view.aggregate(
            [foa.Aggregation._from_dict(agg) for agg in aggregations]
        )
        return {"aggregate": aggregate_result}
