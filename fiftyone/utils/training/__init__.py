"""
Training-run helpers: view snapshots, view resolution, and label-kind
evaluation dispatch. No key slugging (RD1: register_run validates keys).

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from bson import json_util

import fiftyone.core.labels as fol
import fiftyone.core.view as fov
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


def capture_view_stages(view):
    """Serializes the view's stages as JSON strings.

    IDs are the fact (frozen membership); stages are the intent (the
    recreatable view definition). A ``Dataset`` has no stages -> ``[]``.

    Stored as JSON strings -- NOT raw dicts -- mirroring how the run
    framework persists ``RunDocument.view_stages``: the serialized stage
    dicts contain ``_cls`` keys that mongoengine would otherwise try to
    dereference against its document registry on load.
    """
    if not isinstance(view, fov.DatasetView):
        view = view.view()

    return [
        json_util.dumps(s) for s in view._serialize(include_uuids=False)
    ]


def load_view_stages(dataset, stages):
    """Rebuilds a :class:`fiftyone.core.view.DatasetView` from stages
    captured by :func:`capture_view_stages`.

    The exact inverse of the capture: mirrors how the core run framework
    rehydrates ``RunDocument.view_stages`` (see ``BaseRun.load_run_view``).

    Args:
        dataset: the parent :class:`fiftyone.core.dataset.Dataset`
        stages: a list of JSON-string stages, or ``None``

    Returns:
        a :class:`fiftyone.core.view.DatasetView`
    """
    if not stages:
        return dataset.view()

    stage_dicts = [json_util.loads(s) for s in stages]
    return fov.DatasetView._build(dataset, stage_dicts)


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
