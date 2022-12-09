"""
FiftyOne Server /screenshot route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import Response

from fiftyone.core.session.events import get_screenshot


class Screenshot(HTTPEndpoint):
    async def get(self, request: Request) -> Response:
        img = request.path_params["img"]
        subscription, _ = img.split(".")

        return Response(
            get_screenshot(subscription),
            media_type="image/png",
            headers={
                "Cache-Control": "max-age=31536000",
                "Pragma": "public",
            },
        )
