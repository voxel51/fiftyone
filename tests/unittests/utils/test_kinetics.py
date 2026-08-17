"""Tests for Kinetics dataset utilities.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.utils.kinetics as fouk


def test_get_incomplete_classes_with_missing_local_class():
    info = fouk.KineticsDatasetInfo.__new__(fouk.KineticsDatasetInfo)
    info._classwise_sample_ids = {
        "complete": ["complete-1", "complete-2"],
        "not-downloaded": ["not-downloaded-1", "not-downloaded-2"],
    }
    info._classwise_existing_sample_ids = {
        "complete": ["complete-1", "complete-2"]
    }

    assert info.get_incomplete_classes() == ["not-downloaded"]
