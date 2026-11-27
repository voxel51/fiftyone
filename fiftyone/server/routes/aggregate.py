"""
FiftyOne Server /aggregation and /tagging routes

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.aggregations as foa
import fiftyone.core.view as fov

from fiftyone.server.decorators import route
from fiftyone.server.filters import GroupElementFilter, SampleFilter
import fiftyone.server.view as fosv


class Aggregate(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        filters = data.get("filters", None)
        dataset = data.get("dataset", None)
        sample_ids = data.get("sample_ids", None)
        stages = data.get("view", None)
        aggregations = data.get("aggregations", [])
        extended = data.get("extended", None)
        group_id = data.get("group_id", None)
        slices = data.get("slices", None)
        slice_ = data.get("slice", None)

        sample_filter = (
            SampleFilter(
                group=GroupElementFilter(
                    slice=slice_, id=group_id, slices=slices
                )
            )
            if any(v is not None for v in (slice_, group_id, slices))
            else None
        )

        view = await fosv.get_view(
            dataset, stages=stages, filters=filters, extended_stages=extended,
            sample_filter=sample_filter, awaitable=True,
        )

        if sample_ids:
            view = fov.make_optimized_select_view(view, sample_ids)

        aggregate_result = view.aggregate(
            [foa.Aggregation._from_dict(agg) for agg in aggregations]
        )
        return {"aggregate": aggregate_result}
