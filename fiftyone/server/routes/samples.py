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
import fiftyone.core.stages as fos
import fiftyone.core.view as fov
from fiftyone.core.utils import run_sync_task

from fiftyone.server import decorators
from fiftyone.server.filters import GroupElementFilter, SampleFilter
import fiftyone.server.metadata as fosm
from fiftyone.server.samples import get_samples_pipeline
from fiftyone.server.utils.json.encoder import JSONResponse
import fiftyone.server.view as fosv

# identifiers the response always needs (media-type dispatch + signing + cache key)
# plus `_group`/`_group_count`, which the GroupBy stage emits for grouped reads
_ALWAYS = ("_id", "filepath", "_media_type", "_group", "_group_count")

# max ids returned per spine fetch; larger views page by ``after``
SPINE_PAGE = 5000


def _projection(
    fields: Optional[List[str]],
    exclude: Optional[List[str]],
    extra: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    """A Mongo ``$project`` from the requested include/exclude field list.

    ``extra`` paths (e.g. ``metadata`` for aspect ratio) are always kept even
    when the client didn't request them.
    """
    if fields:
        project = {path: True for path in fields}
        for path in _ALWAYS:
            project[path] = True
        for path in extra or []:
            project[path] = True
        return {"$project": project}
    if exclude:
        # exclusion never drops the identifiers the response is built from
        keep = set(_ALWAYS) | set(extra or [])
        return {
            "$project": {path: False for path in exclude if path not in keep}
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
        ids = data.get("ids")
        after = data.get("after")
        count = int(data.get("count") or 0)
        sample_filter = _sample_filter(data.get("filter"))
        dynamic_group = data.get("dynamicGroup")

        def _build():
            dataset = foo.database.load_dataset(id=dataset_id)
            if not dataset:
                return JSONResponse(
                    {"error": "dataset not found"}, status_code=404
                )
            view = fosv.get_view(
                dataset,
                stages=data.get("view") or [],
                filters=data.get("filters"),
                pagination_data=False,
                sort_by=data.get("sortBy"),
                desc=bool(data.get("desc")),
                sample_filter=sample_filter,
                dynamic_group=dynamic_group,
            )
            if ids:
                # core's optimized select drops any GroupBy `$group` for an
                # index-eligible by-id `$match` and labels `_group` itself
                view = fov.make_optimized_select_view(view, ids)
            elif after is not None:
                view = view.skip(int(after))
            if count:
                view = view.limit(count)
            return view

        view = await run_sync_task(_build)
        pipeline = await get_samples_pipeline(view, sample_filter)

        skip_dimensions = bool(data.get("skipMetadata"))

        # keep `metadata` so the aspect ratio comes from stored dims, not a disk read
        extra = None if skip_dimensions else ["metadata"]
        projection = _projection(
            data.get("fields"), data.get("exclude"), extra
        )
        if projection is not None:
            pipeline.append(projection)

        coll = foo.get_async_db_conn()[view._dataset._sample_collection_name]
        docs = await foo.aggregate(coll, pipeline, data.get("hint")).to_list(
            count or None
        )

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

        return JSONResponse({"samples": samples})


class GridSamples(HTTPEndpoint):
    """Ordered id-only paginated reader."""

    @decorators.route
    async def post(self, request: Request, data: dict) -> JSONResponse:
        dataset_id = request.path_params["dataset_id"]

        after = int(data.get("after") or 0)
        sample_filter = _sample_filter(data.get("filter"))

        def _build():
            # pagination_data=False: only ids are needed; the final $project
            # strips back to _id anyway
            dataset = foo.database.load_dataset(id=dataset_id)
            if not dataset:
                return JSONResponse(
                    {"error": "dataset not found"}, status_code=404
                )
            view = fosv.get_view(
                dataset,
                stages=data.get("view") or [],
                filters=data.get("filters"),
                pagination_data=False,
                sort_by=data.get("sortBy"),
                desc=bool(data.get("desc")),
                sample_filter=sample_filter,
            )
            return view.skip(after).limit(SPINE_PAGE + 1)

        view = await run_sync_task(_build)
        # GroupBy emits `_group_count` only when asked; turn it on so the spine
        # carries each group's length to the imavid timeline
        for stage in getattr(view, "_stages", []):
            if isinstance(stage, fos.GroupBy):
                stage._include_count = True
        pipeline = await get_samples_pipeline(view, sample_filter)
        # keep `_group_count` alongside the id projection
        pipeline.append({"$project": {"_id": 1, "_group_count": 1}})
        coll = foo.get_async_db_conn()[view._dataset._sample_collection_name]
        # same index hint paginate_samples uses, so $skip walks index entries
        docs = await foo.aggregate(coll, pipeline, data.get("hint")).to_list(
            SPINE_PAGE + 1
        )

        more = len(docs) > SPINE_PAGE
        docs = docs[:SPINE_PAGE]
        spine = [
            {"id": str(d["_id"]), "groupCount": d["_group_count"]}
            if "_group_count" in d
            else {"id": str(d["_id"])}
            for d in docs
        ]
        return JSONResponse(
            {"spine": spine, "next": after + SPINE_PAGE if more else None}
        )


SamplesRoutes = [
    ("/dataset/{dataset_id}/samples", Samples),
    ("/dataset/{dataset_id}/grid/samples", GridSamples),
]
