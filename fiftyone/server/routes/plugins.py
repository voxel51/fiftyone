"""
FiftyOne Server ``/plugins`` route.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

from fiftyone.server.decorators import route
from fiftyone.plugins import list_plugins


class Plugins(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict):
        return {"plugins": [pd.to_dict() for pd in list_plugins()]}
