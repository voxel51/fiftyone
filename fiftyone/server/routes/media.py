"""
FiftyOne server /media route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import FileResponse

from fiftyone.core.cache import media_cache


class MediaHandler(HTTPEndpoint):
    def get(self, request: Request):
        path = request.query_params["filepath"]

        if media_cache.is_local(path) and os.name != "nt":
            path = os.path.join("/", path)

        if media_cache.is_local_or_cached(path):
            path = media_cache.get_local_path(path)

        return FileResponse(path)
