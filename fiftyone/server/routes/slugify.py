"""
FiftyOne Server /slugify route

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import typing as t

from fiftyone.core.utils import to_slug
from fiftyone.server.decorators import route


class Slugify(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> t.Dict[str, str]:
        print(request)
        name = data.get("name")
        if name:
            return {"slug": to_slug(name)}
