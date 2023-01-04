"""
FiftyOne Server /screenshot route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import Response

import fiftyone.core.context as focx
from fiftyone.core.session.events import get_screenshot
from fiftyone.core.session.templates import SCREENSHOT_DATABRICKS

from fiftyone.server.decorators import route
from fiftyone.server.events import get_port


class Screenshot(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: t.Dict) -> Response:
        img = request.path_params["img"]
        proxy = request.query_params["proxy"]
        subscription, ext = img.split(".")
        screenshot = get_screenshot(subscription, False)
        if ext == "html":
            content = SCREENSHOT_DATABRICKS.render(
                subscription=subscription,
                image=f"{proxy}screenshot/{subscription}.jpeg?proxy={proxy}",
                proxy=proxy,
                max_width=screenshot.max_width,
            )
            media_type = "text/html"
        else:
            content = screenshot.bytes
            media_type = "image/png"

        return Response(
            content,
            media_type=media_type,
            headers={
                "Cache-Control": "max-age=31536000",
                "Pragma": "public",
            },
        )
