"""
Clips views.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.core.dataset as fod
import fiftyone.core.expressions as foe
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.validation as fov
from fiftyone import ViewField as F


def make_clips_dataset(sample_collection, field_or_expr, tol=0):
    """Creates a dataset that contains one sample per clip defined by the
    given video classification or frame-level expression in the collection.

    The returned dataset will only contain the default sample-level fields
    of the input collection, as well as all frame-level information. A
    ``sample_id`` field will be added that records the sample ID from which
    each clip was taken.

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
            run-length encoding a frame-level expression into clips

    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    fov.validate_video_collection(sample_collection)

    dataset = fod.Dataset(_clips=True)
    dataset.media_type = fom.VIDEO
    dataset.add_sample_field(
        "sample_id", fof.ObjectIdField, db_field="_sample_id"
    )
    dataset.create_index("sample_id")
    dataset.add_sample_field("frame_support", fof.FrameSupportField)

    frame_schema = sample_collection.get_frame_field_schema()
    dataset._frame_doc_cls.merge_field_schema(frame_schema)

    # @todo for video classifications, add top-level `Classification` to clips
    clips = _get_clips(sample_collection, field_or_expr, tol=tol)
    _write_clips(dataset, sample_collection, "frame_support", clips)

    return dataset


def _write_clips(dataset, src_collection, support_field, clips):
    _support_field = "_" + support_field

    #
    # Populate sample collection
    #

    src_dataset = src_collection._dataset
    src_collection.set_values(
        _support_field, clips, expand_schema=False, _allow_missing=True,
    )

    src_collection = fod._always_select_field(src_collection, _support_field)
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
                    _support_field: True,
                }
            },
            {"$set": {support_field: "$" + _support_field}},
            {"$unset": _support_field},
            {"$unwind": "$" + support_field},
            {"$set": {"_rand": {"$rand": {}}}},
            {"$out": dataset._sample_collection_name},
        ]
    )
    src_dataset._aggregate(pipeline=pipeline, attach_frames=False)

    cleanup_op = {"$unset": {_support_field: ""}}
    src_dataset._sample_collection.update_many({}, cleanup_op)

    #
    # Populate frames collection
    #

    pipeline = src_collection._pipeline(frames_only=True)
    pipeline.append({"$out": dataset._frame_collection_name})
    src_dataset._aggregate(pipeline=pipeline, attach_frames=False)


def _get_clips(sample_collection, field_or_expr, tol=0):
    if isinstance(field_or_expr, foe.ViewExpression):
        bools = sample_collection.values(F("frames").map(field_or_expr))
        return [_to_rle(b, tol=tol) for b in bools]

    label_type, path = sample_collection._get_label_field_path(
        field_or_expr, "support"
    )

    supported_types = (fol.VideoClassification, fol.VideoClassifications)
    if label_type not in supported_types:
        raise ValueError(
            "Field '%s' must be a %s type; found %s"
            % (field_or_expr, supported_types, label_type)
        )

    clips = sample_collection.values(path)
    if label_type is fol.VideoClassification:
        clips = [[s] if s else None for s in clips]

    return clips


def _to_rle(bools, tol=0):
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
                ranges.append((start, idx - gap))
                start = None

    if start is not None:
        # pylint: disable=undefined-loop-variable
        ranges.append((start, idx))

    return ranges
