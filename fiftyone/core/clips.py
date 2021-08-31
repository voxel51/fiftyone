"""
Clips views.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict

import eta.core.utils as etau

import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.validation as fov
from fiftyone import ViewField as F


def make_clips_dataset(sample_collection, field_or_expr, tol=0, min_len=0):
    """Creates a dataset that contains one sample per clip defined by the
    given video classification or frame-level expression in the collection.

    The returned dataset will contain:

    -   All sample-level fields of the input collection
    -   When ``field_or_expr`` is a video classification(s) field, the field
        will be converted to a :class:`fiftyone.core.labels.Classification`
        field
    -   A ``support`` field that records the ``[first, last]`` frame support of
        each clip
    -   A ``sample_id`` field that records the sample ID from which each clip
        was taken
    -   All frame-level information in the input collection

    ..note::

        The returned dataset will directly use the frame collection of the
        input dataset.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        field_or_expr: can be any of the following:

            -   a :class:`fiftyone.core.labels.VideoClassification` field
            -   a :class:`fiftyone.core.labels.VideoClassifications` field
            -   a :class:`fiftyone.core.expressions.ViewExpression` that
                returns a boolean to apply to each frame of the input
                collection to determine if the frame should be clipped

        tol (0): the maximum number of false frames that can be overlooked when
            generating clips from a frame-level expression
        min_len (0): the minimum allowable length of a clip when generating
            clips from a frame-level expression

    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    _validate_collection(sample_collection)

    is_classification_clips = etau.is_str(field_or_expr)

    dataset = fod.Dataset(_clips=True)
    dataset.media_type = fom.VIDEO
    dataset.add_sample_field(
        "sample_id", fof.ObjectIdField, db_field="_sample_id"
    )
    dataset.create_index("sample_id")
    dataset.add_sample_field("support", fof.FrameSupportField)

    # Convert video classifications to classifications
    if is_classification_clips:
        dataset.add_sample_field(
            field_or_expr,
            fof.EmbeddedDocumentField,
            embedded_doc_type=fol.Classification,
        )

    current_schema = dataset.get_field_schema()
    dataset._sample_doc_cls.merge_field_schema(
        {
            k: v
            for k, v in sample_collection.get_field_schema()
            if k not in current_schema
        }
    )

    # Directly inherit frames collection from source dataset
    src_dataset = sample_collection._dataset
    dataset._frame_doc_cls = src_dataset._frame_doc_cls
    dataset._doc.frame_collection_name = src_dataset._doc.frame_collection_name
    dataset._doc.frame_fields = src_dataset._doc.frame_fields
    dataset._doc.save()

    _make_pretty_summary(dataset)

    if is_classification_clips:
        _write_classification_clips(dataset, sample_collection, field_or_expr)
    else:
        _write_expr_clips(
            dataset, sample_collection, field_or_expr, tol=tol, min_len=min_len
        )

    return dataset


def make_trajectories_dataset(sample_collection, field, only_tracks=True):
    """Creates a dataset that contains one sample per clip defined by each
    object trajectory in the frames of the given collection.

    An object trajectory is defined by a collection of
    :class:`fiftyone.core.labels.Label` instances in a sample with the same
    ``(label, index)``.

    The returned dataset will contain:

    -   All sample-level fields of the input collection
    -   A ``"support"`` field that records the ``[first, last]`` frame support
        of each clip
    -   A ``"sample_id"`` field that records the sample ID from which each clip
        was taken
    -   A new ``field`` that records the ``label`` of each trajectory
    -   All frame-level information in the input collection

    ..note::

        The returned dataset will directly use the frame collection of the
        input dataset.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        field: the name of a frame-level object field, which can be any of the
            following types:

            -   :class:`fiftyone.core.labels.Detections`
            -   :class:`fiftyone.core.labels.Polylines`
            -   :class:`fiftyone.core.labels.Keypoints`

            The ``"frames."`` prefix is optional
        only_tracks (True): whether to omit labels with no ``index`` (True) or
            create single-frame clips for every label without an index (False)

    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    _validate_collection(sample_collection)

    field, _ = sample_collection._handle_frame_field(field)

    dataset = fod.Dataset(_clips=True)
    dataset.media_type = fom.VIDEO
    dataset.add_sample_field(
        "sample_id", fof.ObjectIdField, db_field="_sample_id"
    )
    dataset.create_index("sample_id")
    dataset.add_sample_field("support", fof.FrameSupportField)

    # Store trajectory label as string field
    # @todo `label` and `index` in a `Label` field?
    dataset.add_sample_field(field, fof.StringField)

    current_schema = dataset.get_field_schema()
    dataset._sample_doc_cls.merge_field_schema(
        {
            k: v
            for k, v in sample_collection.get_field_schema()
            if k not in current_schema
        }
    )

    # Directly inherit frames collection from source dataset
    src_dataset = sample_collection._dataset
    dataset._frame_doc_cls = src_dataset._frame_doc_cls
    dataset._doc.frame_collection_name = src_dataset._doc.frame_collection_name
    dataset._doc.frame_fields = src_dataset._doc.frame_fields
    dataset._doc.save()

    _make_pretty_summary(dataset)

    _write_trajectories(dataset, sample_collection, field, only_tracks)

    return dataset


def _validate_collection(sample_collection):
    fov.validate_video_collection(sample_collection)
    if sample_collection._dataset._is_clips:
        raise ValueError(
            "Cannot extract clips from a collection that already contains "
            "clips"
        )


def _make_pretty_summary(dataset):
    set_fields = ["id", "sample_id", "filepath", "suppoprt"]
    all_fields = dataset._sample_doc_cls._fields_ordered
    pretty_fields = set_fields + [f for f in all_fields if f not in set_fields]
    dataset._sample_doc_cls._fields_ordered = tuple(pretty_fields)


def _write_classification_clips(dataset, src_collection, field):
    src_dataset = src_collection._dataset
    label_type = src_collection._get_label_field_type(field)

    supported_types = (fol.VideoClassification, fol.VideoClassifications)
    if label_type not in supported_types:
        raise ValueError(
            "Field '%s' must be a %s type; found %s"
            % (field, supported_types, label_type)
        )

    #
    # Populate sample collection
    #

    pipeline = src_collection._pipeline(detach_frames=True)
    pipeline.append(
        {
            "$project": {
                "_id": False,
                "_media_type": True,
                "filepath": True,
                "metadata": True,
                "tags": True,
                "_sample_id": "$_id",
                field: True,
            }
        }
    )

    if label_type is fol.VideoClassifications:
        list_path = field + "." + label_type._LABEL_LIST_FIELD
        pipeline.extend(
            [{"$unwind": "$" + list_path}, {"$set": {field: "$" + list_path}},]
        )

    support_path = field + ".support"
    pipeline.extend(
        [
            {
                "$set": {
                    "support": "$" + support_path,
                    field + "._cls": "Classification",
                    "_rand": {"$rand": {}},
                }
            },
            {"$unset": support_path},
            {"$out": dataset._sample_collection_name},
        ]
    )

    src_dataset._aggregate(pipeline=pipeline, attach_frames=False)


def _write_expr_clips(dataset, src_collection, expr, tol=0, min_len=0):
    src_dataset = src_collection._dataset
    _tmp_field = "_support"

    #
    # Convert expression to clips
    #

    # @todo implement this as a $map + $reduce?
    bools = src_collection.values(F("frames").map(expr))
    clips = [_to_rle(b, tol=tol, min_len=min_len) for b in bools]
    src_collection.set_values(
        _tmp_field, clips, expand_schema=False, _allow_missing=True,
    )

    src_collection = fod._always_select_field(src_collection, _tmp_field)

    #
    # Populate sample collection
    #

    pipeline = src_collection._pipeline(detach_frames=True)
    pipeline.extend(
        [
            {
                "$project": {
                    "_id": False,
                    "_media_type": True,
                    "filepath": True,
                    "metadata": True,
                    "tags": True,
                    "_sample_id": "$_id",
                    _tmp_field: True,
                }
            },
            {"$set": {"support": "$" + _tmp_field}},
            {"$unset": _tmp_field},
            {"$unwind": "$support"},
            {"$set": {"_rand": {"$rand": {}}}},
            {"$out": dataset._sample_collection_name},
        ]
    )
    src_dataset._aggregate(pipeline=pipeline, attach_frames=False)

    cleanup_op = {"$unset": {_tmp_field: ""}}
    src_dataset._sample_collection.update_many({}, cleanup_op)


def _to_rle(bools, tol=0, min_len=0):
    if not bools:
        return None

    ranges = []
    start = None
    gap = 0
    for idx, b in enumerate(bools, 1):
        if b:
            gap = 0
            if start is None:
                start = idx
        else:
            gap += 1
            if start is not None and gap > tol:
                last = idx - gap
                if last - start + 1 >= min_len:
                    ranges.append((start, last))

                start = None

    if start is not None:
        # pylint: disable=undefined-loop-variable
        last = idx - gap
        if last - start + 1 >= min_len:
            ranges.append((start, idx - gap))

    return ranges


def _write_trajectories(dataset, src_collection, field, only_tracks):
    src_dataset = src_collection._dataset
    _tmp_field = "_" + field

    # Get trajectories

    trajs = _get_trajectories(src_collection, field, only_tracks)
    src_collection.set_values(
        _tmp_field, trajs, expand_schema=False, _allow_missing=True,
    )

    src_collection = fod._always_select_field(src_collection, _tmp_field)

    #
    # Populate sample collection
    #

    pipeline = src_collection._pipeline(detach_frames=True)
    pipeline.extend(
        [
            {
                "$project": {
                    "_id": False,
                    "_media_type": True,
                    "filepath": True,
                    "metadata": True,
                    "tags": True,
                    "_sample_id": "$_id",
                    _tmp_field: True,
                }
            },
            {"$unwind": "$" + _tmp_field},
            {
                "$set": {
                    "support": {"$slice": ["$" + _tmp_field, 1, 2]},
                    field: {"$arrayElemAt": ["$" + _tmp_field, 0]},
                }
            },
            {"$unset": _tmp_field},
            {"$set": {"_rand": {"$rand": {}}}},
            {"$out": dataset._sample_collection_name},
        ]
    )
    src_dataset._aggregate(pipeline=pipeline, attach_frames=False)

    cleanup_op = {"$unset": {_tmp_field: ""}}
    src_dataset._sample_collection.update_many({}, cleanup_op)


def _get_trajectories(sample_collection, frame_field, only_tracks):
    path = sample_collection._FRAMES_PREFIX + frame_field
    label_type = sample_collection._get_label_field_type(path)

    if not issubclass(label_type, fol._LABEL_LIST_FIELDS):
        raise ValueError(
            "Frame field '%s' has type %s, but trajectories can only be "
            "extracted for label list fields %s"
            % (frame_field, label_type, fol._LABEL_LIST_FIELDS,)
        )

    fn_expr = F("frames").map(F("frame_number"))
    uuid_expr = F("frames").map(
        F(frame_field + "." + label_type._LABEL_LIST_FIELD).map(
            F("label").concat(
                ".", (F("index") != None).if_else(F("index").to_string(), "")
            )
        )
    )

    fns, all_uuids = sample_collection.values([fn_expr, uuid_expr])

    trajs = []
    orphan_conter = 0
    for sample_fns, sample_uuids in zip(fns, all_uuids):
        if not sample_uuids:
            trajs.append(None)
            continue

        obs = defaultdict(_Bounds)
        for fn, frame_uuids in zip(sample_fns, sample_uuids):
            if not frame_uuids:
                continue

            for uuid in frame_uuids:
                label, index = uuid.rsplit(".", 1)
                if index:
                    index = int(index)
                    obs[(label, index)].add(fn)
                elif not only_tracks:
                    # @note assumes all valid indexes are positive numbers!
                    orphan_conter -= 1
                    index = orphan_conter
                    obs[(label, index)].add(fn)

        clips = []
        for (label, _), bounds in obs.items():
            clips.append((label, bounds.min, bounds.max))

        trajs.append(clips)

    return trajs


class _Bounds(object):
    def __init__(self):
        self.min = None
        self.max = None

    def add(self, value):
        if self.min is None:
            self.min = value
            self.max = value
        else:
            self.min = min(self.min, value)
            self.max = max(self.max, value)
