"""
FiftyOne Server ``/embeddings`` route.

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

import fiftyone as fo
from fiftyone.server.decorators import route


class Embeddings(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict):
        datasetName = request.query_params["dataset"]
        dataset = fo.load_dataset(datasetName)
        key = request.query_params["brain_key"]
        labels_field = request.query_params["labels_field"]
        results = dataset.load_brain_results(key)
        view = dataset.load_brain_view(key)
        return {
            "results": zip(
                view.values("id"),
                results.points,
                view.values(labels_field),  # for coloring the points
            )
        }
