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

        dataset = fod.load_dataset(dataset)
        dataset._doc.app_sidebar_groups = groups
        dataset._doc.save()

        return {"success": True}
