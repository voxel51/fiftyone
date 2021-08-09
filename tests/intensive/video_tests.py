"""
Video tests.

You must run these tests interactively as follows::

    pytest tests/intensive/video_tests.py -s -k <test_case>

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import random
import unittest

import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone import ViewField as F


def test_to_frames():
    dataset = foz.load_zoo_dataset("quickstart-video").clone()

    dataset.tag_samples("test")

    frames = dataset.to_frames()

    # Frames inherit sample tags
    print(dataset.count_sample_tags())
    print(frames.count_sample_tags())

    frames.tag_samples("frames")

    # Tagging frames has no effect on the source dataset
    print(frames.count_sample_tags())
    print(dataset.count_sample_tags())

    frames.untag_samples("frames")

    # Untagging frames has no effect on the source dataset
    print(frames.count_sample_tags())
    print(dataset.count_sample_tags())

    frames.tag_labels("test")

    # Tagging labels applies to the source dataset
    print(frames.count_label_tags())
    print(dataset.count_label_tags())
    print(dataset.count_values("frames.detections.detections.tags"))

    frames.untag_labels("test")

    # Untagging labels applies to the source dataset
    print(frames.count_label_tags())
    print(dataset.count_label_tags())
    print(dataset.count_values("frames.detections.detections.tags"))

    view = frames.limit(100).set_field(
        "detections.detections.label", F("label").upper()
    )

    # Views can be created, but don't affect source dataset until saved
    print(frames.count("detections.detections"))
    print(view.count("detections.detections"))
    print(dataset.count("frames.detections.detections"))
    print(frames.count_values("detections.detections.label"))
    print(view.count_values("detections.detections.label"))
    print(dataset.count_values("frames.detections.detections.label"))

    view.save()

    # Changes and deletions are synced with source dataset
    print(frames.count("detections.detections"))
    print(view.count("detections.detections"))
    print(dataset.count("frames.detections.detections"))
    print(frames.count_values("detections.detections.label"))
    print(view.count_values("detections.detections.label"))
    print(dataset.count_values("frames.detections.detections.label"))

    # Ensure that data is correctly formed
    print(frames.first().frame_id)
    print(dataset.first().frames.first().id)

    sample = frames.first()

    sample["hello"] = "world"
    sample.save()

    # Fields can be added by direct sample modification, and are saved
    print(frames)
    print(dataset)
    print(frames.count_values("hello"))
    print(dataset.count_values("frames.hello"))

    sample = frames.exclude_fields("detections").first()
    sample["hello2"] = "world2"
    sample.save()

    # Excluded fields are not removed when saving frame samples
    print(frames)
    print(dataset)
    print(frames.count_values("detections.detections.label"))
    print(frames.count_values("hello2"))
    print(dataset.count_values("frames.hello2"))
    print(dataset.count_values("frames.detections.detections.label"))

    dataset.untag_samples("test")
    frames.reload()

    # Reloading a view syncs it with the source dataset
    print(dataset.count_sample_tags())
    print(frames.count_sample_tags())


def test_to_frame_patches():
    dataset = foz.load_zoo_dataset("quickstart-video").clone()

    dataset.tag_samples("test")

    frames = dataset.to_frames()
    patches = frames.to_patches("detections")

    # Frames and patches inherit sample tags
    print(dataset.count_sample_tags())
    print(frames.count_sample_tags())
    print(patches.count_sample_tags())

    patches.tag_samples("patches")

    # Tagging frame patches has no effect on the source datasets
    print(dataset.count_sample_tags())
    print(frames.count_sample_tags())
    print(patches.count_sample_tags())

    patches.untag_samples("patches")

    # Untagging frames has no effect on the source datasets
    print(dataset.count_sample_tags())
    print(frames.count_sample_tags())
    print(patches.count_sample_tags())

    patches.tag_labels("test")

    # Tagging patch labels applies to the source datasets
    print(patches.count_label_tags())
    print(patches.count_values("detections.tags"))
    print(frames.count_label_tags())
    print(frames.count_values("detections.detections.tags"))
    print(dataset.count_label_tags())
    print(dataset.count_values("frames.detections.detections.tags"))

    patches.untag_labels("test")

    # Untagging labels applies to the source datasets
    print(patches.count_label_tags())
    print(patches.count_values("detections.tags"))
    print(frames.count_label_tags())
    print(frames.count_values("detections.detections.tags"))
    print(dataset.count_label_tags())
    print(dataset.count_values("frames.detections.detections.tags"))

    view = patches.limit(100).set_field("detections.label", F("label").upper())

    # Views can be created, but don't affect source datasets until saved
    print(view.count("detections"))
    print(patches.count("detections"))
    print(frames.count("detections.detections"))
    print(dataset.count("frames.detections.detections"))
    print(view.count_values("detections.label"))
    print(patches.count_values("detections.label"))
    print(frames.count_values("detections.detections.label"))
    print(dataset.count_values("frames.detections.detections.label"))

    view.save()

    # Changes and deletions are synced with source datasets
    print(view.count("detections"))
    print(patches.count("detections"))
    print(frames.count("detections.detections"))
    print(dataset.count("frames.detections.detections"))
    print(view.count_values("detections.label"))
    print(patches.count_values("detections.label"))
    print(frames.count_values("detections.detections.label"))
    print(dataset.count_values("frames.detections.detections.label"))

    # Ensure that data is correctly formed
    print(view.first().frame_id)
    print(patches.first().frame_id)
    print(frames.first().id)
    print(dataset.first().frames.first().id)

    sample = view.first()

    sample["hello"] = "world"
    sample.save()

    # New sample-level patch fields are not synced
    print(view.count_values("hello"))
    print(patches.count_values("hello"))
    assert "hello" not in frames.get_field_schema()
    assert "hello" not in dataset.get_frame_field_schema()

    sample.detections.hello = "world"
    sample.save()

    # Patch label changes are synced to source datasets
    print(view.count_values("detections.hello"))
    print(patches.count_values("detections.hello"))
    print(frames.count_values("detections.detections.hello"))
    print(dataset.count_values("frames.detections.detections.hello"))

    dataset.untag_samples("test")
    patches.reload()

    # Reloading a frame patches view syncs it with the source datasets
    print(dataset.count_sample_tags())
    print(frames.count_sample_tags())
    print(patches.count_sample_tags())


def test_to_frame_eval_patches():
    dataset = foz.load_zoo_dataset("quickstart-video").clone()
    dataset.limit(1).save()

    for sample in dataset:
        for frame in sample.frames.values():
            predictions = frame["detections"].copy()
            for det in predictions.detections:
                det.confidence = random.random()
                det.bounding_box[0] += 0.03 * (random.random() - 0.5)
                det.bounding_box[1] += 0.03 * (random.random() - 0.5)

            frame["predictions"] = predictions

        sample.save()

    dataset.evaluate_detections(
        "frames.predictions", gt_field="frames.detections", eval_key="eval",
    )

    try:
        patches = dataset.to_evaluation_patches("eval")
        assert False  # shouldn't get here
    except ValueError:
        pass

    patches = dataset.to_frames().to_evaluation_patches("eval")

    print(patches)
    print(patches.first())
    print(patches.count_values("type"))


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    unittest.main(verbosity=2)
