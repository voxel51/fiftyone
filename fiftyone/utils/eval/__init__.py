"""
Evaluation utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .base import (
    EvaluationConfig,
    EvaluationResults,
    list_evaluations,
    clear_evaluation,
    clear_evaluations,
)
from .classification import (
    evaluate_classifications,
    evaluate_binary_classifications,
    evaluate_top_k_classifications,
    ClassificationEvaluationConfig,
    ClassificationResults,
    BinaryClassificationResults,
)
from .detection import (
    list_detection_methods,
    evaluate_detections,
    DetectionEvaluationConfig,
    DetectionResults,
)
