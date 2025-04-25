"""
FiftyOne Server /geo route

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse

import fiftyone.core.odm as foo
import fiftyone.core.view as fov
import fiftyone.server.view as fosv
from fiftyone.server.decorators import route


class GeoPoints(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        dataset = data.get("dataset")
        path = data.get("path")
        filters = data.get("filters", None)
        sample_ids = data.get("sample_ids", None)
        stages = data.get("view", None)
        extended = data.get("extended", None)

        if not path:
            return JSONResponse({"error": "path is required"}, status_code=400)

        if not dataset:
            return JSONResponse(
                {"error": "dataset is required"}, status_code=400
            )

        view = await fosv.get_view(
            dataset,
            stages=stages,
            filters=filters,
            extended_stages=extended,
            awaitable=True,
        )

        # if sample ids are provided, restrict to those samples
        if sample_ids:
            view = fov.make_optimized_select_view(view, sample_ids)

        # validate path is in schema, if not return error
        if f"{path}.point" not in view.get_field_schema(flat=True):
            return JSONResponse(
                {
                    "error": f"Path {path}.point not found in schema for dataset {dataset}"
                },
                status_code=400,
            )

        project_stage = {
            "$project": {
                "_id": 0,
                "sampleId": {"$toString": "$_id"},
                "coordinates": f"${path}.point.coordinates",
            }
        }

        pipeline = view._pipeline(post_pipeline=[project_stage])

        collection = foo.get_async_db_conn()[
            view._dataset._sample_collection_name
        ]

        # hinting by id leads to 100% IXSCAN and 0% COLLSCAN
        agg_results = foo.aggregate(collection, pipeline, hints={"_id": 1})

        results = {}

        async for result in agg_results:
            results[result["sampleId"]] = result["coordinates"]

        return JSONResponse(results)
