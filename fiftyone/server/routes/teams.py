"""
FiftyOne Server /teams route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import eta.core.serial as etas

import fiftyone.constants as foc

from fiftyone.server.decorators import route


class Teams(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        submitted = data.get("submitted", "") == "true"
        etas.write_json({"submitted": submitted}, foc.TEAMS_PATH)

        return {}
