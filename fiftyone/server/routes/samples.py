"""
FiftyOne Server samples route.

``POST /dataset/{id}/samples`` — reads a window of samples (``after``/``count``)
over a view, and resolves media urls. Serves the imavid frame stream, which
needs lean, relay-free reads of a dynamic group's ordered frames.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import logging
from typing import Any, Dict, Optional

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.json as foj
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
from fiftyone.core.utils import run_sync_task

from fiftyone.server import decorators
from fiftyone.server.filters import GroupElementFilter, SampleFilter
import fiftyone.server.metadata as fosm
from fiftyone.server.samples import get_samples_pipeline
from fiftyone.server.utils.json.encoder import JSONResponse
import fiftyone.server.view as fosv

logger = logging.getLogger(__name__)

# hard cap on one read; an omitted/oversized ``count`` must not pull the
# entire view into memory
MAX_SAMPLES_PAGE = 1000


def _sample_filter(
    filter_arg: Optional[Dict[str, Any]]
) -> Optional[SampleFilter]:
    """Build a ``SampleFilter`` (group slice) from the client ``filter`` param."""
    if not filter_arg:
        return None
    group = filter_arg.get("group")
    return SampleFilter(
        id=filter_arg.get("id"),
        group=(
            GroupElementFilter(
                id=group.get("id"),
                slice=group.get("slice"),
                slices=group.get("slices"),
            )
            if group
            else None
        ),
    )


def _load_dataset(dataset_id: str):
    """Load a dataset by id, or ``None`` if it does not exist."""
    try:
        return foo.database.load_dataset(id=dataset_id)
    except ValueError:
        # unknown dataset id raises rather than returning None
        return None


async def _build_item(
    view, doc, metadata_cache, url_cache, additional, skip_dimensions
):
    """Assemble one response item: media urls (+ aspect ratio) for the doc.

    ``fields`` is attached by the caller OFF the event loop — stringifying
    heavy label payloads here starves every concurrent request.
    """
    media_type = fom.get_media_type(doc["filepath"])
    metadata = await fosm.get_metadata(
        view,
        doc,
        media_type,
        metadata_cache,
        url_cache,
        additional_media_fields=additional,
        skip_dimensions=skip_dimensions,
    )

    item = {
        "id": str(doc["_id"]),
        "urls": metadata.get("urls"),
    }

    # only available when dimensions were read (skip_dimensions=False)
    if not skip_dimensions:
        item["aspectRatio"] = metadata.get("aspect_ratio")

    return item


class Samples(HTTPEndpoint):
    """Windowed samples reader."""

    @decorators.route
    async def post(self, request: Request, data: dict) -> JSONResponse:
        dataset_id = request.path_params["dataset_id"]
        try:
            after = data.get("after")
            after = int(after) if after is not None else None
            count = int(data.get("count") or 0)
        except (TypeError, ValueError):
            return JSONResponse(
                {"error": "'after' and 'count' must be integers"},
                status_code=400,
            )

        # bound every read; a window read must never stream the whole view
        count = min(count or MAX_SAMPLES_PAGE, MAX_SAMPLES_PAGE)

        sample_filter = _sample_filter(data.get("filter"))

        def _build():
            dataset = _load_dataset(dataset_id)
            if dataset is None:
                return None
            view = fosv.get_view(
                dataset,
                stages=data.get("view") or [],
                filters=data.get("filters"),
                pagination_data=False,
                sample_filter=sample_filter,
                dynamic_group=data.get("dynamicGroup"),
            )
            if after is not None:
                view = view.skip(after)
            return view.limit(count)

        view = await run_sync_task(_build)
        if view is None:
            return JSONResponse(
                {"error": "dataset not found"}, status_code=404
            )

        pipeline = await get_samples_pipeline(view, sample_filter)

        coll = foo.get_async_db_conn()[view._dataset._sample_collection_name]
        docs = await foo.aggregate(coll, pipeline).to_list(count)

        skip_dimensions = bool(data.get("skipMetadata"))
        additional = fosm._get_additional_media_fields(view) if docs else None
        metadata_cache: Dict[str, Any] = {}
        url_cache: Dict[str, str] = {}
        samples = await asyncio.gather(
            *[
                _build_item(
                    view,
                    doc,
                    metadata_cache,
                    url_cache,
                    additional,
                    skip_dimensions,
                )
                for doc in docs
            ]
        )

        # heavy label payloads: serialize OFF the event loop so concurrent
        # streaming reads never starve behind CPU-bound stringify
        def _attach_fields():
            for item, doc in zip(samples, docs):
                item["fields"] = foj.stringify(doc)

        await run_sync_task(_attach_fields)

        return JSONResponse({"samples": samples})


SamplesRoutes = [
    ("/dataset/{dataset_id}/samples", Samples),
]
