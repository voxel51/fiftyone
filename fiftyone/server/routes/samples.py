"""
REST samples routes.

``POST /dataset/{id}/samples`` — reads matched/paginated samples (by ``ids`` or
``after``/``count``), projects the client's ``fields`` (or ``exclude``), and signs
media urls.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

import aiohttp
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.json as foj
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
import fiftyone.core.view as fov
from fiftyone.core.utils import run_sync_task

from fiftyone.server import decorators
from fiftyone.server.filters import GroupElementFilter, SampleFilter
import fiftyone.server.metadata as fosm
from fiftyone.server.samples import get_samples_pipeline
from fiftyone.server.utils import convert_frames_overlay_paths_to_cloud_urls
from fiftyone.server.utils.json.encoder import JSONResponse
import fiftyone.server.view as fosv

logger = logging.getLogger(__name__)

# always projected: needed for media-type dispatch, signing, and the id key,
# plus `_group`/`_group_count`, which the GroupBy stage emits for grouped reads
_ALWAYS = ("_id", "filepath", "_media_type", "_group", "_group_count")

# hard cap on one hydration read; an omitted/oversized ``count`` must not pull
# the entire view into memory
MAX_SAMPLES_PAGE = 1000


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
    fields for URL signing) are always kept even when the client didn't
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


def _resolve_filters(dataset, filters):
    """Split multimodal (parquet-side) filters the way ``paginate_samples``
    does — they cannot become Mongo stages, so they resolve to an episode-id
    set up front.

    Returns ``(mongo_filters, resolve)`` where ``resolve`` is ``None`` for
    non-multimodal datasets/empty filters.
    """
    if not filters:
        return filters, None

    from fiftyone.multimodal.server import grid as multimodal_grid

    if not multimodal_grid.multimodal_enabled_for(dataset):
        return filters, None

    resolved = multimodal_grid.resolve_multimodal_filters(
        dataset, filters, where="samples_routes"
    )
    if resolved is None:
        return filters, None

    return resolved.mongo_filters, resolved


def _match_candidates(view, resolved):
    """Restricts the Mongo view to the episode set the parquet filters chose."""
    if resolved is None or resolved.candidate_ids is None:
        return view

    from fiftyone.core.expressions import ViewField as F

    return view.match(
        F(resolved.ctx.episode_id_column).is_in(list(resolved.candidate_ids))
    )


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


# NO dataset memo: the server is STATELESS by contract (FIFTYONE_SINGLETON_CACHE
# is false on deployments too). Every request that needs the Dataset object pays
# the load
def _load_dataset(dataset_id: str):
    """Load a dataset by id, or ``None`` if it does not exist."""
    try:
        return foo.database.load_dataset(id=dataset_id)
    except ValueError:
        # unknown dataset id raises rather than returning None
        return None


async def _build_item(
    view, doc, metadata_cache, url_cache, session, additional, skip_dimensions
):
    """Assemble one response item: signed urls + aspect ratio + the projected doc."""
    media_type = fom.get_media_type(doc["filepath"])
    metadata = await fosm.get_metadata(
        view,
        doc,
        media_type,
        metadata_cache,
        url_cache,
        session,
        additional_media_fields=additional,
        skip_dimensions=skip_dimensions,
    )

    if media_type == fom.VIDEO and "frames" in doc:
        # frame overlays may carry cloud paths that must be signed
        convert_frames_overlay_paths_to_cloud_urls(doc["frames"])

    # `fields` is attached by the caller OFF the event loop — stringifying
    # heavy label payloads here starves every concurrent request
    item = {
        "id": str(doc["_id"]),
        "urls": metadata.get("urls"),
    }

    # only available when dimensions were read (skip_dimensions=False)
    if not skip_dimensions:
        item["aspectRatio"] = metadata.get("aspect_ratio")

    return item


class Samples(HTTPEndpoint):
    """Field-projecting samples reader."""

    @decorators.route
    async def post(self, request: Request, data: dict) -> JSONResponse:
        t0 = time.perf_counter()
        dataset_id = request.path_params["dataset_id"]
        ids = data.get("ids")
        try:
            after = data.get("after")
            after = int(after) if after is not None else None
            count = int(data.get("count") or 0)
        except (TypeError, ValueError):
            return JSONResponse(
                {"error": "'after' and 'count' must be integers"},
                status_code=400,
            )

        if ids and len(ids) > MAX_SAMPLES_PAGE:
            return JSONResponse(
                {"error": f"at most {MAX_SAMPLES_PAGE} ids per request"},
                status_code=400,
            )
        # bound every read; a window read must never stream the whole view
        count = min(count or MAX_SAMPLES_PAGE, MAX_SAMPLES_PAGE)
        if ids:
            count = min(count, len(ids))

        sample_filter = _sample_filter(data.get("filter"))

        def _build():
            t_b0 = time.perf_counter()
            dataset = _load_dataset(dataset_id)
            if dataset is None:
                return None
            t_b1 = time.perf_counter()
            mongo_filters, resolved = _resolve_filters(
                dataset, data.get("filters")
            )
            # pagination_data=False: the projection below is the only field selection
            view = fosv.get_view(
                dataset,
                stages=data.get("view") or [],
                filters=mongo_filters,
                pagination_data=False,
                extended_stages=data.get("extendedStages"),
                sort_by=data.get("sortBy"),
                desc=bool(data.get("desc")),
                sample_filter=sample_filter,
                dynamic_group=data.get("dynamicGroup"),
            )
            view = _match_candidates(view, resolved)
            t_b2 = time.perf_counter()
            if ids:
                # optimized select drops any GroupBy `$group` for an
                # index-eligible by-id `$match` and labels `_group` itself
                view = fov.make_optimized_select_view(view, ids)
            elif after is not None:
                view = view.skip(after)
            if count:
                view = view.limit(count)
            logger.info(
                "[fetch] samples build: load=%.0fms getview=%.0fms "
                "select=%.0fms",
                (t_b1 - t_b0) * 1000,
                (t_b2 - t_b1) * 1000,
                (time.perf_counter() - t_b2) * 1000,
            )
            return view

        view = await run_sync_task(_build)
        if view is None:
            return JSONResponse(
                {"error": "dataset not found"}, status_code=404
            )
        t_view = time.perf_counter()
        pipeline = await get_samples_pipeline(view, sample_filter)

        skip_dimensions = bool(data.get("skipMetadata"))
        # keep `metadata` so the aspect ratio comes from stored dims, not a disk
        # read, plus every configured media/projection field so URL signing still
        # sees them through an include-mode projection
        extra = [] if skip_dimensions else ["metadata"]
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
        if projection is not None:
            pipeline.append(projection)

        max_query_time = data.get("maxQueryTime")
        coll = foo.get_async_db_conn()[view._dataset._sample_collection_name]
        docs = await foo.aggregate(
            coll,
            pipeline,
            data.get("hint"),
            maxTimeMS=int(max_query_time) * 1000 if max_query_time else None,
        ).to_list(count or None)
        t_agg = time.perf_counter()

        additional = fosm._get_additional_media_fields(view) if docs else None
        metadata_cache: Dict[str, Any] = {}
        url_cache: Dict[str, str] = {}
        async with aiohttp.ClientSession(trust_env=True) as session:
            samples = await asyncio.gather(
                *[
                    _build_item(
                        view,
                        doc,
                        metadata_cache,
                        url_cache,
                        session,
                        additional,
                        skip_dimensions,
                    )
                    for doc in docs
                ]
            )
        t_urls = time.perf_counter()

        # heavy label payloads: serialize OFF the event loop so concurrent
        # spine/hydration requests never starve behind CPU-bound stringify
        def _attach_fields():
            for item, doc in zip(samples, docs):
                item["fields"] = foj.stringify(doc)

        await run_sync_task(_attach_fields)

        logger.info(
            "[fetch] samples n=%d view=%.0fms agg=%.0fms urls=%.0fms "
            "stringify=%.0fms total=%.0fms",
            len(samples),
            (t_view - t0) * 1000,
            (t_agg - t_view) * 1000,
            (t_urls - t_agg) * 1000,
            (time.perf_counter() - t_urls) * 1000,
            (time.perf_counter() - t0) * 1000,
        )
        return JSONResponse({"samples": samples})


SamplesRoutes = [
    ("/dataset/{dataset_id}/samples", Samples),
]
