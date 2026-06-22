"""
Samples routes for field-projected and id-only paginated reads.

Two endpoints share one paginated pipeline builder (``get_view`` +
``get_samples_pipeline``), differing only in projection and windowing:

``POST /dataset/{id}/samples`` returns a per-id field slice + signed media urls,
projected from the requested ``fields`` (inclusion) or ``exclude`` (exclusion).

``POST /dataset/{id}/grid/samples`` returns an ordered window of ids only (final
``$project`` keeps just ``_id``), windowed by ``after``.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
from typing import Any, Dict, List, Optional

from bson import ObjectId
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

# identifiers the response always needs (media-type dispatch + signing + cache key)
_ALWAYS = ("_id", "filepath", "_media_type")

# max ids returned per spine fetch; larger views page by ``after``
SPINE_PAGE = 5000


def _projection(
    fields: Optional[List[str]], exclude: Optional[List[str]]
) -> Optional[Dict[str, Any]]:
    """A Mongo ``$project`` from the requested include/exclude field list."""
    if fields:
        project = {path: True for path in fields}
        for path in _ALWAYS:
            project[path] = True
        return {"$project": project}
    if exclude:
        # exclusion never drops the identifiers the response is built from
        return {
            "$project": {
                path: False for path in exclude if path not in _ALWAYS
            }
        }
    return None


def _sample_filter(
    filter_arg: Optional[Dict[str, Any]]
) -> Optional[SampleFilter]:
    """Build a ``SampleFilter`` (group slice) from the ``filter`` param."""
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


async def _resolve_dataset_name(dataset_id: str) -> Optional[str]:
    """Resolve a dataset id to its name, or ``None`` if it does not exist."""
    db = foo.get_async_db_conn()
    ds = await db["datasets"].find_one(
        {"_id": ObjectId(dataset_id)}, {"name": 1}
    )
    return ds["name"] if ds is not None else None


async def _build_item(
    view, doc, metadata_cache, url_cache, additional, skip_dimensions
):
    """Assemble one response item: signed urls + aspect ratio + the projected doc."""
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
        "fields": foj.stringify(doc),
    }

    # aspect ratio is omitted when dimensions are skipped (no placeholder)
    if not skip_dimensions:
        item["aspectRatio"] = metadata.get("aspect_ratio")

    return item


class Samples(HTTPEndpoint):
    """Field-projecting paginated samples reader."""

    @decorators.route
    async def post(self, request: Request, data: dict) -> JSONResponse:
        dataset_id = request.path_params["dataset_id"]
        dataset_name = await _resolve_dataset_name(dataset_id)
        if dataset_name is None:
            return JSONResponse(
                {"error": "dataset not found"}, status_code=404
            )

        ids = data.get("ids")
        after = data.get("after")
        count = int(data.get("count") or 0)
        sample_filter = _sample_filter(data.get("filter"))

        def _build():
            view = fosv.get_view(
                dataset_name,
                stages=data.get("view") or [],
                filters=data.get("filters"),
                pagination_data=False,
                sort_by=data.get("sortBy"),
                desc=bool(data.get("desc")),
                sample_filter=sample_filter,
                dynamic_group=data.get("dynamicGroup"),
            )
            if ids:
                view = view.select(ids)
            elif after is not None:
                view = view.skip(int(after))
            if count:
                view = view.limit(count)
            return view

        view = await run_sync_task(_build)
        pipeline = await get_samples_pipeline(view, sample_filter)

        projection = _projection(data.get("fields"), data.get("exclude"))
        if projection is not None:
            pipeline.append(projection)

        coll = foo.get_async_db_conn()[view._dataset._sample_collection_name]
        docs = await foo.aggregate(coll, pipeline, data.get("hint")).to_list(
            count or None
        )

        additional = fosm._get_additional_media_fields(view) if docs else None
        skip_dimensions = bool(data.get("skipMetadata"))
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

        return JSONResponse({"samples": samples})


class GridSamples(HTTPEndpoint):
    """Ordered id-only paginated reader."""

    @decorators.route
    async def post(self, request: Request, data: dict) -> JSONResponse:
        dataset_id = request.path_params["dataset_id"]
        dataset_name = await _resolve_dataset_name(dataset_id)
        if dataset_name is None:
            return JSONResponse(
                {"error": "dataset not found"}, status_code=404
            )

        after = int(data.get("after") or 0)
        sample_filter = _sample_filter(data.get("filter"))

        def _build():
            # pagination_data=False: only ids are needed, so skip the full field
            # projection that the final $project would strip back to _id anyway
            view = fosv.get_view(
                dataset_name,
                stages=data.get("view") or [],
                filters=data.get("filters"),
                pagination_data=False,
                sort_by=data.get("sortBy"),
                desc=bool(data.get("desc")),
                sample_filter=sample_filter,
            )
            return view.skip(after).limit(SPINE_PAGE + 1)

        view = await run_sync_task(_build)
        pipeline = await get_samples_pipeline(view, sample_filter)
        pipeline.append({"$project": {"_id": 1}})
        coll = foo.get_async_db_conn()[view._dataset._sample_collection_name]
        # the same index hint paginate_samples uses, so the $skip walks index entries
        # rather than scanning docs at deep offsets
        docs = await foo.aggregate(coll, pipeline, data.get("hint")).to_list(
            SPINE_PAGE + 1
        )

        more = len(docs) > SPINE_PAGE
        docs = docs[:SPINE_PAGE]
        spine = [{"id": str(d["_id"])} for d in docs]
        return JSONResponse(
            {"spine": spine, "next": after + SPINE_PAGE if more else None}
        )


SamplesRoutes = [
    ("/dataset/{dataset_id}/samples", Samples),
    ("/dataset/{dataset_id}/grid/samples", GridSamples),
]
