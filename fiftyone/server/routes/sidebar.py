"""
FiftyOne Server /sidebar route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.odm.dataset as food

from fiftyone.server.decorators import route
import fiftyone.server.view as fosv


class Sidebar(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        groups = [
            food.SidebarGroupDocument(**group) for group in data["groups"]
        ]
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        view = fosv.get_view(dataset, stages=stages)

        view._dataset._doc.app_sidebar_groups = groups
        view._dataset._doc.save()

        return {"success": True}
