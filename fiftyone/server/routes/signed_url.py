"""
FiftyOne Server ``/resolve-fo3d`` route.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import Response

import fiftyone.core.storage as fos
from fiftyone.core.cache import media_cache
from fiftyone.server.decorators import route


def get_signed_url(cloud_path):
    # check if cloud_path, if not return as is
    file_system = fos.get_file_system(cloud_path)

    if (
        file_system == fos.FileSystem.LOCAL
        or file_system == fos.FileSystem.HTTP
    ):
        return cloud_path

    return media_cache.get_url(cloud_path, method="GET", hours=24)


class GetSignedUrl(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict) -> dict:
        cloud_path = request.query_params.get("cloud_path")

        if not cloud_path:
            raise ValueError("cloud_path is required")

        signed_url = get_signed_url(cloud_path)

        return Response(
            content=json.dumps({"signed_url": signed_url}),
            media_type="application/json",
            headers={"Cache-Control": "max-age=86400"},  # 24 hours
        )
