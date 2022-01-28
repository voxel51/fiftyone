"""
FiftyOne Server export.
| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import tornado

import fiftyone.core.dataset as fod
import fiftyone.core.state as fos

from fiftyone.server.state import catch_errors, StateHandler
import fiftyone.server.utils as fosu


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

        await StateHandler.on_update(StateHandler, StateHandler.state)
        return {}
