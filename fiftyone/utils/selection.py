"""
Utilities for selecting content from datasets.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import warnings

from bson import ObjectId

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
from fiftyone.core.expressions import ViewField as F


def select_samples(sample_collection, sample_ids):
    """Selects the specified samples from the collection.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        sample_ids: an iterable of sample IDs to select

    Returns:
        a :class:`fiftyone.core.view.DatasetView` containing only the specified
        samples
    """
    return sample_collection.select(sample_ids)


def exclude_samples(sample_collection, sample_ids):
    """Excludes the specified samples from the collection.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        sample_ids: an iterable of sample IDs to exclude

    Returns:
        a :class:`fiftyone.core.view.DatasetView` that excludes the specified
        samples
    """
    return sample_collection.exclude(sample_ids)


def select_objects(sample_collection, objects):
    """Selects the specified objects from the sample collection.

    The returned view will omit samples, sample fields, and individual objects
    that do not appear in the provided ``objects`` argument, which should have
    the following format::

        [
            {
                "sample_id": "5f8d254a27ad06815ab89df4",
                "field": "ground_truth",
                "object_id": "5f8d254a27ad06815ab89df3",
            },
            {
                "sample_id": "5f8d255e27ad06815ab93bf8",
                "field": "ground_truth",
                "object_id": "5f8d255e27ad06815ab93bf6",
            },
            ...
        ]

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        objects: a list of dicts defining the objects to select

    Returns:
        a :class:`fiftyone.core.view.DatasetView` containing only the specified
        objects
    """
    sample_ids, object_ids = _parse_objects(objects)

    label_schema = sample_collection.get_field_schema(
        ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
    )

    view = sample_collection.select(sample_ids)
    view = view.select_fields(list(object_ids.keys()))

    for field, object_ids in object_ids.items():
        label_filter = F("_id").is_in(object_ids)
        view = _apply_label_filter(view, label_schema, field, label_filter)

    return view


def exclude_objects(sample_collection, objects):
    """Excludes the specified objects from the sample collection.

    The returned view will omit the labels specified in the provided
    ``objects`` argument, which should have the following format::

        [
            {
                "sample_id": "5f8d254a27ad06815ab89df4",
                "field": "ground_truth",
                "object_id": "5f8d254a27ad06815ab89df3",
            },
            {
                "sample_id": "5f8d255e27ad06815ab93bf8",
                "field": "ground_truth",
                "object_id": "5f8d255e27ad06815ab93bf6",
            },
            ...
        ]

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        objects: a list of dicts defining the objects to exclude

    Returns:
        a :class:`fiftyone.core.view.DatasetView` that excludes the specified
        objects
    """
    _, object_ids = _parse_objects(objects)

    label_schema = sample_collection.get_field_schema(
        ftype=fof.EmbeddedDocumentField, embedded_doc_type=fol.Label
    )

    view = sample_collection
    for field, object_ids in object_ids.items():
        label_filter = ~F("_id").is_in(object_ids)
        view = _apply_label_filter(view, label_schema, field, label_filter)

    return view


def _parse_objects(objects):
    sample_ids = set()
    object_ids = defaultdict(set)
    for obj in objects:
        sample_ids.add(obj["sample_id"])
        object_ids[obj["field"]].add(ObjectId(obj["object_id"]))

    return sample_ids, object_ids


def _apply_label_filter(sample_collection, label_schema, field, label_filter):
    if field not in label_schema:
        raise ValueError(
            "%s '%s' has no label field '%s'"
            % (
                sample_collection.__class__.__name__,
                sample_collection.name,
                field,
            )
        )

    label_type = label_schema[field].document_type

    if label_type in (
        fol.Classification,
        fol.Detection,
        fol.Polyline,
        fol.Keypoint,
    ):
        return sample_collection.filter_field(field, label_filter)

    if label_type is fol.Classifications:
        return sample_collection.filter_classifications(field, label_filter)

    if label_type is fol.Detections:
        return sample_collection.filter_detections(field, label_filter)

    if label_type is fol.Polylines:
        return sample_collection.filter_polylines(field, label_filter)

    if label_type is fol.Keypoints:
        return sample_collection.filter_keypoints(field, label_filter)

    msg = "Ignoring unsupported field '%s' (%s)" % (field, label_type)
    warnings.warn(msg)
    return sample_collection
