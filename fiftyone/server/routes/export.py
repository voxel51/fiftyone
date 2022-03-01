"""
FiftyOne Server /export route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import datetime

import pytz
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import StreamingResponse

import fiftyone.core.odm as foo
import fiftyone.core.view as fov

from fiftyone.server.decorators import route
import fiftyone.server.view as fosv


class Export(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        filters = data.get("filters", None)
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        sample_ids = data.get("sample_ids", None)
        tags = data.get("tags", False)

        view = fosv.get_view(dataset, stages=stages, filters=filters)

        if sample_ids:
            view = fov.make_optimized_select_view(view, sample_ids)

        now = datetime.now(pytz.utc)
        datetime.strftime(now, "%Y-%m-%d %H:%M:%S")

        collection = foo.get_async_db_conn()[
            view._dataset._sample_collection_name
        ]
        pipeline = view._pipeline() + [
            {"$project": {"filepath": 1, "tags": tags}}
        ]

        async def response():
            async for row in foo.aggregate(collection, pipeline):
                if tags:
                    yield f"{row['filepath']},{','.join(row['tags'])}\n"
                else:
                    yield f"{row['filepath']}\n"

        return StreamingResponse(
            response(),
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f"attachment; filename={dataset}.csv"
            },
        )
