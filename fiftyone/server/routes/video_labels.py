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
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.requests import Request

from fiftyone.core.expressions import ViewField as F
import fiftyone.core.fields as fof
import fiftyone.core.json as foj
import fiftyone.core.labels as fol
import fiftyone.core.odm as foo
import fiftyone.core.stages as fosg
from fiftyone.core.utils import run_sync_task
import fiftyone.core.view as fov

from fiftyone.server.decorators import route
import fiftyone.server.view as fosv

# Synthetic instance-id prefix for an index-based track (a label with no
# ``instance._id`` but a persisted ``index``). Must match the client's
# ``TRACK_INDEX_PREFIX`` (``@fiftyone/annotation``) so the baseline index and
# the engine address the same track by the same id.
TRACK_INDEX_PREFIX = "track-"

# Single-label types the client addresses by field rather than per label, as
# ``field:<path>``. Must match ``SINGLETON_LABEL_TYPES`` and
# ``singletonAddressId`` in the App so each such field is one timeline row.
SINGLETON_ADDRESS_PREFIX = "field:"
_SINGLETON_LABEL_TYPES = (
    fol.Classification,
    fol.Heatmap,
    fol.Regression,
    fol.Segmentation,
)

# A stage that drops a sample by a predicate over all of its frames
# (``"frame_match"``) can drop it for frames outside the window, so it needs
# the whole clip
_WINDOW_ROLES = {fosg._SAMPLE_ROLE, fosg._FRAME_ROLE}


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
    """The label-list subfield of ``field``, or ``None`` for a single label.

    ``dynamic_group`` resolves against the sample schema, since a dynamic
    group's "frames" are samples.
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


def resolve_singleton_address_id(
    dataset, field: str, dynamic_group: bool = False
) -> t.Optional[str]:
    """The client's field-level address id when ``field`` holds a
    Classification, Heatmap, Regression or Segmentation, else ``None``.
    """
    schema = (
        dataset.get_field_schema()
        if dynamic_group
        else dataset.get_frame_field_schema()
    )
    field_obj = schema.get(field)
    if not isinstance(field_obj, fof.EmbeddedDocumentField) or not issubclass(
        field_obj.document_type, _SINGLETON_LABEL_TYPES
    ):
        return None

    path = field if dynamic_group else "frames." + field
    return SINGLETON_ADDRESS_PREFIX + path


def index_post_pipeline(
    field: str,
    list_field: t.Optional[str],
    dynamic_attributes: t.Sequence[str] = (),
    dynamic_group: bool = False,
    singleton_address_id: t.Optional[str] = None,
) -> t.List[dict]:
    """Mongo stages that group a frame field's labels into per-instance state.

    Appended after ``frames_only`` makes per-frame documents the pipeline's
    input. Groups by ``instance._id`` (the engine's track keystone), falling
    back to the synthetic ``track-<index>`` for an instance-less label carrying
    a persisted ``index`` (so its frames coalesce into one track), and finally
    to the per-frame label ``_id`` for a bare detection with neither. A
    ``singleton_address_id`` (see :func:`resolve_singleton_address_id`)
    replaces all of that, so a single-label field is one group.
    This mirrors the client ``addressIdOf`` exactly. The run-length encoding itself
    happens in Python on the grouped output; see :func:`run_length_encode`.

    When ``dynamic_attributes`` is non-empty the group also pushes each present
    frame's value for those attributes (one ``{fn, <attr>: ...}`` sample per
    frame), which :func:`build_instance_index` folds into per-attribute value
    runs. The same unwind/group scan already visits every label, so collecting
    the values is near-free; the cost the column adds is the pushed array, paid
    only for the attributes the caller asks for.

    When ``dynamic_group`` is set the input is the group's samples, and each
    label's ``fn`` is its member sample's ``_id`` rather than a frame number;
    the client maps members to frames through the group's member order. See
    :func:`build_member_index`.

    Only the label attributes the index reads are projected, so masks and
    other payloads never reach the grouping.
    """
    labels_path = "%s.%s" % (field, list_field) if list_field else field
    fn_expr = "$_id" if dynamic_group else "$frame_number"

    attrs = {"_id", "instance", "index", "keyframe", "label"}
    attrs.update(dynamic_attributes)
    # a path inside another projected path is a collision for MongoDB
    project = {
        "%s.%s" % (labels_path, attr): True
        for attr in attrs
        if not any(attr.startswith(other + ".") for other in attrs)
    }
    if not dynamic_group:
        project["frame_number"] = True

    index_track_id = {
        "$cond": [
            {"$ne": ["$labels.index", None]},
            {"$concat": [TRACK_INDEX_PREFIX, {"$toString": "$labels.index"}]},
            None,
        ]
    }

    group: dict = {
        "_id": (
            {"$literal": singleton_address_id}
            if singleton_address_id
            else {
                "$ifNull": [
                    "$labels.instance._id",
                    {"$ifNull": [index_track_id, "$labels._id"]},
                ]
            }
        ),
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

    return [
        {"$project": project},
        {
            "$project": {
                "_id": False,
                "fn": fn_expr,
                "labels": {"$ifNull": ["$" + labels_path, []]},
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


def build_member_index(
    groups: t.Iterable[dict],
    dynamic_attributes: t.Sequence[str] = (),
) -> t.List[dict]:
    """Turn a dynamic group's grouped Mongo output into per-instance index
    entries keyed by member sample.

    Like :func:`build_instance_index`, but frame positions are left to the
    client, which holds the group's member order: each entry lists the
    ``members`` the instance appears on and the ``keyframeMembers`` carrying
    a ``keyframe`` flag. When ``dynamic_attributes`` is non-empty, each entry
    also carries ``attributeValues``: ``{attr: [[member, value], ...]}`` in
    the group's order, a later value for the same member winning.
    """
    dynamic_attributes = list(dynamic_attributes)
    instances: t.List[dict] = []

    for group in groups:
        members = group.get("frames") or []
        if not members:
            continue

        entry = {
            "instanceId": str(group["_id"]),
            "classLabel": group.get("classLabel"),
            "persistedIndex": group.get("persistedIndex"),
            "instance": group.get("instance"),
            "members": members,
            "keyframeMembers": [
                member
                for member in (group.get("keyframes") or [])
                if member is not None
            ],
        }

        if dynamic_attributes:
            samples = group.get("attributeSamples") or []
            entry["attributeValues"] = {
                attr: [[sample["fn"], sample.get(attr)] for sample in samples]
                for attr in dynamic_attributes
            }

        instances.append(entry)

    return instances


async def aggregate_index(
    view,
    fields: t.Iterable[str],
    dynamic_attributes: t.Sequence[str] = (),
    dynamic_group: bool = False,
) -> t.Dict[str, dict]:
    """Run the per-instance index aggregation for each requested field.

    ``view`` already selects the clip's frames: the single video sample, or
    the dynamic group's ordered samples when ``dynamic_group`` is set. Returns
    ``{field: {"instances": [...]}}`` with frame numbers and ObjectIds still
    raw; ``dynamic_attributes`` adds the per-instance ``attributeSegments``
    value runs (see :func:`build_instance_index`). A dynamic group's entries
    are keyed by member sample instead (see :func:`build_member_index`).
    """
    collection = foo.get_async_db_conn()[view._dataset._sample_collection_name]
    build = build_member_index if dynamic_group else build_instance_index

    result: t.Dict[str, dict] = {}
    for field in fields:
        list_field = resolve_label_list_field(
            view._dataset, field, dynamic_group
        )
        singleton_address_id = resolve_singleton_address_id(
            view._dataset, field, dynamic_group
        )
        pipeline = view._pipeline(
            frames_only=not dynamic_group,
            post_pipeline=index_post_pipeline(
                field,
                list_field,
                dynamic_attributes,
                dynamic_group,
                singleton_address_id,
            ),
        )
        groups = await foo.aggregate(collection, pipeline).to_list(None)
        result[field] = {"instances": build(groups, dynamic_attributes)}

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
        # when set, the clip's "frames" are this dynamic group's ordered
        # samples rather than a video sample's frames
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
        # Frames are 1-indexed and the window is inclusive; anything else
        # reaches the driver as a negative skip or limit and surfaces as a 500
        if start_frame < 1 or end_frame < start_frame:
            raise HTTPException(
                status_code=400,
                detail="startFrame must be at least 1 and endFrame at least "
                "startFrame",
            )
        dataset = data.get("dataset")
        stages = data.get("view")
        extended = data.get("extended", None)
        sample_id = data.get("sampleId")
        fields = data.get("fields") or []
        # when set, the window is this dynamic group's ordered samples in the
        # requested range rather than a video sample's frames
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
        view, support = await run_sync_task(
            window_view, view, sample_id, start_frame, end_frame
        )
        windowed = await aggregate_window(view, fields, support)

        return JSONResponse(
            {
                "frames": foj.stringify(windowed),
                "range": [start_frame, end_frame],
            }
        )


def window_view(
    view, sample_id: str, start_frame: int, end_frame: int
) -> t.Tuple[fov.DatasetView, t.Optional[t.List[int]]]:
    """Selects ``sample_id`` from ``view`` for a read of the inclusive frame
    window.

    Returns the view and the ``support`` to pass to :func:`aggregate_window`.
    When every stage is sample-level or per-frame, ``support`` bounds the
    frame lookup to the window, so the stages only see the windowed frames.
    Otherwise ``support`` is ``None`` and the view reads the whole clip, then
    keeps the frames in the window.
    """
    view = fov.make_optimized_select_view(view, sample_id, flatten=True)

    if all(role in _WINDOW_ROLES for role in view._get_frame_roles()):
        return view, [start_frame, end_frame]

    view = view.match_frames(
        (F("frame_number") >= start_frame) & (F("frame_number") <= end_frame),
        omit_empty=False,
    )
    return view, None


async def aggregate_window(
    view,
    fields: t.Iterable[str],
    support: t.Optional[t.List[int]],
    dynamic_group: bool = False,
    start_frame: int = 1,
) -> t.Dict[str, dict]:
    """Read field-projected label payloads for the windowed frames.

    Returns ``{frame_number: {field: payload}}`` keyed by stringified frame
    number, dropping fields a frame doesn't carry; when ``dynamic_group`` is
    set the i-th windowed sample is keyed as ``start_frame + i``. ``view``
    already selects the sample and limits the frame range (via ``support`` or
    a ``$filter`` stage).
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
