"""
Patch views.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol


_PATCHES_TYPES = (fol.Detections, fol.Polylines)
_SINGLE_TYPES_MAP = {
    fol.Detections: fol.Detection,
    fol.Polylines: fol.Polyline,
}


def make_patches_dataset(sample_collection, field, name=None):
    """Creates a dataset that contains one sample per object patch in the
    specified field of the collection.

    Only ``field`` and the default sample fields are included in the new
    dataset.

    .. note::

        The returned dataset is independent from the input collection, so
        modifying its contents will not affect the input collection.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        field: the patches field, which must be of type
            :class:`fiftyone.core.labels.Detections` or
            :class:`fiftyone.core.labels.Polylines`
        name (None): a name for the returned dataset

    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    field_type = _get_single_label_field_type(sample_collection, field)

    dataset = fo.Dataset(name)
    dataset.add_sample_field(
        field, fof.EmbeddedDocumentField, embedded_doc_type=field_type
    )

    patches_view = _make_patches_view(sample_collection, field)
    _merge_samples(dataset, patches_view)

    return dataset


def make_evaluation_dataset(
    sample_collection, eval_key, crowd_attr=None, name=None
):
    """Creates a dataset based on the results of the evaluation with the given
    key that contains one sample for each true positive, false positive, and
    false negative example in the input collection, respectively.

    True positive examples will result in samples with both their ground truth
    and predicted fields populated, while false positive/negative examples will
    only have their predicted/ground truth fields populated, respectively.

    The returned dataset will also have top-level ``type`` and ``iou`` fields
    populated based on the evaluation results for that example.

    .. note::

        The returned dataset is independent from the input collection, so
        modifying its contents will not affect the input collection.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        eval_key: an evaluation key that corresponds to the evaluation of
            ground truth/predicted fields that are of type
            :class:`fiftyone.core.labels.Detections`
        crowd_attr (None): the name or ``embedded.field.name`` of the crowd
            attribute for the ground truth objects. If provided, a ``crowd``
            field will be populated on the samples of the returned dataset
        name (None): a name for the returned dataset

    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    eval_info = sample_collection.get_evaluation_info(eval_key)
    pred_field = eval_info.config.pred_field
    gt_field = eval_info.config.gt_field

    pred_type = _get_single_label_field_type(sample_collection, pred_field)
    gt_type = _get_single_label_field_type(sample_collection, gt_field)

    dataset = fo.Dataset(name)
    dataset.add_sample_field(
        pred_field, fof.EmbeddedDocumentField, embedded_doc_type=pred_type
    )
    dataset.add_sample_field(
        gt_field, fof.EmbeddedDocumentField, embedded_doc_type=gt_type
    )
    dataset.add_sample_field("type", fof.StringField)
    dataset.add_sample_field("iou", fof.FloatField)
    if crowd_attr is not None:
        dataset.add_sample_field("crowd", fof.BooleanField)

    pred_view = _make_patches_view(sample_collection, pred_field)
    pred_view = _upgrade_eval(pred_view, pred_field, eval_key)
    _merge_samples(dataset, pred_view)

    gt_view = _make_patches_view(sample_collection, gt_field)
    gt_view = _upgrade_eval(gt_view, gt_field, eval_key, upgrade_id=True)

    if crowd_attr is not None:
        crowd_path = gt_field + "." + crowd_attr
        gt_view = gt_view.mongo(
            [{"$set": {"crowd": {"$toBool": "$" + crowd_path}}}]
        )

    _merge_samples(dataset, gt_view)

    return dataset


def _make_patches_view(sample_collection, field, keep_label_lists=False):
    if sample_collection._is_frame_field(field):
        raise ValueError(
            "Extracting patches for video datasets is not yet supported"
        )

    label_type = sample_collection._get_label_field_type(field)
    if issubclass(label_type, _PATCHES_TYPES):
        list_field = field + "." + label_type._LABEL_LIST_FIELD
    else:
        raise ValueError(
            "Invalid label field type %s. Extracting patches is only "
            "supported for the following types: %s"
            % (label_type, _PATCHES_TYPES)
        )

    # One sample per patch, upgrade label ID to sample ID
    pipeline = [
        {"$unwind": "$" + list_field},
        {"$set": {"_id": "$" + list_field + "._id"}},
    ]

    if keep_label_lists:
        # Convert back to label lists
        pipeline.append({"$set": {list_field: ["$" + list_field]}})
    else:
        # Convert to single label field
        pipeline.append({"$set": {field: "$" + list_field}})

    return sample_collection.select_fields(field).mongo(pipeline)


def _get_single_label_field_type(sample_collection, field):
    label_type = sample_collection._get_label_field_type(field)

    if label_type not in _SINGLE_TYPES_MAP:
        raise ValueError("Unsupported label field type %s" % label_type)

    return _SINGLE_TYPES_MAP[label_type]


def _upgrade_eval(view, field, eval_key, upgrade_id=False):
    eval_type = field + "." + eval_key
    eval_id = field + "." + eval_key + "_id"
    eval_iou = field + "." + eval_key + "_iou"

    pipeline = []

    if upgrade_id:
        pipeline.append(
            {
                "$set": {
                    "_id": {
                        "$cond": {
                            "if": {"$ne": ["$" + eval_id, ""]},
                            "then": {"$toObjectId": "$" + eval_id},
                            "else": "$_id",
                        }
                    }
                }
            }
        )

    pipeline.extend(
        [
            {"$set": {"type": "$" + eval_type}},
            {"$set": {"iou": "$" + eval_iou}},
            {"$unset": [eval_type, eval_id, eval_iou]},
        ]
    )

    return view.mongo(pipeline)


def _merge_samples(dataset, src_collection):
    pipeline = src_collection._pipeline(detach_frames=True)
    pipeline.append(
        {
            "$merge": {
                "into": dataset._sample_collection_name,
                "on": "_id",
                "whenMatched": "merge",
                "whenNotMatched": "insert",
            }
        }
    )

    src_collection._dataset._aggregate(pipeline=pipeline, attach_frames=False)
