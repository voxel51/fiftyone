"""
FiftyOne Server MCAP routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException

import fiftyone.server.mcap as fosm
from fiftyone.server.utils.datasets import get_dataset, get_sample_from_dataset
from fiftyone.server.utils.json import JSONResponse


def _raise_http_error(error):
    raise HTTPException(status_code=error.status_code, detail=error.detail)


def _get_dataset_and_sample(request):
    dataset = get_dataset(request.path_params["dataset_id"])
    sample = get_sample_from_dataset(dataset, request.path_params["sample_id"])
    return dataset, sample


class McapScene(HTTPEndpoint):
    """Returns MCAP scene inventory and playback-plan data."""

    async def get(self, request):
        dataset, sample = _get_dataset_and_sample(request)
        media_field = request.query_params.get("media_field")

        try:
            response = fosm.inspect_sample_mcap_scene(
                dataset, sample, media_field
            )
        except fosm.McapRouteError as error:
            _raise_http_error(error)
        except fosm.McapDependencyError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error

        return JSONResponse(response)


class McapBuffer(HTTPEndpoint):
    """Returns raw MCAP message windows for supported streams."""

    async def post(self, request):
        try:
            data = await request.json()
        except Exception as error:
            raise HTTPException(
                status_code=400, detail="Invalid JSON request body"
            ) from error

        dataset, sample = _get_dataset_and_sample(request)

        try:
            response = fosm.read_sample_mcap_window(
                dataset=dataset,
                sample=sample,
                media_field=data.get("mediaField"),
                stream_ids=data.get("streamIds"),
                window=data.get("window"),
                mode=data.get("mode", "raw"),
            )
        except fosm.McapRouteError as error:
            _raise_http_error(error)
        except fosm.McapDependencyError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error

        return JSONResponse(response)


class McapTimeline(HTTPEndpoint):
    """Returns timestamp indexes for supported MCAP playback streams."""

    async def post(self, request):
        try:
            data = await request.json()
        except Exception as error:
            raise HTTPException(
                status_code=400, detail="Invalid JSON request body"
            ) from error

        dataset, sample = _get_dataset_and_sample(request)

        try:
            response = fosm.read_sample_mcap_timeline_index(
                dataset=dataset,
                sample=sample,
                media_field=data.get("mediaField"),
                stream_ids=data.get("streamIds"),
            )
        except fosm.McapRouteError as error:
            _raise_http_error(error)
        except fosm.McapDependencyError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error

        return JSONResponse(response)


McapRoutes = [
    ("/dataset/{dataset_id}/sample/{sample_id}/mcap/scene", McapScene),
    ("/dataset/{dataset_id}/sample/{sample_id}/mcap/buffer", McapBuffer),
    ("/dataset/{dataset_id}/sample/{sample_id}/mcap/timeline", McapTimeline),
]
