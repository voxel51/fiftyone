"""
FiftyOne Server multimodal routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import anyio
from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException

import fiftyone.server.multimodal as fosm
from fiftyone.server.utils.datasets import get_dataset, get_sample_from_dataset
from fiftyone.server.utils.json import JSONResponse


def _raise_http_error(error):
    raise HTTPException(status_code=error.status_code, detail=error.detail)


def _get_dataset_and_sample(request):
    dataset = get_dataset(request.path_params["dataset_id"])
    sample = get_sample_from_dataset(dataset, request.path_params["sample_id"])
    return dataset, sample


async def _read_request_json(request):
    try:
        return await request.json()
    except Exception as error:
        raise HTTPException(
            status_code=400, detail="Invalid JSON request body"
        ) from error


class MultimodalWorkspace(HTTPEndpoint):
    """Returns multimodal workspace inventory and rendering defaults."""

    async def get(self, request):
        dataset, sample = _get_dataset_and_sample(request)
        media_field = request.query_params.get("mediaField")

        try:
            response = fosm.inspect_sample_multimodal_workspace(
                dataset=dataset,
                sample=sample,
                media_field=media_field,
                source_kind=request.query_params.get("sourceKind"),
            )
        except fosm.MultimodalRouteError as error:
            _raise_http_error(error)
        except fosm.MultimodalDependencyError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error

        return JSONResponse(response)


class MultimodalIngest(HTTPEndpoint):
    """Persists multimodal catalog and rendering-plan data."""

    async def post(self, request):
        data = await _read_request_json(request)
        dataset, sample = _get_dataset_and_sample(request)

        try:
            response = fosm.ingest_sample_multimodal_workspace(
                dataset=dataset,
                sample=sample,
                media_field=data.get("mediaField"),
                overwrite=bool(data.get("overwrite", False)),
                source_kind=data.get("sourceKind"),
            )
        except fosm.MultimodalRouteError as error:
            _raise_http_error(error)
        except fosm.MultimodalDependencyError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error

        return JSONResponse(response)


class MultimodalStreamWindow(HTTPEndpoint):
    """Returns raw multimodal message windows for requested streams."""

    async def post(self, request):
        data = await _read_request_json(request)
        dataset, sample = _get_dataset_and_sample(request)

        try:
            stream_ids = fosm._normalize_stream_ids(data.get("streamIds"))
            start_time_ns = fosm._normalize_time_value(
                data.get("startTimeNs"), "startTimeNs"
            )
            end_time_ns = fosm._normalize_time_value(
                data.get("endTimeNs"), "endTimeNs"
            )
            if start_time_ns > end_time_ns:
                raise fosm.MultimodalRouteError(
                    400, "startTimeNs must be <= endTimeNs"
                )

            response = fosm.read_sample_multimodal_stream_window(
                dataset=dataset,
                sample=sample,
                media_field=data.get("mediaField"),
                stream_ids=stream_ids,
                start_time_ns=start_time_ns,
                end_time_ns=end_time_ns,
                max_messages_per_stream=fosm._normalize_max_messages_per_stream(
                    data.get("maxMessagesPerStream")
                ),
                source_kind=data.get("sourceKind"),
            )
        except fosm.MultimodalRouteError as error:
            _raise_http_error(error)
        except fosm.MultimodalDependencyError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error

        return JSONResponse(response)


class MultimodalBootstrapWindow(HTTPEndpoint):
    """Returns the small raw-message bundle used for first paint."""

    async def post(self, request):
        data = await _read_request_json(request)
        dataset, sample = _get_dataset_and_sample(request)

        try:
            response = fosm.read_sample_multimodal_bootstrap_window(
                dataset=dataset,
                sample=sample,
                media_field=data.get("mediaField"),
                anchor_time_ns=fosm._normalize_time_value(
                    data.get("anchorTimeNs"), "anchorTimeNs"
                ),
                render_stream_ids=fosm._normalize_stream_ids(
                    data.get("renderStreamIds"),
                    allow_none=True,
                    allow_empty=True,
                )
                or [],
                transform_stream_ids=fosm._normalize_stream_ids(
                    data.get("transformStreamIds"),
                    allow_none=True,
                    allow_empty=True,
                )
                or [],
                location_stream_ids=fosm._normalize_stream_ids(
                    data.get("locationStreamIds"),
                    allow_none=True,
                    allow_empty=True,
                )
                or [],
                transform_window_ns=(
                    fosm._normalize_time_value(
                        data.get("transformWindowNs"), "transformWindowNs"
                    )
                    if data.get("transformWindowNs") is not None
                    else None
                ),
                source_kind=data.get("sourceKind"),
            )
        except fosm.MultimodalRouteError as error:
            _raise_http_error(error)
        except fosm.MultimodalDependencyError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error

        return JSONResponse(response)


class MultimodalTimelineIndex(HTTPEndpoint):
    """Returns timestamp indexes for requested multimodal streams."""

    async def post(self, request):
        data = await _read_request_json(request)
        dataset, sample = _get_dataset_and_sample(request)
        stream_ids = fosm._normalize_stream_ids(
            data.get("streamIds"),
            allow_none=True,
            allow_empty=True,
        )

        try:
            response = await anyio.to_thread.run_sync(
                lambda: fosm.read_sample_multimodal_timeline_index(
                    dataset=dataset,
                    sample=sample,
                    media_field=data.get("mediaField"),
                    stream_ids=stream_ids,
                    timestamp_source=data.get("timestampSource"),
                    fallback=data.get("fallback"),
                    source_kind=data.get("sourceKind"),
                )
            )
        except fosm.MultimodalRouteError as error:
            _raise_http_error(error)
        except fosm.MultimodalDependencyError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error

        return JSONResponse(response)


MultimodalRoutes = [
    (
        "/dataset/{dataset_id}/sample/{sample_id}/multimodal/ingest",
        MultimodalIngest,
    ),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/multimodal/workspace",
        MultimodalWorkspace,
    ),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/multimodal/stream-window",
        MultimodalStreamWindow,
    ),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/multimodal/bootstrap-window",
        MultimodalBootstrapWindow,
    ),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/multimodal/timeline-index",
        MultimodalTimelineIndex,
    ),
]
