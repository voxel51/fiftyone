"""
Tests for the :mod:`fiftyone.utils.scale` module.

You must run these tests interactively as follows::

    pytest tests/intensive/scale_tests.py -s -k <test_case>

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone as fo
import fiftyone.zoo as foz
import fiftyone.utils.scale as fous


def test_scale_image():
    # Image dataset
    dataset = foz.load_zoo_dataset(
        "bdd100k", split="validation", shuffle=True, max_samples=10
    )

    label_field = [
        "weather",
        "scene",
        "timeofday",
        "detections",
        "polylines",
    ]

    _test_scale_image(dataset, label_field)


def test_scale_video_objects():
    # Video dataset with objects
    dataset = foz.load_zoo_dataset("quickstart-video", max_samples=10)

    frame_labels_field = ["detections"]

    _test_scale_video(dataset, frame_labels_field)


def test_scale_video_events():
    # Download a video to work with
    filepath = "/tmp/road.mp4"
    etaw.download_google_drive_file(
        "1nWyKZyV6pG0hjY_gvBNShulsxLRlC6xg", path=filepath
    )

    # Video dataset with events
    dataset = fo.Dataset()

    events = [
        {"label": "sunny", "frames": [1, 10]},
        {"label": "cloudy", "frames": [11, 20]},
        {"label": "sunny", "frames": [21, 30]},
    ]

    sample = fo.Sample(filepath=filepath)

    for event in events:
        label = event["label"]
        frames = event["frames"]
        for frame_number in range(frames[0], frames[1] + 1):
            sample.frames[frame_number]["weather"] = fo.Classification(
                label=label
            )

    dataset.add_sample(sample)

    frame_labels_field = ["weather"]

    _test_scale_video(dataset, frame_labels_field)


def _test_scale_image(dataset, label_field):
    scale_export_path = "/tmp/scale-image-export.json"
    scale_import_path = "/tmp/scale-image-import.json"
    scale_id_field = "scale_id"

    # Export labels in Scale format
    fous.export_to_scale(
        dataset,
        scale_export_path,
        label_field=label_field,
    )

    # Convert to Scale import format
    id_map = fous.convert_scale_export_to_import(
        scale_export_path, scale_import_path
    )

    for sample_id, task_id in id_map.items():
        sample = dataset[sample_id]
        sample[scale_id_field] = task_id
        sample.save()

    # Import labels from Scale
    fous.import_from_scale(
        dataset,
        scale_import_path,
        label_prefix="scale",
        scale_id_field=scale_id_field,
    )

    # Verify that we have two copies of the same labels
    session = fo.launch_app(dataset)
    session.wait()


def _test_scale_video(dataset, frame_labels_field):
    scale_export_path = "/tmp/scale-video-export.json"
    scale_import_path = "/tmp/scale-video-import.json"

    scale_video_labels_dir = "/tmp/scale-video-labels"
    scale_video_events_dir = "/tmp/scale-video-events"

    scale_id_field = "scale_id"

    etau.ensure_empty_dir(scale_video_labels_dir, cleanup=True)
    etau.ensure_empty_dir(scale_video_events_dir, cleanup=True)

    # Export labels in Scale format
    fous.export_to_scale(
        dataset,
        scale_export_path,
        video_labels_dir=scale_video_labels_dir,
        video_events_dir=scale_video_events_dir,
        video_playback=True,  # try both `True` and `False` here
        frame_labels_field=frame_labels_field,
    )

    # Convert to Scale import format
    id_map = fous.convert_scale_export_to_import(
        scale_export_path, scale_import_path
    )

    for sample_id, task_id in id_map.items():
        sample = dataset[sample_id]
        sample[scale_id_field] = task_id
        sample.save()

    # Import labels from Scale
    fous.import_from_scale(
        dataset,
        scale_import_path,
        label_prefix="scale",
        scale_id_field=scale_id_field,
    )

    # Verify that we have two copies of the same labels
    session = fo.launch_app(dataset)
    session.wait()


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    unittest.main(verbosity=2)
