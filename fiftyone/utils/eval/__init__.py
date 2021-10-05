"""
Evaluation utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .classification import (
    evaluate_classifications,
    ClassificationResults,
    BinaryClassificationResults,
)
from .detection import (
    evaluate_detections,
    DetectionResults,
)
from .segmentation import (
    evaluate_segmentations,
    SegmentationResults,
)
