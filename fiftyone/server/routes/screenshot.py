"""
FiftyOne Server /screenshot route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
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
    async def get(self, request: Request) -> Response:
        img = request.path_params["img"]
        subscription, ext = img.split(".")
        screenshot = get_screenshot(subscription, False)
        url = str(request.url)[: -len(f"screenshot/{subscription}.html")]
        if ext == "html":
            content = SCREENSHOT_DATABRICKS.render(
                subscription=subscription,
                image=f"{str(request.url)[:-4]}jpeg",
                url=url,
                session_url=focx.get_url("localhost", get_port()),
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