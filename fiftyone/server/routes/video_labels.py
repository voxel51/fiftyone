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


def resolve_label_list_field(dataset, field: str) -> t.Optional[str]:
    """The label-list subfield for a frame field, or ``None`` for a single label.

    A ``Detections`` field stores its labels under ``detections``, ``Polylines``
    under ``polylines``, and so on; the index unwinds that list. A single-label
    field (e.g. ``Detection``) has no list and is unwound directly.
    """
    field_obj = dataset.get_frame_field_schema().get(field)
    if not isinstance(field_obj, fof.EmbeddedDocumentField):
        return None

    return getattr(field_obj.document_type, "_LABEL_LIST_FIELD", None)


def index_post_pipeline(
    field: str, list_field: t.Optional[str]
) -> t.List[dict]:
    """Mongo stages that group a frame field's labels into per-instance state.

    Appended after ``frames_only`` makes per-frame documents the pipeline's
    input. Groups by ``instance._id`` (the engine's track keystone), falling
    back to the per-frame label ``_id`` so instance-less legacy detections
    fragment into single-frame entries — exactly as the client's frame walk
    does today. The run-length encoding itself happens in Python on the
    grouped output; see :func:`run_length_encode`.
    """
    labels_expr = "$%s.%s" % (field, list_field) if list_field else "$" + field

    return [
        {
            "$project": {
                "_id": False,
                "fn": "$frame_number",
                "labels": {"$ifNull": [labels_expr, []]},
            }
        },
        {"$unwind": "$labels"},
        {
            "$group": {
                "_id": {"$ifNull": ["$labels.instance._id", "$labels._id"]},
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
        },
    ]


def build_instance_index(groups: t.Iterable[dict]) -> t.List[dict]:
    """Turn grouped Mongo output into the per-instance index entries.

    One entry per instance: RLE presence ``segments``, the frames carrying a
    ``keyframe`` flag, and the class/index/instance metadata the client needs
    to label and color the row. Keyframes are empty for legacy data with no
    ``keyframe`` attribute — the client treats that as "no keyframes".
    """
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

        instances.append(
            {
                "instanceId": str(group["_id"]),
                "classLabel": group.get("classLabel"),
                "persistedIndex": group.get("persistedIndex"),
                "instance": group.get("instance"),
                "segments": segments,
                "keyframes": keyframes,
            }
        )

    return instances


async def aggregate_index(view, fields: t.Iterable[str]) -> t.Dict[str, dict]:
    """Run the per-instance index aggregation for each requested field.

    ``view`` is expected to already select the single video sample. Returns
    ``{field: {"instances": [...]}}`` with frame numbers and ObjectIds still
    raw — the route stringifies on the way out.
    """
    collection = foo.get_async_db_conn()[view._dataset._sample_collection_name]

    result: t.Dict[str, dict] = {}
    for field in fields:
        list_field = resolve_label_list_field(view._dataset, field)
        pipeline = view._pipeline(
            frames_only=True,
            post_pipeline=index_post_pipeline(field, list_field),
        )
        groups = await foo.aggregate(collection, pipeline).to_list(None)
        result[field] = {"instances": build_instance_index(groups)}

    return result


class VideoLabelsIndex(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        dataset = data.get("dataset")
        stages = data.get("view")
        extended = data.get("extended", None)
        sample_id = data.get("sampleId")
        fields = data.get("fields") or []

        view = await fosv.get_view(
            dataset, stages=stages, extended_stages=extended, awaitable=True
        )

        def select(view):
            return fov.make_optimized_select_view(
                view, sample_id, flatten=True
            )

        view = await run_sync_task(select, view)
        result = await aggregate_index(view, fields)

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
    view, fields: t.Iterable[str], support: t.Optional[t.List[int]]
) -> t.Dict[str, dict]:
    """Read field-projected label payloads for the windowed frames.

    Returns ``{frame_number: {field: payload}}`` keyed by stringified frame
    number, dropping fields a frame doesn't carry. ``view`` already selects the
    sample and limits the frame range (via ``support`` or a ``$filter`` stage).
    """
    fields = list(fields)
    project = {"frame_number": True}
    for field in fields:
        project[field] = True

    frames = await foo.aggregate(
        foo.get_async_db_conn()[view._dataset._sample_collection_name],
        view._pipeline(
            frames_only=True,
            support=support,
            post_pipeline=[{"$project": project}],
        ),
    ).to_list(None)

    windowed: t.Dict[str, dict] = {}
    for frame in frames:
        frame_number = frame.get("frame_number")
        windowed[str(frame_number)] = {
            field: frame[field]
            for field in fields
            if frame.get(field) is not None
        }

    return windowed
