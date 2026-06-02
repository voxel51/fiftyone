"""
Training-run helpers: view snapshots, view resolution, and label-kind
evaluation dispatch. No key slugging (RD1: register_run validates keys).

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.core.labels as fol
from fiftyone.utils.eval.classification import evaluate_classifications
from fiftyone.utils.eval.detection import evaluate_detections
from fiftyone.utils.eval.regression import evaluate_regressions
from fiftyone.utils.eval.segmentation import evaluate_segmentations

_EVAL_DISPATCH = {
    "classification": evaluate_classifications,
    "regression": evaluate_regressions,
    "segmentation": evaluate_segmentations,
    "detection": evaluate_detections,
}

_LABEL_KINDS = (
    (
        "detection",
        (fol.Detections, fol.Polylines, fol.Keypoints, fol.TemporalDetections),
    ),
    ("classification", (fol.Classification,)),
    ("regression", (fol.Regression,)),
    ("segmentation", (fol.Segmentation,)),
)


def capture_view_ids(view):
    return list(view.values("id"))


def resolve_view(dataset, view):
    """Resolve a DatasetView or tag/saved-view name to a DatasetView."""
    if view is None or not isinstance(view, str):
        return view
    if view in dataset.list_saved_views():
        return dataset.load_saved_view(view)
    return dataset.match_tags(view)


def resolve_eval_kind(samples, gt_field):
    label_type = samples._get_label_field_type(gt_field)
    for kind, types in _LABEL_KINDS:
        if issubclass(label_type, types):
            return kind
    raise ValueError(
        f"Unsupported ground-truth label type {label_type.__name__!r} "
        f"for field {gt_field!r}"
    )
