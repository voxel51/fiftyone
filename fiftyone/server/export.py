"""
FiftyOne Server export.
| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import datetime

import pytz
import tornado

import fiftyone.core.odm as foo
import fiftyone.core.view as fov

from fiftyone.server.state import catch_errors
import fiftyone.server.utils as fosu
import fiftyone.server.view as fosv


class ExportHandler(fosu.AsyncRequestHandler):
    @catch_errors
    async def post_response(self):
        data = tornado.escape.json_decode(self.request.body)
        filters = data.get("filters", None)
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        sample_ids = data.get("sample_ids", None)

        view = fosv.get_view(dataset, stages=stages, filters=filters)

        if sample_ids:
            view = fov.make_optimized_select_view(view, sample_ids)

        now = datetime.now(pytz.utc)
        datetime.strftime(now, "%Y-%m-%d %H:%M:%S")

        self.set_header("Content-Type", "application/octet-stream")
        self.set_header(
            "Content-Disposition", f"attachment; filename={dataset}.csv"
        )

        collection = foo.get_async_db_conn()[
            view._dataset._sample_collection_name
        ]
        pipeline = view._pipeline() + [{"$project": {"filepath": 1}}]

        idx = 0
        async for row in foo.aggregate(collection, pipeline):
            self.write(f"{row['filepath']}\n")
            idx += 1

            if idx % 1000 == 0:
                await self.flush()
