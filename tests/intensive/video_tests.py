"""
Video tests.

You must run these tests interactively as follows::

    pytest tests/intensive/video_tests.py -s -k <test_case>

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import random
import unittest

import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone import ViewField as F
import fiftyone.utils.video as fouv


def test_to_clips():
    dataset = foz.load_zoo_dataset("quickstart-video").clone()

    dataset.tag_samples("test")

    clips = dataset.filter_labels(
        "frames.detections", F("label") == "road sign"
    ).to_clips("frames.detections")

    # Clips inherit sample tags
    print(dataset.count_sample_tags())
    print(clips.count_sample_tags())

    clips.tag_samples("clips")

    # Tagging clips has no effect on the source dataset
    print(clips.count_sample_tags())
    print(dataset.count_sample_tags())

    clips.untag_samples("clips")

    # Untagging clips has no effect on the source dataset
    print(clips.count_sample_tags())
    print(dataset.count_sample_tags())

    clips.tag_labels("test")

    # Tagging labels applies to the source dataset
    print(clips.count_label_tags())
    print(dataset.count_label_tags())
    print(dataset.count_values("frames.detections.detections.tags"))

    clips.untag_labels("test")

    # Untagging labels applies to the source dataset
    print(clips.count_label_tags())
    print(dataset.count_label_tags())
    print(dataset.count_values("frames.detections.detections.tags"))

    view = clips.limit(1).set_field(
        "frames.detections.detections.label", F("label").upper()
    )

    # Views can be created, but don't affect source dataset until saved
    print(clips.count("frames.detections.detections"))
    print(view.count("frames.detections.detections"))
    print(dataset.count("frames.detections.detections"))
    print(clips.count_values("frames.detections.detections.label"))
    print(view.count_values("frames.detections.detections.label"))
    print(dataset.count_values("frames.detections.detections.label"))

    view.save()

    # Changes and deletions are synced with source dataset
    print(clips.count("frames.detections.detections"))
    print(view.count("frames.detections.detections"))
    print(dataset.count("frames.detections.detections"))
    print(clips.count_values("frames.detections.detections.label"))
    print(view.count_values("frames.detections.detections.label"))
    print(dataset.count_values("frames.detections.detections.label"))

    # Ensure that data is correctly formed
    print(clips.first().frames.first().id)
    print(dataset.first().frames.first().id)

    sample = clips.first()

    sample["foo"] = "bar"
    sample.frames.first()["hello"] = "world"
    sample.save()

    # Frame fields can be added by direct sample modification, and are saved
    print(clips)
    print(dataset)
    print(clips.count_values("foo"))
    print(clips.count_values("frames.hello"))
    print(dataset.count_values("frames.hello"))

    sample = clips.exclude_fields("frames.detections").first()
    sample.frames.first()["hello2"] = "world2"
    sample.save()

    # Excluded fields are not removed when saving clip samples
    print(clips)
    print(dataset)
    print(clips.count_values("frames.detections.detections.label"))
    print(clips.count_values("frames.hello2"))
    print(dataset.count_values("frames.detections.detections.label"))
    print(dataset.count_values("frames.hello2"))

    dataset.untag_samples("test")
    clips.reload()

    # Reloading a view syncs it with the source dataset
    print(dataset.count_sample_tags())
    print(clips.count_sample_tags())  # empty because labels were capitalized!


def test_to_frames():
    dataset = foz.load_zoo_dataset("quickstart-video").clone()

    dataset.tag_samples("test")

    frames = dataset.to_frames(sample_frames=True)

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
    print(frames.first().sample_id)
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


def test_to_clip_frames():
    dataset = foz.load_zoo_dataset("quickstart-video").clone()
    dataset.compute_metadata()

    dataset.tag_samples("test")

    clips = dataset.filter_labels(
        "frames.detections", F("label") == "person"
    ).to_clips("frames.detections")

    frames = clips.to_frames(sample_frames=True, fps=1)

    print("\nClips view")
    for filepath, support in zip(*clips.values(["filepath", "support"])):
        print("%s: %s" % (filepath, support))

    print("\nFrames view")
    for filepath, fn in zip(*frames.values(["filepath", "frame_number"])):
        print("%s: %s" % (filepath, fn))

    # Frames inherit sample tags
    print(dataset.count_sample_tags())
    print(frames.count_sample_tags())

    frames.tag_samples("clips")

    # Tagging frames has no effect on the source dataset
    print(frames.count_sample_tags())
    print(dataset.count_sample_tags())

    frames.untag_samples("clips")

    # Untagging clips has no effect on the source dataset
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

    view = frames.limit(10).set_field(
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
    print(frames.first().id)
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

    # Excluded fields are not removed when saving clip samples
    print(frames)
    print(dataset)
    print(frames.count_values("detections.detections.label"))
    print(frames.count_values("hello2"))
    print(dataset.count_values("frames.detections.detections.label"))
    print(dataset.count_values("frames.hello2"))

    dataset.untag_samples("test")
    frames.reload()

    # Reloading a view syncs it with the source dataset
    print(dataset.count_sample_tags())
    print(frames.count_sample_tags())  # empty because labels were capitalized!


def test_to_frame_patches():
    dataset = foz.load_zoo_dataset("quickstart-video").clone()

    dataset.tag_samples("test")

    frames = dataset.to_frames(sample_frames=True)
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
        "frames.predictions",
        gt_field="frames.detections",
        eval_key="eval",
    )

    try:
        patches = dataset.to_evaluation_patches("eval")
        assert False  # shouldn't get here
    except ValueError:
        pass

    frames = dataset.to_frames(sample_frames=True)
    patches = frames.to_evaluation_patches("eval")

    print(patches)
    print(patches.first())
    print(patches.count_values("type"))


def test_exact_frame_count():
    dataset = foz.load_zoo_dataset("quickstart-video").clone()
    dataset.limit(2).save()

    for smp in dataset:
        frame_count = fouv.exact_frame_count(smp.filepath)
        assert frame_count == len(smp.frames)


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    unittest.main(verbosity=2)
