"""
Tests for the :mod:`fiftyone.utils.labelbox` module.

You must run these tests interactively as follows::

    pytest tests/intensive/labelbox_tests.py -s -k <test_case>

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
from uuid import uuid4

import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone as fo
import fiftyone.zoo as foz
import fiftyone.utils.labelbox as foul


_anno_key = "anno_key"


def _image_dataset(dataset_name):
    dataset = foz.load_zoo_dataset(
        "quickstart",
        max_samples=3,
        dataset_name=dataset_name,
        drop_existing_dataset=True,
    )
    dataset.persistent = True
    return dataset


def _video_dataset(dataset_name):
    dataset = foz.load_zoo_dataset(
        "quickstart-video",
        max_samples=1,
        dataset_name=dataset_name,
        drop_existing_dataset=True,
    )
    dataset.persistent = True
    return dataset


def test_labelbox_image():
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

    _test_labelbox_image(dataset, label_field)


_image_dataset_name = "qs-lb-image"


def test_labelbox_launch_image_base():
    # Image dataset, single detections field

    dataset = _image_dataset(_image_dataset_name)

    label_schema = {
        "new_field": {
            "type": "detections",
            "classes": ["dog", "cat"],
            "attributes": {
                "test": {
                    "type": "checkbox",
                    "values": ["testattr", "testattr2"],
                }
            },
        }
    }

    results = dataset.annotate(
        _anno_key,
        label_schema=label_schema,
        backend="labelbox",
        launch_editor=True,
    )


def test_labelbox_load_image_base():
    dataset = fo.load_dataset(_image_dataset_name)
    dataset.load_annotations(_anno_key)


_image_instance_segs_dataset_name = "qs-lb-image-segs"


def test_labelbox_launch_image_instance_segs():
    # Image dataset, instance segmentations and classifications, attributes dict from doc

    dataset = _image_dataset(_image_instance_segs_dataset_name)

    label_schema = {
        "segs": {
            "type": "instances",
            "classes": ["c1", "c2"],
            "attributes": ["attr1", "attr2"],
        },
        "classifications": {
            "type": "classifications",
            "classes": ["ccc1", "ccc2", "ccc3"],
            "attributes": {
                "occluded": {
                    "type": "radio",
                    "values": [True, False],
                },
                "weather": {
                    "type": "select",
                    "values": ["cloudy", "sunny", "overcast"],
                },
                "caption": {
                    "type": "text",
                },
            },
        },
    }

    results = dataset.annotate(
        _anno_key,
        label_schema=label_schema,
        backend="labelbox",
        launch_editor=True,
    )


def test_labelbox_load_image_instance_segs():
    dataset = fo.load_dataset(_image_instance_segs_dataset_name)
    dataset.load_annotations(_anno_key, cleanup=True)


_image_polylines_dataset_name = "qs-lb-image-polylines"


def test_labelbox_launch_image_polylines():
    # Image dataset, polylines, classes_as_attrs, project_name

    dataset = _image_dataset(_image_polylines_dataset_name)

    attributes = {
        "radio": {
            "type": "radio",
            "values": [1, 2, 3],
        }
    }

    results = dataset.annotate(
        _anno_key,
        label_field="polylines",
        label_type="polylines",
        classes=["p0", "p1", "p2", "p3"],
        attributes=attributes,
        backend="labelbox",
        classes_as_attrs=False,
        project_name="proj_polylines",
        launch_editor=True,
    )


def test_labelbox_load_image_polylines():
    dataset = fo.load_dataset(_image_polylines_dataset_name)
    dataset.load_annotations(_anno_key, cleanup=True)


_video_dataset_name = "qs-lb-video"


def test_labelbox_launch_video_base():
    # Video dataset, doc example video label attributes

    dataset = _video_dataset(_video_dataset_name)

    attributes = {
        "type": {
            "type": "select",
            "values": ["sedan", "suv", "truck"],
            "mutable": False,
        },
        "occluded": {
            "type": "radio",
            "values": [True, False],
            "mutable": True,
        },
    }

    dataset.annotate(
        _anno_key,
        backend="labelbox",
        label_field="frames.new_field",
        label_type="detections",
        classes=["vehicle"],
        attributes=attributes,
    )


def test_labelbox_load_video_base():
    dataset = fo.load_dataset(_video_dataset_name)
    dataset.load_annotations(_anno_key, cleanup=True)


def test_labelbox_video_objects():
    # Video dataset with objects
    dataset = foz.load_zoo_dataset("quickstart-video", max_samples=10)

    frame_labels_field = ["detections"]

    _test_labelbox_video(dataset, frame_labels_field)


def test_labelbox_video_events():
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

    _test_labelbox_video(dataset, frame_labels_field)


def _test_labelbox_image(dataset, label_field):
    labelbox_export_path = "/tmp/labelbox-image-export.json"
    labelbox_import_path = "/tmp/labelbox-image-import.json"
    labelbox_id_field = "labelbox_id"

    # Generate fake Labelbox IDs, since we haven't actually uploaded there
    for sample in dataset:
        sample[labelbox_id_field] = str(uuid4())
        sample.save()

    # Export labels in Labelbox format
    foul.export_to_labelbox(
        dataset,
        labelbox_export_path,
        labelbox_id_field=labelbox_id_field,
        label_field=label_field,
    )

    # Convert to Labelbox import format
    foul.convert_labelbox_export_to_import(
        labelbox_export_path, labelbox_import_path
    )

    # Import labels from Labelbox
    foul.import_from_labelbox(
        dataset,
        labelbox_import_path,
        label_prefix="lb",
        labelbox_id_field=labelbox_id_field,
    )

    # Verify that we have two copies of the same labels
    session = fo.launch_app(dataset)
    session.wait()


def _test_labelbox_video(dataset, frame_labels_field):
    labelbox_export_dir = "/tmp/labelbox-video-export"
    labelbox_export_path = "/tmp/labelbox-video-export.json"
    labelbox_import_dir = "/tmp/labelbox-video-import"
    labelbox_import_path = "/tmp/labelbox-video-import.json"
    labelbox_id_field = "labelbox_id"

    etau.ensure_empty_dir(labelbox_export_dir, cleanup=True)
    etau.ensure_empty_dir(labelbox_import_dir, cleanup=True)

    # Generate fake Labelbox IDs, since we haven't actually uploaded there
    for sample in dataset:
        sample[labelbox_id_field] = str(uuid4())
        sample.save()

    # Export labels in Labelbox format
    foul.export_to_labelbox(
        dataset,
        labelbox_export_path,
        video_labels_dir=labelbox_export_dir,
        labelbox_id_field=labelbox_id_field,
        frame_labels_field=frame_labels_field,
    )

    # Convert to Labelbox import format
    foul.convert_labelbox_export_to_import(
        labelbox_export_path,
        outpath=labelbox_import_path,
        video_outdir=labelbox_import_dir,
    )

    # Import labels from Labelbox
    foul.import_from_labelbox(
        dataset,
        labelbox_import_path,
        label_prefix="lb",
        labelbox_id_field=labelbox_id_field,
    )

    # Verify that we have two copies of the same labels
    session = fo.launch_app(dataset)
    session.wait()


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    unittest.main(verbosity=2)
