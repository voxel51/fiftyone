"""
FiftyOne Server /geo route

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os

from async_lru import alru_cache
from bson import json_util
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse

import fiftyone.core.odm as foo
import fiftyone.server.view as fosv
from fiftyone.server.decorators import route

logger = logging.getLogger(__name__)

FIFTYONE_GEO_CACHE_SIZE = os.environ.get("FIFTYONE_GEO_CACHE_SIZE", 5)


# last_modified_at is included as an argument for cache keying purposes,
# it is not used within the function logic itself.
# filters_key, stages_key, extended_key are JSON strings for hashability
# For performance, we might want to batchify this so not all points are
# stored as a single huge entry
@alru_cache(maxsize=int(FIFTYONE_GEO_CACHE_SIZE))
async def _fetch_geo_points(
    dataset_name,
    collection_name,
    field_path,
    filters_key,
    stages_key,
    extended_key,
    last_modified_at,
):

    # deserialize keys back to Python objects for use
    filters = json_util.loads(filters_key) if filters_key else None
    stages = json_util.loads(stages_key) if stages_key else None
    extended = json_util.loads(extended_key) if extended_key else None

    if filters or stages or extended:
        view = await fosv.get_view(
            dataset_name,
            stages=stages,
            filters=filters,
            extended_stages=extended,
            awaitable=True,
        )
        pipeline = view._pipeline()
    else:
        pipeline = []

    # only return the minimum amount of data needed to minimize network
    # overhead
    pipeline += [
        {
            "$project": {
                "_id": 1,
                "coordinates": f"${field_path}.coordinates",
            }
        },
    ]

    collection = foo.get_async_db_conn()[collection_name]

    results = {}

    async for doc in collection.aggregate(pipeline):
        try:
            results[str(doc["_id"])] = doc["coordinates"]
        except:
            # invalid/missing entry
            pass

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
            dataset = await fosv.load_view(dataset_name, [])
            dataset = dataset._dataset

            last_modified_at = str(dataset.last_modified_at)

            filters_key = (
                json_util.dumps(filters, sort_keys=True) if filters else None
            )
            stages_key = (
                json_util.dumps(stages, sort_keys=True) if stages else None
            )
            extended_key = (
                json_util.dumps(extended, sort_keys=True) if extended else None
            )

            # validate path is in schema
            field_path = f"{path}.point"
            if field_path not in dataset.get_field_schema(flat=True):
                raise ValueError(
                    f"Path {field_path} not found in schema for dataset {dataset_name}"
                )

            # pass the collection name to avoid loading the dataset again if no
            # filters
            results = await _fetch_geo_points(
                dataset_name,
                dataset._sample_collection_name,
                field_path,
                filters_key,
                stages_key,
                extended_key,
                last_modified_at,
            )

            return results
        except ValueError as e:
            logger.warning(f"Geo points request failed: {str(e)}")
            return JSONResponse({"error": str(e)}, status_code=400)
        except Exception as e:
            logger.warning(f"Error fetching geo points: {e}")
            return JSONResponse(
                {"error": "Internal server error"}, status_code=500
            )
