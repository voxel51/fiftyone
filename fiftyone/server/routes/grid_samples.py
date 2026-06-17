"""
Grid driver routes for the virtualized grid — two cheap, decoupled reads:

POST ``/dataset/{id}/grid/samples`` with:

* ``{spine: true, after?, sampleIds?}`` → ``(id, aspectRatio)`` for the view,
  sorted by ``_id``, NO media signing, NO labels — the id backbone for layout.
* ``{signUrls: [ids]}`` → ``[{id, url, mediaType}]`` — signed media URLs ONLY
  (filepath signing, NO sample doc / labels), so the app can paint the IMAGE for a
  window fast, decoupled from the heavy label read. Big batches are cheap here.

The heavy per-window read (full sample doc + overlays) goes through the normal
``paginateSamples`` GraphQL query, narrowed to the window ids — separate from this
route, so images render before overlays (progressive).

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from typing import Any, Dict, List, Optional

from bson import ObjectId
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.media as fom
import fiftyone.core.odm as foo
from fiftyone.server import decorators
from fiftyone.server.cache import get_cached_media_url
from fiftyone.server.metadata import resolve_media_alias_to_url
from fiftyone.server.utils.json.encoder import JSONResponse

logger = logging.getLogger(__name__)

# One spine fetch returns up to this many (id, aspectRatio) entries; the app pages
# the spine by ``after`` only when a view exceeds it, so layout is driven by a few
# cheap reads rather than one heavy read per screen.
SPINE_PAGE = 5000
# the spine never signs media — it only needs metadata to derive the aspect ratio.
_SPINE_PROJECTION = {"metadata": 1}
# a URL read only needs the filepath (to sign).
_URL_PROJECTION = {"filepath": 1}


def _aspect_ratio(md: Optional[Dict[str, Any]]) -> float:
    """Aspect ratio from stored metadata (no image fetch); 1.0 when unknown."""
    # ImageMetadata uses width/height; VideoMetadata uses frame_width/frame_height.
    md = md or {}
    width = md.get("width") or md.get("frame_width")
    height = md.get("height") or md.get("frame_height")
    return (width / height) if width and height else 1.0


async def _flat_spine(
    coll,
    ids: Optional[List[ObjectId]],
    after: int,
    limit: int,
) -> List[Dict[str, Any]]:
    """Ordered ``(id, aspectRatio)`` for the view — sorted by ``_id``, no signing."""
    if ids is not None:
        window = ids[after : after + limit + 1]
        docs = await coll.find(
            {"_id": {"$in": window}}, _SPINE_PROJECTION
        ).to_list(len(window))
        by_id = {d["_id"]: d for d in docs}
        docs = [by_id[i] for i in window if i in by_id]
    else:
        # NATURAL collection order (no sort) — matches `paginateSamples`, so the grid
        # keeps the dataset's natural sample order rather than re-sorting by `_id`.
        docs = await (
            coll.find({}, _SPINE_PROJECTION)
            .skip(after)
            .limit(limit + 1)
            .to_list(limit + 1)
        )
    return [
        {"id": str(d["_id"]), "aspectRatio": _aspect_ratio(d.get("metadata"))}
        for d in docs
    ]


class GridSamples(HTTPEndpoint):
    """The cheap ordered (id, aspectRatio) spine driver for the virtual grid."""

    @decorators.route
    async def post(self, request: Request, data: dict) -> JSONResponse:
        dataset_id = request.path_params["dataset_id"]
        db = foo.get_async_db_conn()
        ds = await db["datasets"].find_one(
            {"_id": ObjectId(dataset_id)},
            {"sample_collection_name": 1},
        )
        if ds is None:
            return JSONResponse(
                {"error": "dataset not found"}, status_code=404
            )
        sample_coll = db[ds["sample_collection_name"]]

        # signed media URLs ONLY (no labels) for a window of ids — the cheap read
        # that paints the image immediately, in id order.
        sign_ids = data.get("signUrls")
        if sign_ids is not None:
            oids = [ObjectId(i) for i in sign_ids]
            docs = await sample_coll.find(
                {"_id": {"$in": oids}}, _URL_PROJECTION
            ).to_list(len(oids))
            by_id = {d["_id"]: d for d in docs}
            urls = []
            for oid in oids:
                d = by_id.get(oid)
                if d is None:
                    continue
                fp = d["filepath"]
                urls.append(
                    {
                        "id": str(oid),
                        "url": resolve_media_alias_to_url(
                            get_cached_media_url(fp)
                        ),
                        "mediaType": fom.get_media_type(fp),
                    }
                )
            return JSONResponse({"urls": urls})

        after = int(data.get("after") or 0)
        supplied = data.get("sampleIds")
        ids: Optional[List[ObjectId]] = (
            [ObjectId(i) for i in supplied] if supplied is not None else None
        )

        spine = await _flat_spine(sample_coll, ids, after, SPINE_PAGE)
        more = len(spine) > SPINE_PAGE
        spine = spine[:SPINE_PAGE]
        logger.info(
            "[grid-spine] ds=%s after=%d -> %d (more=%s)",
            dataset_id,
            after,
            len(spine),
            more,
        )
        return JSONResponse(
            {"spine": spine, "next": after + SPINE_PAGE if more else None}
        )


GridSamplesRoutes = [
    ("/dataset/{dataset_id}/grid/samples", GridSamples),
]
