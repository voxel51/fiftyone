"""
FiftyOne Server /values route

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.aggregations as foa

import fiftyone.server.constants as foc
from fiftyone.server.decorators import route
import fiftyone.server.view as fosv


class Values(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        dataset = data.get("dataset")
        path = data.get("path")
        selected = data.get("selected")
        search = data.get("search")
        asc = data.get("asc", True)
        count = data.get("count")
        limit = data.get("limit", foc.LIST_LIMIT)
        sample_id = data.get("sample_id", None)
        stages = data.get("view", [])
        extended = data.get("extended", None)

        view = fosv.get_view(dataset, stages=stages, extended_stages=extended)

        if sample_id is not None:
            view = view.select(sample_id)

        sort_by = "count" if count else "_id"

        count, first = await view._async_aggregate(
            foa.CountValues(
                path,
                _first=limit,
                _asc=asc,
                _sort_by=sort_by,
                _search=search,
                _selected=selected,
            )
        )

        return {
            "count": count,
            "values": map(lambda v: {"value": v[0], "count": v[1]}, first),
        }
