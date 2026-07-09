"""
FiftyOne Server samples route.

``POST /dataset/{id}/samples`` — reads a window of samples (``after``/``count``)
over a view, projects the client's ``fields`` (or ``exclude``), and resolves
media urls. Serves the imavid frame stream, which renders only media and
overlays while playing — so unlike ``paginate_samples``, a windowed read never
pulls fields the stream won't draw.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from typing import Any, Dict, List, Optional

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.json as foj
from fiftyone.core.utils import run_sync_task

from fiftyone.server import decorators
from fiftyone.server.filters import GroupElementFilter, SampleFilter
import fiftyone.server.metadata as fosm
from fiftyone.server.samples import (
    aggregate_sample_docs,
    resolve_samples_metadata,
)
from fiftyone.server.utils.datasets import get_dataset
from fiftyone.server.utils.json.encoder import JSONResponse
import fiftyone.server.view as fosv

logger = logging.getLogger(__name__)

# always projected: needed for media-type dispatch, url resolution, and the id
# key, plus `_group`/`_group_count`, which the GroupBy stage emits for grouped
# reads
_ALWAYS = ("_id", "filepath", "_media_type", "_group", "_group_count")


def _ancestors(path: str) -> List[str]:
    parts = path.split(".")
    return [".".join(parts[:i]) for i in range(1, len(parts))]


def _projection(
    fields: Optional[List[str]],
    exclude: Optional[List[str]],
    extra: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    """A Mongo ``$project`` from the requested include/exclude field list.

    ``extra`` paths (e.g. ``metadata`` for aspect ratio, configured media
    fields for URL resolution) are always kept even when the client didn't
    request them.
    """
    if fields:
        paths = set(fields) | set(_ALWAYS) | set(extra or [])
        # Mongo rejects ancestor/descendant path collisions; the ancestor wins
        project = {
            path: True
            for path in paths
            if not any(parent in paths for parent in _ancestors(path))
        }
        return {"$project": project}
    if exclude:
        # exclusion never drops the identifiers the response is built from
        keep = set(_ALWAYS) | set(extra or [])
        project = {path: False for path in exclude if path not in keep}
        # an empty $project is a Mongo error, not a no-op
        if not project:
            return None
        return {"$project": project}
    return None


def _parse_group_slice_filter(
    filter_arg: Optional[Dict[str, Any]]
) -> Optional[SampleFilter]:
    """Build the group-slice scoping (``SampleFilter``) from the client
    ``filter`` param."""
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


class Samples(HTTPEndpoint):
    """Field-projecting windowed samples reader."""

    @decorators.route
    async def post(self, request: Request, data: dict) -> JSONResponse:
        dataset_id = request.path_params["dataset_id"]
        # a windowed read must state its size; the server never invents,
        # defaults, or unbounds a page
        if data.get("count") is None:
            return JSONResponse(
                {"error": "'count' is required"}, status_code=400
            )
        try:
            after = data.get("after")
            after = int(after) if after is not None else None
            count = int(data["count"])
        except (TypeError, ValueError):
            return JSONResponse(
                {"error": "'after' and 'count' must be integers"},
                status_code=400,
            )

        dataset = await run_sync_task(get_dataset, dataset_id)
        sample_filter = _parse_group_slice_filter(data.get("filter"))

        def _build():
            # pagination_data=False: the projection below is the only field
            # selection
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
            # honored verbatim: exactly ``count``, 0 reads nothing
            return view.limit(count)

        view = await run_sync_task(_build)

        skip_metadata = bool(data.get("skipMetadata"))
        # keep `metadata` so the aspect ratio comes from stored dims, not a
        # disk read, plus every configured media field so url resolution still
        # sees them through an include-mode projection
        extra = [] if skip_metadata else ["metadata"]
        extra.extend(view._dataset.app_config.media_fields or [])
        opm_field, _, additional_media = fosm._get_additional_media_fields(
            view
        )
        if opm_field:
            extra.append(opm_field)
        extra.extend(additional_media)
        projection = _projection(
            data.get("fields"), data.get("exclude"), extra
        )

        docs = await aggregate_sample_docs(
            view, sample_filter, count, projection=projection
        )

        metadatas = await resolve_samples_metadata(
            view, docs, skip_dimensions=skip_metadata
        )

        samples = []
        for doc, metadata in zip(docs, metadatas):
            item = {
                "id": str(doc["_id"]),
                "urls": metadata.get("urls"),
            }
            # a skipped read yields a placeholder ratio; omit it instead
            if not skip_metadata:
                item["aspectRatio"] = metadata.get("aspect_ratio")
            samples.append(item)

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
