"""
View tests.

All of these tests are designed to be run manually via::

    pytest tests/intensive/view_tests.py -s -k test_<name>

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone import ViewField as F


def test_filter_frame_labels():
    dataset = foz.load_zoo_dataset("quickstart-video").clone()

    label_counts = dataset.count_values("frames.detections.detections.label")
    assert len(label_counts) == 3
    # {'person': 1108, 'vehicle': 7511, 'road sign': 2726}

    view = dataset.filter_labels("frames.detections", F("label") == "vehicle")

    label_counts = view.count_values("frames.detections.detections.label")
    assert len(label_counts) == 1
    # {'vehicle': 7511}

    view.save()

    label_counts = dataset.count_values("frames.detections.detections.label")
    assert len(label_counts) == 1
    # {'vehicle': 7511}


def test_select_frame_fields():
    dataset = foz.load_zoo_dataset("quickstart-video").clone()

    view = dataset.select_fields()
    assert "detections" not in view.get_frame_field_schema()

    frame = view.first().frames.first()
    assert frame.detections is None


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    unittest.main(verbosity=2)
