"""
FiftyOne Server sidebar ordering.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import tornado

import fiftyone.core.odm.dataset as food
import fiftyone.core.dataset as fod

from fiftyone.server.utils import AsyncRequestHandler
import fiftyone.server.view as fosv


class SidebarHandler(AsyncRequestHandler):
    async def post_response(self):
        data = tornado.escape.json_decode(self.request.body)

        groups = [
            food.SidebarGroupDocument(**group) for group in data["groups"]
        ]
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        view = fosv.get_view(dataset, stages=stages)

        view._dataset._doc.app_sidebar_groups = groups
        view._dataset._doc.save()

        return {"success": True}
