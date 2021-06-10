"""
Video tests.

You must run these tests interactively as follows::

    pytest tests/intensive/video_tests.py -s -k <test_case>

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone import ViewField as F


def test_to_frames():
    dataset = foz.load_zoo_dataset("quickstart-video").clone()
    dataset.rename_frame_field("ground_truth_detections", "ground_truth")

    dataset.tag_samples("test")

    view = dataset.to_frames()

    # Frames inherit sample tags
    print(dataset.count_sample_tags())
    print(view.count_sample_tags())

    view.tag_samples("view")

    # Tagging frames has no effect on the source dataset
    print(view.count_sample_tags())
    print(dataset.count_sample_tags())

    view.untag_samples("view")

    # Untagging frames has no effect on the source dataset
    print(view.count_sample_tags())
    print(dataset.count_sample_tags())

    view.tag_labels("test")

    # Tagging labels applies to the source dataset
    print(view.count_label_tags())
    print(dataset.count_label_tags())
    print(dataset.count_values("frames.ground_truth.detections.tags"))

    view.untag_labels("test")

    # Untagging labels applies to the source dataset
    print(view.count_label_tags())
    print(dataset.count_label_tags())
    print(dataset.count_values("frames.ground_truth.detections.tags"))

    view2 = view.limit(100).set_field(
        "ground_truth.detections.label", F("label").upper()
    )

    # Views can be created, but don't affect source dataset until saved
    print(view.count("ground_truth.detections"))
    print(view2.count("ground_truth.detections"))
    print(dataset.count("frames.ground_truth.detections"))
    print(view.count_values("ground_truth.detections.label"))
    print(view2.count_values("ground_truth.detections.label"))
    print(dataset.count_values("frames.ground_truth.detections.label"))

    view2.save()

    # Changes and deletions are synced with source dataset
    print(view.count("ground_truth.detections"))
    print(view2.count("ground_truth.detections"))
    print(dataset.count("frames.ground_truth.detections"))
    print(view.count_values("ground_truth.detections.label"))
    print(view2.count_values("ground_truth.detections.label"))
    print(dataset.count_values("frames.ground_truth.detections.label"))

    # Ensure that data is correctly formed
    print(view.first().frame_id)
    print(dataset.first().frames.first().id)

    sample = view.first()

    sample["hello"] = "world"
    sample.save()

    # Fields can be added by direct sample modification, and are saved
    print(view)
    print(dataset)
    print(view.count_values("hello"))
    print(dataset.count_values("frames.hello"))

    sample = view.exclude_fields("ground_truth").first()
    sample["hello2"] = "world2"
    sample.save()

    # Excluded fields are not removed when saving frame samples
    print(view)
    print(dataset)
    print(view.count_values("ground_truth.detections.label"))
    print(view.count_values("hello2"))
    print(dataset.count_values("frames.hello2"))
    print(dataset.count_values("frames.ground_truth.detections.label"))

    dataset.untag_samples("test")
    view.reload()

    # Reloading a view syncs it with the source dataset
    print(dataset.count_sample_tags())
    print(view.count_sample_tags())


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    unittest.main(verbosity=2)
