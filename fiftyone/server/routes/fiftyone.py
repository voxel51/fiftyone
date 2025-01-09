"""
FiftyOne Server /fiftyone route

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request


import fiftyone.constants as foc

from fiftyone.server.decorators import route


class FiftyOne(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict) -> dict:
        return {
            "version": foc.VERSION,
            "dev": foc.DEV_INSTALL or foc.RC_INSTALL,
        }
