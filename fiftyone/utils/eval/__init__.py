"""
Evaluation utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .base import (
    EvaluationConfig,
    EvaluationMethod,
    EvaluationResults,
    list_evaluations,
    delete_evaluation,
    delete_evaluations,
)
from .classification import (
    evaluate_classifications,
    evaluate_binary_classifications,
    ClassificationEvaluationConfig,
    ClassificationEvaluationMethod,
    ClassificationResults,
    BinaryClassificationResults,
)
from .detection import (
    evaluate_detections,
    DetectionEvaluationConfig,
    DetectionEvaluationMethod,
    DetectionResults,
)
