"""
View tests.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone import ViewField as F


def test_filter_frame_labels():
    dataset = foz.load_zoo_dataset("quickstart-video").clone()
    dataset.rename_frame_field("ground_truth_detections", "ground_truth")

    label_counts = dataset.count_values("frames.ground_truth.detections.label")
    assert len(label_counts) == 3
    # {'person': 1108, 'vehicle': 7511, 'road sign': 2726}

    view = dataset.filter_labels(
        "frames.ground_truth", F("label") == "vehicle"
    )

    label_counts = view.count_values("frames.ground_truth.detections.label")
    assert len(label_counts) == 1
    # {'vehicle': 7511}

    view.save()

    label_counts = dataset.count_values("frames.ground_truth.detections.label")
    assert len(label_counts) == 1
    # {'vehicle': 7511}


def test_select_frame_fields():
    dataset = foz.load_zoo_dataset("quickstart-video").clone()
    dataset.rename_frame_field("ground_truth_detections", "ground_truth")

    view = dataset.select_fields()
    assert "ground_truth" not in view.get_frame_field_schema()

    frame = view.first().frames.first()
    assert frame.ground_truth is None


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    unittest.main(verbosity=2)
