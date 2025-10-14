"""Json types registery.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.server.utils.json_transform.transform import register
import fiftyone.core.labels as fol


@register(fol.Classification)
def transform_classification(value: dict) -> fol.Classification:
    return fol.Classification.from_dict(value)


@register(fol.Classifications)
def transform_classifications(value: dict) -> fol.Classifications:
    return fol.Classifications.from_dict(value)


@register(fol.Detection)
def transform_detection(value: dict) -> fol.Detection:
    return fol.Detection.from_dict(value)


@register(fol.Detections)
def transform_detections(value: dict) -> fol.Detections:
    return fol.Detections.from_dict(value)


@register(fol.Polyline)
def transform_polyline(value: dict) -> fol.Polyline:
    return fol.Polyline.from_dict(value)


@register(fol.Polylines)
def transform_polylines(value: dict) -> fol.Polylines:
    return fol.Polylines.from_dict(value)
