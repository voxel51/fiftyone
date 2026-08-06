"""
FiftyOne plugin types.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from enum import Enum


class PluginScope(Enum):
    """Context in which a plugin or panel can be used or is active."""

    DATASET_SAMPLES_GRID = "dataset_samples_grid"
    DATASET_SAMPLE_MODAL = "dataset_sample_modal"
    FIFTYONE_LANDING_PAGE = "fiftyone_landing_page"
    ALL = "ALL"
