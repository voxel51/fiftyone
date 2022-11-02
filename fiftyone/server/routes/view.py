"""
FiftyOne Server ``/view`` route.
| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import glob
import os
import numpy as np

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import eta.core.serial as etas
import fiftyone.server.view as fosv

import fiftyone as fo
from fiftyone.server.decorators import route


class View(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict):
        datasetName = request.query_params["dataset"]
        dataset = fo.load_dataset(datasetName)
        if not dataset:
            return None
        viewName = request.query_params["view"]
        view = dataset.load_view(viewName)
        return view

    # @route
    # async def post(self, request: Request, data: dict):
    #     return {}
