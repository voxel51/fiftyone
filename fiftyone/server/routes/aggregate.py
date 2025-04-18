"""
FiftyOne Server /aggregation and /tagging routes

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.view as fov

from fiftyone.server.decorators import route

import fiftyone.server.view as fosv
import fiftyone.core.odm as foo


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

        collection = foo.get_async_db_conn()[
            view._dataset._sample_collection_name
        ]

        ids = []
        points = []
        _results = foo.aggregate(
            collection,
            [
                {
                    "$project": {
                        "_id": "$_id",
                        "long": "$location.point.long",
                        "lat": "$location.point.lat",
                    }
                }
            ],
            "_id_1_location.point.long_1_location.point.lat_1",
        )

        async for value in _results:
            ids.append(str(value["_id"]))
            points.append([value["long"], value["lat"]])

        return {"aggregate": [ids, points]}
