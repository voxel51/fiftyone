"""
Evaluation utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .base import (
    Evaluation,
    EvaluationConfig,
    EvaluationInfo,
    EvaluationResults,
    list_evaluations,
    get_evaluation_info,
    save_evaluation_info,
    load_evaluation_view,
    delete_evaluation,
    delete_evaluations,
)
from .classification import (
    evaluate_classifications,
    evaluate_binary_classifications,
    ClassificationEvaluation,
    ClassificationEvaluationConfig,
    ClassificationResults,
    BinaryClassificationResults,
)
from .detection import (
    evaluate_detections,
    DetectionEvaluation,
    DetectionEvaluationConfig,
    DetectionResults,
)
