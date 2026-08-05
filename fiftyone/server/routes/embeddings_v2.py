"""
FiftyOne Server ``/embeddings/v2`` routes.

The v2 embeddings protocol is column-oriented: every per-point datum is a
column in a single canonical order (the "wire order" — the row order of the
brain run's points array), and a point's position in that order is its key.
Geometry ships once per run as binary Float32 columns; view and filter
changes ship compact bitmasks; per-point identity is resolved lazily (the
raw id column, or index lookups server-side). See ``/embeddings`` for the
legacy JSON protocol this replaces.

Binary responses share a 16-byte little-endian header::

    u32 magic "FOE1" | u16 version | u8 dtype | u8 width | u32 n | u32 flags

followed by ``width`` contiguous columns of ``n`` values each (bitmask
columns are ``ceil(n / 8)`` bytes, packed little bit-order). The color
response appends a UTF-8 JSON meta tail after its column — the header
determines where the column ends, so no delimiter is needed.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import logging
import struct
import threading
from collections import OrderedDict

from bson import ObjectId
import numpy as np
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import Response

import fiftyone.core.fields as fof
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
import fiftyone.core.stages as fos
import fiftyone.core.storage as fost
from fiftyone.core.utils import run_sync_task

from fiftyone.server.decorators import route
from fiftyone.server.query import _brain_run_error
import fiftyone.server.utils as fosu
import fiftyone.server.view as fosv
from fiftyone.server.filters import GroupElementFilter, SampleFilter

logger = logging.getLogger(__name__)

MAGIC = 0x464F4531  # "FOE1"
VERSION = 1

DTYPE_F32 = 1
DTYPE_U16 = 2
DTYPE_BITMASK = 3
DTYPE_BYTES12 = 4

# Header flags (masks responses)
FLAG_ALL_VISIBLE = 1
FLAG_ALL_MATCH = 2

MAX_CATEGORIES = 100
MISSING_CATEGORY = 0xFFFF

# Lasso selections at or below this size become explicit id stages
SELECT_STAGE_MAX = 10000

_HEADER_FORMAT = "<IHBBII"

_VISUALIZATION_CLS = "fiftyone.brain.visualization."


def get_sample_filter(slices):
    if slices:
        return SampleFilter(group=GroupElementFilter(id=None, slices=slices))


class EmbeddingsV2RunsStatus(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        """Check the status of a dataset's visualization runs."""
        return await run_sync_task(self._post_sync, data)

    def _post_sync(self, data):
        db = foo.get_db_conn()
        run_docs = db.runs.find(
            {"_dataset_id": ObjectId(data["datasetId"])},
            {"key": 1, "config": 1, "results": 1},
        )

        statuses = []
        for run_doc in run_docs:
            config = run_doc.get("config") or {}
            cls_path = config.get("cls")
            if not isinstance(cls_path, str) or not cls_path.startswith(
                _VISUALIZATION_CLS
            ):
                continue

            statuses.append(
                {
                    "brainKey": run_doc.get("key"),
                    "ready": run_doc.get("results") is not None,
                    "error": _brain_run_error({"config": config}),
                }
            )

        return {"runs": statuses}


class EmbeddingsV2RunInfo(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        """Loads a run's results and reports its column metadata.

        The returned ``timestamp`` is the cache key for all column payloads
        of this run.
        """
        return await run_sync_task(self._post_sync, data)

    def _post_sync(self, data):
        dataset, results = _load_results(data)
        info = dataset.get_brain_info(data["brainKey"])
        config = results.config

        return {
            "brainKey": data["brainKey"],
            "n": len(results.points),
            "dims": int(results.points.shape[1]),
            "patchesField": config.patches_field,
            "pointsField": config.points_field,
            "method": getattr(config, "method", None),
            "model": getattr(config, "model", None),
            "timestamp": _timestamp(info),
        }


class EmbeddingsV2Geometry(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> Response:
        """The run's coordinates as planar Float32 columns, wire order.

        Optional ``offset``/``limit`` select a wire-order slice for
        progressive loading; the header's ``n`` is the slice length.
        """
        return await run_sync_task(self._post_sync, data)

    def _post_sync(self, data):
        _, results = _load_results(data)
        points = _slice(results.points, data)
        n, width = points.shape

        columns = [
            np.ascontiguousarray(points[:, i], dtype="<f4").tobytes()
            for i in range(width)
        ]
        return _column_response(DTYPE_F32, width, n, b"".join(columns))


class EmbeddingsV2Ids(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> Response:
        """The run's ids as raw 12-byte ObjectIds, wire order.

        ``kind="points"`` (default) returns each point's identity: label ids
        for patches runs, sample ids otherwise. ``kind="samples"`` returns
        the owning sample ids (only distinct from ``"points"`` for patches
        runs).
        """
        return await run_sync_task(self._post_sync, data)

    def _post_sync(self, data):
        _, results = _load_results(data)
        kind = data.get("kind", "points")

        is_patches = results.config.patches_field is not None
        if kind == "points" and is_patches:
            ids = results.label_ids
        else:
            ids = results.sample_ids

        ids = _slice(ids, data)
        payload = bytes.fromhex("".join(_as_list(ids)))
        return _column_response(DTYPE_BYTES12, 1, len(ids), payload)


class EmbeddingsV2Color(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> Response:
        """Everything color-by in one response: the per-point value column
        (wire order) followed by a UTF-8 JSON meta tail.

        The 16-byte header fully determines the column's extent (``n``
        values of the dtype's width); every remaining body byte is the
        meta tail. Categorical fields encode as u16 class indices into the
        tail's ``classes`` list (``0xFFFF`` = missing) with a ``truncated``
        flag; continuous fields encode as Float32 (``NaN`` = missing) with
        ``min``/``max`` in the tail.

        One response means the values aggregation — the expensive step —
        runs once per (run, field). Bodies are cached in a small LRU
        keyed by the run's identity (dataset, brain key, run timestamp,
        field), so re-selecting a recent field skips the aggregation
        entirely.
        """
        return await run_sync_task(self._post_sync, data)

    def _post_sync(self, data):
        dataset, results = _load_results(data)
        field_path = data["field"]

        info = dataset.get_brain_info(data["brainKey"])
        key = (
            data["datasetName"],
            data["brainKey"],
            _timestamp(info),
            field_path,
        )
        body = _color_cache_get(key)
        if body is None:
            body = _build_color_body(dataset, results, field_path)
            _color_cache_put(key, body)

        return Response(content=body, media_type="application/octet-stream")


class EmbeddingsV2Masks(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> Response:
        """Two bitmasks over the run, wire order.

        ``visible``: the point's sample/patch is in the current view (view
        stages) — drives rendering visibility. ``match``: the point survives
        the sidebar filters / extended stages / extended selection — drives
        dimming. Header flags: bit 0 = all visible, bit 1 = all match (the
        corresponding column is all ones and may be skipped client-side).
        """
        return await run_sync_task(self._post_sync, data)

    def _post_sync(self, data):
        dataset, results = _load_results(data)
        dataset_name = data["datasetName"]
        stages = data.get("view", None)
        filters = data.get("filters", None)
        slices = data.get("slices", None)
        extended_stages = data.get("extended", None)
        extended_selection = data.get("extendedSelection", None)

        n = len(results.points)
        flags = 0

        # Visible: membership in the view (stages only, no filters).
        # Group slices scope visibility too, even with no view stages
        if stages or slices:
            view = fosv.get_view(
                dataset,
                stages=stages,
                sample_filter=get_sample_filter(slices),
            )
            if view.view() != results.view.view():
                results.use_view(view, allow_missing=True)

            keep_inds = results._curr_keep_inds
            if keep_inds is None:
                visible = np.ones(n, dtype=bool)
                flags |= FLAG_ALL_VISIBLE
            else:
                visible = np.zeros(n, dtype=bool)
                visible[keep_inds] = True
        else:
            visible = np.ones(n, dtype=bool)
            flags |= FLAG_ALL_VISIBLE

        # Match: membership in the filtered/extended view
        if filters or extended_stages or extended_selection:
            match = _match_mask(
                dataset_name,
                results,
                stages,
                filters,
                slices,
                extended_stages,
                extended_selection,
            )
        else:
            match = np.ones(n, dtype=bool)
            flags |= FLAG_ALL_MATCH

        payload = np.packbits(visible, bitorder="little").tobytes()
        payload += np.packbits(match, bitorder="little").tobytes()
        return _column_response(DTYPE_BITMASK, 2, n, payload, flags=flags)


class EmbeddingsV2LassoStage(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        """Resolves a lasso selection into a serialized view stage.

        The selection arrives as either ``polygon`` (data-space vertices,
        resolved against the run's points server-side) or ``indices``
        (wire-order point indices). When a spatial index exists and the
        view/plot sources match, polygon selections compile to a constant
        size ``$geoWithin`` stage; otherwise an id-based stage is returned.
        """
        return await run_sync_task(self._post_sync, data)

    def _post_sync(self, data):
        dataset, results = _load_results(data)
        dataset_name = data["datasetName"]
        stages = data.get("view", None)
        slices = data.get("slices", None)
        polygon = data.get("polygon", None)

        patches_field = results.config.patches_field
        points_field = results.config.points_field

        view = fosv.get_view(
            dataset_name,
            stages=stages,
            sample_filter=get_sample_filter(slices),
        )

        is_patches_view = view._is_patches
        is_patches_plot = patches_field is not None
        sources_equal = is_patches_view == is_patches_plot

        if polygon is not None and points_field is not None and sources_equal:
            # Constant-size spatial stage; no ids on the wire.
            # $geoWithin can't filter nested arrays, so patches plots
            # require a patches view here (sources_equal guarantees it)
            if patches_field is not None:
                _, points_field = view._get_label_field_path(
                    patches_field, points_field
                )

            stage = fos.Mongo(
                [
                    {
                        "$match": {
                            points_field: {
                                "$geoWithin": {"$polygon": list(polygon)}
                            }
                        }
                    }
                ]
            )
            d = stage._serialize(include_uuid=False)
            return {
                "_cls": d["_cls"],
                "kwargs": dict(d["kwargs"]),
                "count": None,
            }

        matched = _resolve_selection(data, results)

        if is_patches_plot:
            selected_ids = _as_list(results.label_ids[matched])
        else:
            selected_ids = _as_list(results.sample_ids[matched])

        count = len(selected_ids)
        if count > SELECT_STAGE_MAX:
            logger.warning(
                "Lasso selection of %d ids exceeds SELECT_STAGE_MAX (%d); "
                "returning an id stage anyway",
                count,
                SELECT_STAGE_MAX,
            )

        if is_patches_view == is_patches_plot:
            # Patch ids equal sample ids in a matching patches view
            stage = fos.Select(selected_ids)
        elif is_patches_plot:
            stage = fos.MatchLabels(fields=[patches_field], ids=selected_ids)
        else:
            stage = fos.SelectBy("sample_id", selected_ids)

        d = stage._serialize(include_uuid=False)
        return {"_cls": d["_cls"], "kwargs": dict(d["kwargs"]), "count": count}


class EmbeddingsV2SampleInfo(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        """Resolves a wire-order index to its sample's hover-card data.

        ``media`` is a filepath for the client to resolve through the
        App's ``getSampleSrc()`` (which owns proxy/prefix handling), or
        null when hover media is unavailable for the sample's media type
        (anything but images). Samples deleted since the run was computed
        resolve to null fields rather than an error.
        """
        return await run_sync_task(self._post_sync, data)

    def _post_sync(self, data):
        dataset, results = _load_results(data)
        index = data["index"]
        color_field = data.get("field", None)

        n = len(results.points)
        if not 0 <= index < n:
            raise ValueError(f"Index {index} out of range [0, {n})")

        sample_id = str(results.sample_ids[index])
        point_id = sample_id
        if results.config.patches_field is not None:
            point_id = str(results.label_ids[index])

        try:
            sample = dataset[sample_id]
        except KeyError:
            # Deleted since the brain run was computed
            return {
                "id": point_id,
                "sampleId": sample_id,
                "filepath": None,
                "media": None,
                "value": None,
            }

        value = None
        if color_field is not None:
            try:
                value = sample.get_field(color_field)
            except (AttributeError, KeyError, ValueError):
                value = None

        return {
            "id": point_id,
            "sampleId": sample_id,
            "filepath": sample.filepath,
            "media": _hover_media(sample),
            "value": value,
        }


EmbeddingsV2Routes = [
    ("/embeddings/v2/runs-status", EmbeddingsV2RunsStatus),
    ("/embeddings/v2/run-info", EmbeddingsV2RunInfo),
    ("/embeddings/v2/geometry", EmbeddingsV2Geometry),
    ("/embeddings/v2/ids", EmbeddingsV2Ids),
    ("/embeddings/v2/color", EmbeddingsV2Color),
    ("/embeddings/v2/masks", EmbeddingsV2Masks),
    ("/embeddings/v2/lasso-stage", EmbeddingsV2LassoStage),
    ("/embeddings/v2/sample-info", EmbeddingsV2SampleInfo),
]

# Color bodies are ~1-2 MB at 500K points and a session of color-by
# switching revisits few fields, so a small cap covers it
_COLOR_CACHE_MAX = 8
_color_cache = OrderedDict()
# Route handlers run on a thread pool; unsynchronized get/move_to_end
# can race an eviction into a KeyError
_color_cache_lock = threading.Lock()


def _color_cache_get(key) -> bytes | None:
    with _color_cache_lock:
        body = _color_cache.get(key)
        if body is not None:
            _color_cache.move_to_end(key)

        return body


def _color_cache_put(key, body) -> None:
    with _color_cache_lock:
        _color_cache[key] = body
        while len(_color_cache) > _COLOR_CACHE_MAX:
            _color_cache.popitem(last=False)


def _build_color_body(dataset, results, field_path):
    """Builds a complete ``/v2/color`` response body: header, value
    column, JSON meta tail. Immutable bytes, safe to cache and share.
    """
    style, values, classes, truncated, exact = _color_data(
        dataset, results, field_path
    )
    n = len(values)

    if style == "categorical":
        index_by_label = {c["label"]: i for i, c in enumerate(classes)}
        column = np.full(n, MISSING_CATEGORY, dtype="<u2")
        for i, value in enumerate(values):
            # Values beyond the class-list cap encode as missing
            index = index_by_label.get(value)
            if index is not None:
                column[i] = index

        dtype = DTYPE_U16
        meta = {
            "style": style,
            "classes": classes,
            "truncated": truncated,
            "exact": exact,
        }
    else:
        column = np.array(
            [float(v) if v is not None else np.nan for v in values],
            dtype="<f4",
        )
        present = [float(v) for v in values if v is not None]
        dtype = DTYPE_F32
        meta = {
            "style": style,
            "min": min(present) if present else None,
            "max": max(present) if present else None,
        }

    header = struct.pack(_HEADER_FORMAT, MAGIC, VERSION, dtype, 1, n, 0)
    return header + column.tobytes() + json.dumps(meta).encode("utf-8")


def _load_results(data):
    """Loads (dataset, results) for a request, with legacy-equivalent
    caching (dataset TTL cache + per-dataset brain results cache).
    """
    dataset_name = data["datasetName"]
    brain_key = data["brainKey"]

    dataset = fosu.load_and_cache_dataset(dataset_name)
    results = dataset.load_brain_results(brain_key)
    if results is None:
        raise ValueError(
            f"Results for brain run with key '{brain_key}' are not yet "
            "available"
        )

    return dataset, results


def _slice(array, data):
    """Applies a request's optional wire-order ``offset``/``limit``."""
    offset = data.get("offset", None)
    limit = data.get("limit", None)
    if offset is None and limit is None:
        return array

    for name, value in (("offset", offset), ("limit", limit)):
        # Validate BEFORE coercion: int() would truncate fractions into
        # a silently different slice
        if value is not None and (
            not isinstance(value, (int, float)) or value != int(value)
        ):
            raise ValueError(f"{name} must be an integer")

    start = int(offset or 0)
    length = int(limit) if limit is not None else None
    # Negative values would silently slice from the wrong end
    if start < 0 or (length is not None and length < 0):
        raise ValueError("offset and limit must be non-negative")

    stop = start + length if length is not None else None
    return array[start:stop]


def _column_response(dtype, width, n, payload, flags=0):
    header = struct.pack(
        _HEADER_FORMAT, MAGIC, VERSION, dtype, width, n, flags
    )
    return Response(
        content=header + payload, media_type="application/octet-stream"
    )


def _timestamp(info):
    timestamp = getattr(info, "timestamp", None)
    return timestamp.isoformat() if timestamp is not None else None


def _as_list(ids):
    return ids.tolist() if isinstance(ids, np.ndarray) else list(ids)


def _first_value(value):
    if isinstance(value, (list, tuple)):
        return value[0] if value else None

    return value


def _color_data(dataset, results, field_path):
    """Resolves per-point color-by values (wire order) and the style
    decision.

    Rules follow the legacy endpoint with one correction: only numeric
    fields can be continuous. High-cardinality non-numeric fields stay
    categorical with the class list capped to the ``MAX_CATEGORIES``
    most frequent values (the remainder encode as missing), reported via
    the ``truncated`` flag. (Legacy marked those "continuous", which is
    meaningless for strings.)

    Returns:
        a ``(style, values, classes, truncated, exact)`` tuple, where
        ``exact`` says each point's column value IS the point's full
        field value (list fields keep only their first element, so a
        filter evaluated against the column could disagree with the
        same filter evaluated against the field — clients must not
        compute filter masks locally unless ``exact`` is true)
    """
    patches_field = results.config.patches_field
    is_patches = patches_field is not None

    ids = results.label_ids if is_patches else results.sample_ids
    values = dataset._get_values_by_id(
        field_path, _as_list(ids), link_field=patches_field
    )

    exact = True
    field = dataset.get_field(field_path)
    if isinstance(field, fof.ListField):
        field = field.field

    # Paths through label lists (e.g. ``detections.label``) yield a
    # LIST per point even though the leaf field is scalar, so listiness
    # must be detected in the values, not the schema. Collapse to the
    # first element; the column is then lossy (see ``exact`` above)
    if any(isinstance(v, (list, tuple)) for v in values):
        values = [_first_value(v) for v in values]
        exact = False

    if isinstance(field, fof.FloatField):
        return "continuous", values, None, False, exact

    distinct = {}
    for value in values:
        if value is not None:
            distinct[value] = distinct.get(value, 0) + 1

    if len(distinct) > MAX_CATEGORIES and isinstance(field, fof.IntField):
        return "continuous", values, None, False, exact

    ranked = sorted(
        distinct.items(), key=lambda item: (-item[1], str(item[0]))
    )
    truncated = len(ranked) > MAX_CATEGORIES
    classes = [
        {"label": label, "count": count}
        for label, count in ranked[:MAX_CATEGORIES]
    ]
    return "categorical", values, classes, truncated, exact


def _match_mask(
    dataset_name,
    results,
    stages,
    filters,
    slices,
    extended_stages,
    extended_selection,
):
    """Membership of each run point in the filtered/extended view."""
    patches_field = results.config.patches_field
    is_patches_plot = patches_field is not None
    ids = results.label_ids if is_patches_plot else results.sample_ids

    matched_ids = None
    if filters or extended_stages:
        extended_view = fosv.get_view(
            dataset_name,
            stages=stages,
            filters=filters,
            extended_stages=extended_stages,
            sample_filter=get_sample_filter(slices),
        )
        is_patches_view = extended_view._is_patches

        if is_patches_plot and not is_patches_view:
            _, id_path = extended_view._get_label_field_path(
                patches_field, "id"
            )
            extended_ids = extended_view.values(id_path, unwind=True)
        elif is_patches_view and not is_patches_plot:
            extended_ids = extended_view.values("sample_id")
        else:
            extended_ids = extended_view.values("id")

        matched_ids = set(extended_ids)

    if extended_selection is not None:
        selection = set(extended_selection)
        matched_ids = (
            matched_ids & selection if matched_ids is not None else selection
        )

    n = len(ids)
    if matched_ids is None:
        return np.ones(n, dtype=bool)

    return np.fromiter(
        (str(_id) in matched_ids for _id in _as_list(ids)), bool, count=n
    )


def _hover_media(sample):
    """Resolves what the hover card should load for a sample: a filepath
    the client passes through the App's ``getSampleSrc()``, or None when
    hover media is unavailable for the sample's media type.

    When the installed storage layer can mint URLs for the path (e.g.
    pre-signed object-store URLs), the browser fetches the media
    directly; ``getSampleSrc()`` passes fully qualified URLs through
    untouched. Local paths — and installs whose storage layer has no
    URL support — fall through to the raw filepath, which the App
    serves via its ``/media`` endpoint.
    """
    if sample.media_type != fom.IMAGE:
        return None

    filepath = sample.filepath
    get_url = getattr(fost, "get_url", None)
    if get_url is not None:
        try:
            return get_url(filepath)
        except Exception:
            pass

    return filepath


def _resolve_selection(data, results):
    """Resolves a selection request to matched wire-order indices.

    Deliberately a single extension point: alternative selection encodings
    add branches here without touching the stage-building logic.
    """
    polygon = data.get("polygon", None)
    if polygon is not None:
        points = results.points
        inside = _points_in_polygon(
            points[:, 0], points[:, 1], np.asarray(polygon, dtype=float)
        )
        (matched,) = np.nonzero(inside)
        return matched

    indices = data.get("indices", None)
    if indices is not None:
        raw = np.asarray(indices)
        # Validate BEFORE the int cast: it would truncate fractions to
        # neighboring, unintended points
        if raw.dtype.kind not in "iu" and not (
            raw.dtype.kind == "f" and (raw == np.floor(raw)).all()
        ):
            raise ValueError("indices must be integers")

        matched = raw.astype(int)
        n = len(results.points)
        # Negative values silently select from the end; >= n raises an
        # opaque IndexError downstream — reject both here
        if matched.ndim != 1 or (
            matched.size and ((matched < 0) | (matched >= n)).any()
        ):
            raise ValueError(
                f"indices must be a flat list of ints in [0, {n})"
            )

        return matched

    raise ValueError("Either 'polygon' or 'indices' is required")


def _points_in_polygon(xs, ys, polygon):
    """Vectorized ray-casting point-in-polygon test.

    A horizontal ray from each point crosses polygon edges; an odd crossing
    count means inside. Handles concave polygons.
    """
    inside = np.zeros(len(xs), dtype=bool)
    px = polygon[:, 0]
    py = polygon[:, 1]
    j = len(polygon) - 1
    # Horizontal edges (yi == yj) can't satisfy the crossing condition,
    # but the division still evaluates — suppress the harmless warnings
    with np.errstate(divide="ignore", invalid="ignore"):
        for i in range(len(polygon)):
            xi, yi = px[i], py[i]
            xj, yj = px[j], py[j]
            crosses = ((yi > ys) != (yj > ys)) & (
                xs < (xj - xi) * (ys - yi) / (yj - yi) + xi
            )
            inside ^= crosses
            j = i

    return inside
