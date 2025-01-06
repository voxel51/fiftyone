"""
Evaluation utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import types

from .classification import (
    evaluate_classifications,
    ClassificationEvaluationConfig,
    ClassificationResults,
)
from .detection import (
    evaluate_detections,
    DetectionEvaluationConfig,
    DetectionResults,
)
from .regression import (
    evaluate_regressions,
    RegressionEvaluationConfig,
    RegressionResults,
)
from .segmentation import (
    evaluate_segmentations,
    SegmentationEvaluationConfig,
    SegmentationResults,
)

# This tells Sphinx to allow refs to imported objects in this module
# https://stackoverflow.com/a/31594545/16823653
__all__ = [
    k
    for k, v in globals().items()
    if not k.startswith("_") and not isinstance(v, types.ModuleType)
]
