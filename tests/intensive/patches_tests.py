"""
Patches tests.

You must run these tests interactively as follows::

    pytest tests/intensive/patches_tests.py -s -k <test_case>

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone import ViewField as F


def test_to_patches():
    dataset = foz.load_zoo_dataset("quickstart").clone()

    view = dataset.to_patches("ground_truth")

    # Patches views inherit tags from the dataset
    print(dataset.count_sample_tags())
    print(view.count_sample_tags())

    view.tag_samples("test")

    # Tagging patches has no effect on dataset samples
    print(view.count_sample_tags())
    print(dataset.count_sample_tags())

    view.untag_samples("test")

    # Untagging patches has no effect on dataset samples
    print(view.count_sample_tags())
    print(dataset.count_sample_tags())

    view.tag_labels("test")

    # Tagging patch labels immediately syncs with dataset labels
    print(view.count_label_tags())
    print(dataset.count_label_tags())
    print(dataset.count_values("ground_truth.detections.tags"))
    print(dataset.count_values("predictions.detections.tags"))

    view.untag_labels("test")

    # Untagging patch labels immediately syncs with dataset labels
    print(view.count_label_tags())
    print(dataset.count_label_tags())
    print(dataset.count_values("ground_truth.detections.tags"))
    print(dataset.count_values("predictions.detections.tags"))

    view2 = view.limit(100).set_field("ground_truth.label", F("label").upper())
    view2.save()

    # Saving a modified patches view syncs label modifications and deletions
    # with the dataset's labels
    print(view.count("ground_truth"))
    print(view2.count("ground_truth"))
    print(dataset.count("ground_truth.detections"))
    print(view.count_values("ground_truth.label"))
    print(view2.count_values("ground_truth.label"))
    print(dataset.count_values("ground_truth.detections.label"))

    sample = view.first()

    sample.ground_truth.hello = "world"
    sample.save()

    # Directly editing and saving a single patch syncs any label changes with
    # the dataset's labels
    print(view.count_values("ground_truth.hello"))
    print(dataset.count_values("ground_truth.detections.hello"))

    dataset.untag_samples("validation")
    view.reload()

    # Reloading an eval view syncs it with the source dataset's contents
    print(dataset.count_sample_tags())
    print(view.count_sample_tags())


def test_to_evaluation_patches():
    dataset = foz.load_zoo_dataset("quickstart").clone()
    dataset.evaluate_detections("predictions", eval_key="eval")

    view = dataset.to_evaluation_patches("eval")

    # Eval patches views inherit tags from the dataset
    print(dataset.count_sample_tags())
    print(view.count_sample_tags())

    view.tag_samples("test")

    # Tagging eval patches has no effect on dataset samples
    print(view.count_sample_tags())
    print(dataset.count_sample_tags())

    view.untag_samples("test")

    # Untagging eval patches has no effect on dataset samples
    print(view.count_sample_tags())
    print(dataset.count_sample_tags())

    view.tag_labels("test")

    # Tagging eval labels immediately syncs with dataset labels
    print(view.count_label_tags())
    print(dataset.count_label_tags())
    print(dataset.count_values("ground_truth.detections.tags"))
    print(dataset.count_values("predictions.detections.tags"))

    view.untag_labels("test")

    # Untagging eval labels immediately syncs with dataset labels
    print(view.count_label_tags())
    print(dataset.count_label_tags())
    print(dataset.count_values("ground_truth.detections.tags"))
    print(dataset.count_values("predictions.detections.tags"))

    view2 = view.match(F("crowd") == True)
    view2.tag_labels("crowded", "predictions")

    # Tagging a view into an evaluation view only affects the constituent
    # labels, both in the patches view and the source dataset
    print(view2.count("predictions.detections"))
    print(view.count_label_tags())
    print(dataset.count_label_tags())
    print(dataset.count_values("ground_truth.detections.tags"))
    print(dataset.count_values("predictions.detections.tags"))

    view2.set_field("ground_truth.detections.hello", "world").save()

    # Saving an eval view syncs modifications and deletions with the source
    # dataset
    print(view.count("ground_truth.detections"))
    print(dataset.count("ground_truth.detections"))
    print(view.count("predictions.detections"))
    print(dataset.count("predictions.detections"))
    print(dataset.count_values("ground_truth.detections.hello"))

    sample = view.first()

    for det in sample.predictions.detections:
        det.hello = "world"

    sample.save()

    # Directly editing and saving a single eval patch syncs any label changes
    # with the dataset's labels
    print(view.count_values("predictions.detections.hello"))
    print(dataset.count_values("predictions.detections.hello"))

    dataset.untag_samples("validation")
    view.reload()

    # Reloading an eval view syncs it with the source dataset's contents
    print(dataset.count_sample_tags())
    print(view.count_sample_tags())


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    unittest.main(verbosity=2)
