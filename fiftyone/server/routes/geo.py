"""
FiftyOne Server /geo route

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import logging
import os

from async_lru import alru_cache
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.server.view as fosv
from fiftyone.server.decorators import route

logger = logging.getLogger(__name__)

FIFTYONE_GEO_CACHE_SIZE = os.environ.get("FIFTYONE_GEO_CACHE_SIZE", 5)


# last_modified_at is included as an argument for cache keying purposes,
# it is not used within the function logic itself.
# filters_key, stages_key, extended_key are JSON strings for hashability
@alru_cache(maxsize=int(FIFTYONE_GEO_CACHE_SIZE))
async def _fetch_geo_points(
    dataset_name, path, filters_key, stages_key, extended_key, last_modified_at
):
    # deserialize keys back to Python objects for use
    filters = json.loads(filters_key) if filters_key else None
    stages = json.loads(stages_key) if stages_key else None
    extended = json.loads(extended_key) if extended_key else None

    view = await fosv.get_view(
        dataset_name,
        stages=stages,
        filters=filters,
        extended_stages=extended,
        awaitable=True,
    )

    # validate path is in schema
    field_path = f"{path}.point"
    if field_path not in view.get_field_schema(flat=True):
        raise ValueError(
            f"Path {field_path} not found in schema for dataset {dataset_name}"
        )

    project_stage = {
        "$project": {
            "_id": 0,
            "sampleId": {"$toString": "$_id"},
            "coordinates": f"${field_path}.coordinates",
        }
    }

    pipeline = view._pipeline(post_pipeline=[project_stage])

    collection = foo.get_async_db_conn()[view._dataset._sample_collection_name]

    agg_results = foo.aggregate(collection, pipeline)

    results = {}

    async for result in agg_results:
        if result and "sampleId" in result and "coordinates" in result:
            results[result["sampleId"]] = result["coordinates"]

    return results


class GeoPoints(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> JSONResponse:
        dataset_name = data.get("dataset")
        path = data.get("path")
        filters = data.get("filters", None)
        stages = data.get("view", None)
        extended = data.get("extended", None)

        if not path:
            return JSONResponse({"error": "path is required"}, status_code=400)

        if not dataset_name:
            return JSONResponse(
                {"error": "dataset is required"}, status_code=400
            )

        try:
            dataset = fo.load_dataset(dataset_name)
            if not dataset:
                return JSONResponse(
                    {"error": f"Dataset '{dataset_name}' not found"},
                    status_code=404,
                )

            last_modified_at = str(dataset.last_modified_at)

            filters_key = (
                json.dumps(filters, sort_keys=True) if filters else None
            )
            stages_key = json.dumps(stages, sort_keys=True) if stages else None
            extended_key = (
                json.dumps(extended, sort_keys=True) if extended else None
            )

            results = await _fetch_geo_points(
                dataset_name,
                path,
                filters_key,
                stages_key,
                extended_key,
                last_modified_at,
            )

            return JSONResponse(results)
        except ValueError as e:
            logger.warning(f"Geo points request failed: {str(e)}")
            return JSONResponse({"error": str(e)}, status_code=400)
        except Exception as e:
            logger.warning(f"Error fetching geo points: {e}")
            return JSONResponse(
                {"error": "Internal server error"}, status_code=500
            )
