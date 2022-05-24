"""
FiftyOne Server /colorscales route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import plotly.express as px

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

from fiftyone.server.decorators import route


class Colorscales(HTTPEndpoint):
    @route
    async def get(self, requst: Request, data: dict) -> dict:
        return {"colorscales": px.colors.named_colorscales()}
