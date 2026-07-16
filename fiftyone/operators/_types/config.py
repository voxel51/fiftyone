"""
FiftyOne operator config types.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from enum import Enum


class RiskLevel(Enum):
    """Risk levels that operators can declare."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    DANGEROUS = "dangerous"


class OperatorSurface(Enum):
    """Surface on which an operator can be used or is currently active."""

    DATASET_SAMPLES_GRID = "dataset_samples_grid"
    DATASET_SAMPLE_MODAL = "dataset_sample_modal"
    ALL = "ALL"
