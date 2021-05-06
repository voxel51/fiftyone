"""
Patch utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou

fouc = fou.lazy_import("fiftyone.utils.eval.coco")


_SINGLE_TYPES_MAP = {
    fol.Detections: fol.Detection,
    fol.Polylines: fol.Polyline,
}
_PATCHES_TYPES = (fol.Detections, fol.Polylines)
_NO_MATCH_ID = ""


def make_patches_dataset(
    sample_collection, field, keep_label_lists=False, name=None
):
    """Creates a dataset that contains one sample per object patch in the
    specified field of the collection.

    Fields other than ``field`` and the default sample fields will not be
    included in the returned dataset. A ``sample_id`` field will be added that
    records the sample ID from which each patch was taken.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        field: the patches field, which must be of type
            :class:`fiftyone.core.labels.Detections` or
            :class:`fiftyone.core.labels.Polylines`
        keep_label_lists (False): whether to store the patches in label list
            fields of the same type as the input collection rather than using
            their single label variants
        name (None): a name for the returned dataset

    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    if keep_label_lists:
        field_type = sample_collection._get_label_field_type(field)
    else:
        field_type = _get_single_label_field_type(sample_collection, field)

    dataset = fod.Dataset(name, _patches=True)
    dataset.add_sample_field("sample_id", fof.StringField)
    dataset.add_sample_field(
        field, fof.EmbeddedDocumentField, embedded_doc_type=field_type
    )

    patches_view = _make_patches_view(
        sample_collection, field, keep_label_lists=keep_label_lists
    )
    _write_samples(dataset, patches_view)

    return dataset


def _get_single_label_field_type(sample_collection, field):
    label_type = sample_collection._get_label_field_type(field)

    if label_type not in _SINGLE_TYPES_MAP:
        raise ValueError("Unsupported label field type %s" % label_type)

    return _SINGLE_TYPES_MAP[label_type]


def make_evaluation_dataset(sample_collection, eval_key, name=None):
    """Creates a dataset based on the results of the evaluation with the given
    key that contains one sample for each true positive, false positive, and
    false negative example in the input collection, respectively.

    True positive examples will result in samples with both their ground truth
    and predicted fields populated, while false positive/negative examples will
    only have one of their corresponding predicted/ground truth fields
    populated, respectively.

    If multiple predictions are matched to a ground truth object (e.g., if the
    evaluation protocol includes a crowd attribute), then all matched
    predictions will be stored in the single sample along with the ground truth
    object.

    The returned dataset will also have top-level ``type`` and ``iou`` fields
    populated based on the evaluation results for that example, as well as a
    ``sample_id`` field recording the sample ID of the example, and a ``crowd``
    field if the evaluation protocol defines a crowd attribute.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        eval_key: an evaluation key that corresponds to the evaluation of
            ground truth/predicted fields that are of type
            :class:`fiftyone.core.labels.Detections` or
            :class:`fiftyone.core.labels.Polylines`
        name (None): a name for the returned dataset

    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    # Parse evaluation info
    eval_info = sample_collection.get_evaluation_info(eval_key)
    eval_collection = sample_collection.load_evaluation_view(eval_key)
    pred_field = eval_info.config.pred_field
    gt_field = eval_info.config.gt_field
    if isinstance(eval_info.config, fouc.COCOEvaluationConfig):
        crowd_attr = eval_info.config.iscrowd
    else:
        crowd_attr = None

    pred_type = eval_collection._get_label_field_type(pred_field)
    gt_type = eval_collection._get_label_field_type(gt_field)

    # Setup dataset with correct schema
    dataset = fod.Dataset(name, _patches=True)
    dataset.add_sample_field(
        pred_field, fof.EmbeddedDocumentField, embedded_doc_type=pred_type
    )
    dataset.add_sample_field(
        gt_field, fof.EmbeddedDocumentField, embedded_doc_type=gt_type
    )
    dataset.add_sample_field("sample_id", fof.StringField)
    dataset.add_sample_field("type", fof.StringField)
    dataset.add_sample_field("iou", fof.FloatField)
    if crowd_attr is not None:
        dataset.add_sample_field("crowd", fof.BooleanField)

    # Add ground truth patches
    gt_view = _make_eval_view(
        eval_collection, eval_key, gt_field, crowd_attr=crowd_attr
    )
    _write_samples(dataset, gt_view)

    # Merge matched predictions
    _merge_matched_labels(dataset, eval_collection, eval_key, pred_field)

    # Add unmatched predictions
    unmatched_pred_view = _make_eval_view(
        eval_collection, eval_key, pred_field, skip_matched=True
    )
    _add_samples(dataset, unmatched_pred_view)

    return dataset


def _make_patches_view(sample_collection, field, keep_label_lists=False):
    if sample_collection._is_frame_field(field):
        raise ValueError(
            "Frame label patches cannot be directly extracted; you must first "
            "convert your video dataset into a frame dataset"
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

    pipeline = [
        {
            "$project": {
                "_id": 1,
                "_media_type": 1,
                "filepath": 1,
                "metadata": 1,
                "tags": 1,
                field + "._cls": 1,
                list_field: 1,
            }
        },
        {"$unwind": "$" + list_field},
        {
            "$set": {
                "sample_id": {"$toString": "$_id"},
                "_rand": {"$rand": {}},
            }
        },
        {"$set": {"_id": "$" + list_field + "._id"}},
    ]

    if keep_label_lists:
        pipeline.append({"$set": {list_field: ["$" + list_field]}})
    else:
        pipeline.append({"$set": {field: "$" + list_field}})

    return sample_collection.mongo(pipeline)


def _make_eval_view(
    sample_collection, eval_key, field, skip_matched=False, crowd_attr=None
):
    eval_type = field + "." + eval_key
    eval_id = field + "." + eval_key + "_id"
    eval_iou = field + "." + eval_key + "_iou"

    view = _make_patches_view(sample_collection, field)

    if skip_matched:
        view = view.mongo(
            [{"$match": {"$expr": {"$eq": ["$" + eval_id, _NO_MATCH_ID]}}}]
        )

    view = view.mongo(
        [{"$set": {"type": "$" + eval_type, "iou": "$" + eval_iou}}]
    )

    if crowd_attr is not None:
        crowd_path1 = "$" + field + "." + crowd_attr
        crowd_path2 = "$" + field + ".attributes." + crowd_attr + ".value"
        view = view.mongo(
            [
                {
                    "$set": {
                        "crowd": {
                            "$cond": {
                                "if": {"$gt": [crowd_path1, None]},
                                "then": {"$toBool": crowd_path1},
                                "else": {
                                    "$cond": {
                                        "if": {"$gt": [crowd_path2, None]},
                                        "then": {"$toBool": crowd_path2},
                                        "else": None,
                                    }
                                },
                            }
                        }
                    }
                }
            ]
        )

    return _upgrade_labels(view, field)


def _upgrade_labels(view, field):
    tmp_field = "_" + field
    label_type = view._get_label_field_type(field)
    return view.mongo(
        [
            {"$set": {tmp_field: "$" + field}},
            {"$unset": field},
            {
                "$set": {
                    field: {
                        "_cls": label_type.__name__,
                        label_type._LABEL_LIST_FIELD: ["$" + tmp_field],
                    }
                }
            },
            {"$unset": tmp_field},
        ]
    )


def _merge_matched_labels(dataset, src_collection, eval_key, field):
    field_type = src_collection._get_label_field_type(field)

    list_field = field + "." + field_type._LABEL_LIST_FIELD
    eval_id = eval_key + "_id"
    foreign_key = "key"

    lookup_pipeline = src_collection._pipeline(detach_frames=True)
    lookup_pipeline.extend(
        [
            {"$project": {list_field: 1}},
            {"$unwind": "$" + list_field},
            {"$replaceRoot": {"newRoot": "$" + list_field}},
            {
                "$match": {
                    "$expr": {
                        "$and": [
                            {"$ne": ["$" + eval_id, _NO_MATCH_ID]},
                            {
                                "$eq": [
                                    {"$toObjectId": "$" + eval_id},
                                    "$$" + foreign_key,
                                ]
                            },
                        ]
                    }
                }
            },
        ]
    )

    pipeline = [
        {"$set": {field + "._cls": field_type.__name__}},
        {
            "$lookup": {
                "from": src_collection._dataset._sample_collection_name,
                "let": {foreign_key: "$_id"},
                "pipeline": lookup_pipeline,
                "as": list_field,
            }
        },
        {
            "$set": {
                field: {
                    "$cond": {
                        "if": {"$gt": [{"$size": "$" + list_field}, 0]},
                        "then": "$" + field,
                        "else": None,
                    }
                }
            }
        },
        {"$out": dataset._sample_collection_name},
    ]

    dataset._aggregate(pipeline=pipeline, attach_frames=False)


def _write_samples(dataset, src_collection):
    pipeline = src_collection._pipeline(detach_frames=True)
    pipeline.append({"$out": dataset._sample_collection_name})

    src_collection._dataset._aggregate(pipeline=pipeline, attach_frames=False)


def _add_samples(dataset, src_collection):
    pipeline = src_collection._pipeline(detach_frames=True)
    pipeline.append(
        {
            "$merge": {
                "into": dataset._sample_collection_name,
                "on": "_id",
                "whenMatched": "keepExisting",
                "whenNotMatched": "insert",
            }
        }
    )

    src_collection._dataset._aggregate(pipeline=pipeline, attach_frames=False)
