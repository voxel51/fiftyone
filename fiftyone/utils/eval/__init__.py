"""
Evaluation utilities.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import types

from .classification import (
    ClassificationEvaluationConfig,
    ClassificationResults,
    evaluate_classifications,
)
from .detection import (
    DetectionEvaluationConfig,
    DetectionResults,
    evaluate_detections,
)
from .regression import (
    RegressionEvaluationConfig,
    RegressionResults,
    evaluate_regressions,
)
from .segmentation import (
    SegmentationEvaluationConfig,
    SegmentationResults,
    evaluate_segmentations,
)


# This tells Sphinx to allow refs to imported objects in this module
# https://stackoverflow.com/a/31594545/16823653
__all__ = [
    k
    for k, v in globals().items()
    if not k.startswith("_") and not isinstance(v, types.ModuleType)
]
