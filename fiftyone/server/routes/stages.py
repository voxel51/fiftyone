"""
FiftyOne Server /stages route

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

from fiftyone.core.stages import _STAGES

from fiftyone.server.decorators import route


class Stages(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict):
        return {
            "stages": [
                {"name": stage.__name__, "params": stage._params()}
                for stage in _STAGES
            ]
        }
