"""
FiftyOne Server /video-labels routes

Scalable label loading for the video annotation surface. Two endpoints,
two responsibilities:

- ``/video-labels/index`` returns the per-instance presence distribution
  across the whole clip as run-length-encoded frame segments (plus keyframe
  frames). It drives the timeline tracks without loading any label payloads,
  so the surface no longer fetches every frame on mount.
- ``/video-labels/window`` returns full, field-projected label payloads for a
  bounded frame range. It is the playback stream's windowed read — the
  resident set — and replaces the general-purpose ``/frames`` chunk seed.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import typing as t

from starlette.endpoints import HTTPEndpoint
from starlette.responses import JSONResponse
from starlette.requests import Request

from fiftyone.core.expressions import ViewField as F
import fiftyone.core.fields as fof
import fiftyone.core.json as foj
import fiftyone.core.odm as foo
from fiftyone.core.utils import run_sync_task
import fiftyone.core.view as fov

from fiftyone.server.decorators import route
import fiftyone.server.view as fosv


# Synthetic instance-id prefix for an index-based track (a label with no
# ``instance._id`` but a persisted ``index``). Must match the client's
# ``TRACK_INDEX_PREFIX`` (``@fiftyone/annotation``) so the baseline index and
# the engine address the same track by the same id.
TRACK_INDEX_PREFIX = "track-"


def run_length_encode(frames: t.Iterable[int]) -> t.List[t.List[int]]:
    """Fold a set of frame numbers into contiguous ``[start, end]`` runs.

    The frames need not be sorted or unique. Consecutive integers collapse
    into one inclusive segment; a gap starts a new one. An instance present
    for the whole clip becomes a single segment regardless of length — this
    is what keeps the index O(segments) on the wire rather than O(labels).
    """
    ordered = sorted(set(frames))
    if not ordered:
        return []

    runs: t.List[t.List[int]] = []
    start = prev = ordered[0]

    for frame in ordered[1:]:
        if frame == prev + 1:
            prev = frame
            continue

        runs.append([start, prev])
        start = prev = frame

    runs.append([start, prev])
    return runs


def run_length_encode_values(
    pairs: t.Iterable[t.Tuple[int, t.Any]],
) -> t.List[list]:
    """Fold ``(frame, value)`` pairs into ``[start, end, value]`` value runs.

    A run breaks on a value change OR a non-contiguous frame (a presence gap),
    mirroring the dense per-frame attribute segmentation the client used before
    the index existed. Later samples win on a duplicate frame; output is
    frame-ordered. Like presence runs this is O(value-changes) on the wire, not
    O(labels) — a dynamic attribute that never changes is a single run.
    """
    by_frame: t.Dict[int, t.Any] = {}
    for frame, value in pairs:
        by_frame[frame] = value

    ordered = sorted(by_frame.items())
    if not ordered:
        return []

    runs: t.List[list] = []
    start, prev = ordered[0][0], ordered[0][0]
    run_value = ordered[0][1]

    for frame, value in ordered[1:]:
        if frame == prev + 1 and value == run_value:
            prev = frame
            continue

        runs.append([start, prev, run_value])
        start = prev = frame
        run_value = value

    runs.append([start, prev, run_value])
    return runs


def resolve_label_list_field(
    dataset, field: str, dynamic_group: bool = False
) -> t.Optional[str]:
    """The label-list subfield for a label field, or ``None`` for a single label.

    A ``Detections`` field stores its labels under ``detections``, ``Polylines``
    under ``polylines``, and so on; the index unwinds that list. A single-label
    field (e.g. ``Detection``) has no list and is unwound directly.

    ``dynamic_group`` selects which schema to resolve against: a video's labels
    live on the frame schema, but a dynamic group's "frames" are samples, so its
    labels live on the sample schema.
    """
    schema = (
        dataset.get_field_schema()
        if dynamic_group
        else dataset.get_frame_field_schema()
    )
    field_obj = schema.get(field)
    if not isinstance(field_obj, fof.EmbeddedDocumentField):
        return None

    return getattr(field_obj.document_type, "_LABEL_LIST_FIELD", None)


def index_post_pipeline(
    field: str,
    list_field: t.Optional[str],
    dynamic_attributes: t.Sequence[str] = (),
    dynamic_group: bool = False,
) -> t.List[dict]:
    """Mongo stages that group a frame field's labels into per-instance state.

    Appended after ``frames_only`` makes per-frame documents the pipeline's
    input. Groups by ``instance._id`` (the engine's track keystone), falling
    back to the synthetic ``track-<index>`` for an instance-less label carrying
    a persisted ``index`` (so its frames coalesce into one track), and finally
    to the per-frame label ``_id`` for a bare detection with neither. This
    mirrors the client ``addressIdOf`` exactly. The run-length encoding itself
    happens in Python on the grouped output; see :func:`run_length_encode`.

    When ``dynamic_attributes`` is non-empty the group also pushes each present
    frame's value for those attributes (one ``{fn, <attr>: ...}`` sample per
    frame), which :func:`build_instance_index` folds into per-attribute value
    runs. The same unwind/group scan already visits every label, so collecting
    the values is near-free; the cost the column adds is the pushed array, paid
    only for the attributes the caller asks for.

    When ``dynamic_group`` is set the input is the dynamic group's ordered
    *samples* rather than a video's flattened frames (an image dataset grouped
    into a video / ImaVid). There is no ``frame_number`` field, so a leading
    stage synthesizes one from each sample's rank in the group — relying on the
    input being pre-ordered, which ``get_dynamic_group`` guarantees. The label
    field is read at sample level; its ``$field.list`` shape is identical to a
    flattened frame field, so the projection/unwind/group are unchanged.
    """
    labels_expr = "$%s.%s" % (field, list_field) if list_field else "$" + field

    index_track_id = {
        "$cond": [
            {"$ne": ["$labels.index", None]},
            {"$concat": [TRACK_INDEX_PREFIX, {"$toString": "$labels.index"}]},
            None,
        ]
    }

    group: dict = {
        "_id": {
            "$ifNull": [
                "$labels.instance._id",
                {"$ifNull": [index_track_id, "$labels._id"]},
            ]
        },
        "frames": {"$addToSet": "$fn"},
        "keyframes": {
            "$addToSet": {
                "$cond": [
                    {"$eq": ["$labels.keyframe", True]},
                    "$fn",
                    None,
                ]
            }
        },
        "classLabel": {"$first": "$labels.label"},
        "persistedIndex": {"$first": "$labels.index"},
        "instance": {"$first": "$labels.instance"},
    }

    if dynamic_attributes:
        sample = {"fn": "$fn"}
        for attr in dynamic_attributes:
            sample[attr] = "$labels.%s" % attr

        group["attributeSamples"] = {"$push": sample}

    # Video frames carry `frame_number`; dynamic-group samples don't, so fold
    # the ordered samples into one array and read each sample's 1-indexed
    # position back out as its frame number.
    rank_stages: t.List[dict] = (
        [
            {"$group": {"_id": None, "docs": {"$push": "$$ROOT"}}},
            {"$unwind": {"path": "$docs", "includeArrayIndex": "rank"}},
            {
                "$replaceRoot": {
                    "newRoot": {
                        "$mergeObjects": [
                            "$docs",
                            {"frame_number": {"$add": ["$rank", 1]}},
                        ]
                    }
                }
            },
        ]
        if dynamic_group
        else []
    )

    return [
        *rank_stages,
        {
            "$project": {
                "_id": False,
                "fn": "$frame_number",
                "labels": {"$ifNull": [labels_expr, []]},
            }
        },
        {"$unwind": "$labels"},
        {"$group": group},
    ]


def build_instance_index(
    groups: t.Iterable[dict],
    dynamic_attributes: t.Sequence[str] = (),
) -> t.List[dict]:
    """Turn grouped Mongo output into the per-instance index entries.

    One entry per instance: RLE presence ``segments``, the frames carrying a
    ``keyframe`` flag, and the class/index/instance metadata the client needs
    to label and color the row. Keyframes are empty for legacy data with no
    ``keyframe`` attribute — the client treats that as "no keyframes".

    When ``dynamic_attributes`` is non-empty each entry also carries an
    ``attributeSegments`` map: ``{attr: [[start, end, value], ...]}`` of value
    runs across the instance's presence (a frame where the attribute is absent
    contributes a ``null``-valued run, so "unset" reads as its own segment).
    The key is omitted entirely when no dynamic attributes were requested, so
    the response shape is unchanged for the presence-only path.
    """
    dynamic_attributes = list(dynamic_attributes)
    instances: t.List[dict] = []

    for group in groups:
        segments = run_length_encode(group.get("frames") or [])
        if not segments:
            continue

        keyframes = sorted(
            {
                frame
                for frame in (group.get("keyframes") or [])
                if frame is not None
            }
        )

        entry = {
            "instanceId": str(group["_id"]),
            "classLabel": group.get("classLabel"),
            "persistedIndex": group.get("persistedIndex"),
            "instance": group.get("instance"),
            "segments": segments,
            "keyframes": keyframes,
        }

        if dynamic_attributes:
            samples = group.get("attributeSamples") or []
            attribute_segments: t.Dict[str, t.List[list]] = {}
            for attr in dynamic_attributes:
                runs = run_length_encode_values(
                    (sample["fn"], sample.get(attr)) for sample in samples
                )
                if runs:
                    attribute_segments[attr] = runs

            entry["attributeSegments"] = attribute_segments

        instances.append(entry)

    return instances


async def aggregate_index(
    view,
    fields: t.Iterable[str],
    dynamic_attributes: t.Sequence[str] = (),
    dynamic_group: bool = False,
) -> t.Dict[str, dict]:
    """Run the per-instance index aggregation for each requested field.

    ``view`` already selects the clip's frames: the single video sample (and
    ``frames_only`` flattens its frames), or — when ``dynamic_group`` is set —
    the dynamic group's ordered samples, each treated as a frame. Returns
    ``{field: {"instances": [...]}}`` with frame numbers and ObjectIds still
    raw — the route stringifies on the way out. ``dynamic_attributes`` adds the
    per-instance ``attributeSegments`` value runs (see
    :func:`build_instance_index`).
    """
    collection = foo.get_async_db_conn()[view._dataset._sample_collection_name]

    result: t.Dict[str, dict] = {}
    for field in fields:
        list_field = resolve_label_list_field(
            view._dataset, field, dynamic_group
        )
        pipeline = view._pipeline(
            frames_only=not dynamic_group,
            post_pipeline=index_post_pipeline(
                field, list_field, dynamic_attributes, dynamic_group
            ),
        )
        groups = await foo.aggregate(collection, pipeline).to_list(None)
        result[field] = {
            "instances": build_instance_index(groups, dynamic_attributes)
        }

    return result


class VideoLabelsIndex(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        dataset = data.get("dataset")
        stages = data.get("view")
        extended = data.get("extended", None)
        sample_id = data.get("sampleId")
        fields = data.get("fields") or []
        dynamic_attributes = data.get("dynamicAttributes") or []
        # When set, the clip is a dynamic group (an image dataset grouped into a
        # video) rather than a video sample; its "frames" are the group's
        # ordered samples and the index is built over them.
        dynamic_group = data.get("dynamicGroup")

        if dynamic_group is not None:
            view = await fosv.get_view(
                dataset,
                stages=stages,
                extended_stages=extended,
                dynamic_group=dynamic_group,
                awaitable=True,
            )
            result = await aggregate_index(
                view, fields, dynamic_attributes, dynamic_group=True
            )
            return JSONResponse(foj.stringify(result))

        view = await fosv.get_view(
            dataset, stages=stages, extended_stages=extended, awaitable=True
        )

        def select(view):
            return fov.make_optimized_select_view(
                view, sample_id, flatten=True
            )

        view = await run_sync_task(select, view)
        result = await aggregate_index(view, fields, dynamic_attributes)

        return JSONResponse(foj.stringify(result))


class VideoLabelsWindow(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        start_frame = int(data.get("startFrame", 1))
        end_frame = int(data.get("endFrame", start_frame))
        dataset = data.get("dataset")
        stages = data.get("view")
        extended = data.get("extended", None)
        sample_id = data.get("sampleId")
        fields = data.get("fields") or []
        # When set, the clip is a dynamic group (an image dataset grouped into a
        # video); the window is that group's ordered samples in the requested
        # range rather than a video sample's `frames` field.
        dynamic_group = data.get("dynamicGroup")

        if dynamic_group is not None:
            view = await fosv.get_view(
                dataset,
                stages=stages,
                extended_stages=extended,
                dynamic_group=dynamic_group,
                awaitable=True,
            )

            count = end_frame - start_frame + 1

            def window(view):
                # 1-indexed frames → 0-indexed skip; window to the request.
                return view.skip(start_frame - 1).limit(count)

            view = await run_sync_task(window, view)
            windowed = await aggregate_window(
                view,
                fields,
                None,
                dynamic_group=True,
                start_frame=start_frame,
            )
            return JSONResponse(
                {
                    "frames": foj.stringify(windowed),
                    "range": [start_frame, end_frame],
                }
            )

        view = await fosv.get_view(
            dataset, stages=stages, extended_stages=extended, awaitable=True
        )
        support = None if stages else [start_frame, end_frame]

        def run(view):
            view = fov.make_optimized_select_view(
                view, sample_id, flatten=True
            )

            if not support:
                view = view.set_field(
                    "frames",
                    F("frames").filter(
                        (F("frame_number") >= start_frame)
                        & (F("frame_number") <= end_frame)
                    ),
                )

            return view

        view = await run_sync_task(run, view)
        windowed = await aggregate_window(view, fields, support)

        return JSONResponse(
            {
                "frames": foj.stringify(windowed),
                "range": [start_frame, end_frame],
            }
        )


async def aggregate_window(
    view,
    fields: t.Iterable[str],
    support: t.Optional[t.List[int]],
    dynamic_group: bool = False,
    start_frame: int = 1,
) -> t.Dict[str, dict]:
    """Read field-projected label payloads for the windowed frames.

    Returns ``{frame_number: {field: payload}}`` keyed by stringified frame
    number, dropping fields a frame doesn't carry. ``view`` already selects the
    sample and limits the frame range (via ``support`` or a ``$filter`` stage).

    When ``dynamic_group`` is set the "frames" are the dynamic group's ordered
    samples (already windowed by the caller via ``skip``/``limit``); they carry
    sample-level label fields and no ``frame_number``, so the i-th sample is
    keyed as ``start_frame + i``.
    """
    fields = list(fields)
    project = {field: True for field in fields}
    if not dynamic_group:
        project["frame_number"] = True

    docs = await foo.aggregate(
        foo.get_async_db_conn()[view._dataset._sample_collection_name],
        view._pipeline(
            frames_only=not dynamic_group,
            support=None if dynamic_group else support,
            post_pipeline=[{"$project": project}],
        ),
    ).to_list(None)

    windowed: t.Dict[str, dict] = {}
    for offset, doc in enumerate(docs):
        frame_number = (
            start_frame + offset if dynamic_group else doc.get("frame_number")
        )
        windowed[str(frame_number)] = {
            field: doc[field] for field in fields if doc.get(field) is not None
        }

    return windowed
