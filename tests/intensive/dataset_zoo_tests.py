"""
Dataset zoo tests.

You must run these tests interactively as follows::

    pytest tests/intensive/dataset_zoo_tests.py -s -k <test_case>

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone import ViewField as F


def test_zoo_basic():
    print(foz.list_zoo_datasets())

    dataset = foz.load_zoo_dataset(
        "cifar10", split="test", drop_existing_dataset=True
    )
    print(dataset)

    view = dataset.take(5)
    for sample in view:
        label = sample.ground_truth.label
        print("%s: %s" % (label, sample.filepath))


def test_zoo_partial():
    dataset = foz.load_zoo_dataset(
        "cifar10", drop_existing_dataset=True, max_samples=5, shuffle=True
    )

    assert len(dataset) == 10
    assert len(dataset.match_tags("train")) == 5
    assert len(dataset.match_tags("test")) == 5


def test_coco_2017():
    dataset = foz.load_zoo_dataset(
        "coco-2017",
        splits=("test", "validation"),
        max_samples=5,
    )
    schema = dataset.get_field_schema()

    assert "ground_truth" in schema
    assert len(dataset) == 10
    assert len(dataset.match_tags("test")) == 5
    assert len(dataset.match_tags("validation")) == 5
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        splits=("test", "validation"),
        max_samples=5,
        label_field="gt",
    )
    schema = dataset.get_field_schema()

    assert "gt" in schema
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        splits=("test", "validation"),
        label_types=("detections", "segmentations"),
        max_samples=5,
    )
    schema = dataset.get_field_schema()

    assert "detections" in schema
    assert "segmentations" in schema
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        splits=("test", "validation"),
        label_types=("detections", "segmentations"),
        max_samples=5,
        label_field="gt",
    )
    schema = dataset.get_field_schema()

    assert "gt_detections" in schema
    assert "gt_segmentations" in schema
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        splits=("test", "validation"),
        label_types=("detections", "segmentations"),
        include_id=True,
        max_samples=5,
    )
    schema = dataset.get_field_schema()

    assert "detections" in schema
    assert "segmentations" in schema
    assert "coco_id" in schema
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        splits=("test", "validation"),
        label_types=[],
        max_samples=5,
    )
    schema = dataset.get_field_schema()

    assert "ground_truth" not in schema
    assert "detections" not in schema
    assert "coco_id" not in schema
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        label_types=["detections"],
        classes="person",
        max_samples=25,
    )

    assert len(dataset.count_values("ground_truth.detections.label")) > 1
    assert (
        len(
            dataset.match_labels(
                fields="ground_truth", filter=F("label") == "person"
            )
        )
        == 25
    )
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        classes="person",
        max_samples=25,
        only_matching=True,
    )

    assert len(dataset.count_values("ground_truth.detections.label")) == 1
    assert (
        len(
            dataset.match_labels(
                fields="ground_truth", filter=F("label") == "person"
            )
        )
        == 25
    )
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        label_types=["detections", "segmentations"],
        classes="person",
        max_samples=25,
    )

    assert (
        len(
            dataset.match_labels(
                fields="detections", filter=F("label") == "person"
            )
        )
        == 25
    )
    assert (
        len(
            dataset.match_labels(
                fields="segmentations", filter=F("label") == "person"
            )
        )
        == 25
    )
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        label_types="segmentations",
        classes="person",
        max_samples=25,
        use_polylines=True,
        include_id=True,
    )
    schema = dataset.get_field_schema()
    counts = dataset.count_values("segmentations.polylines.label")

    assert "segmentations" in schema
    assert "coco_id" in schema
    assert (
        len(
            dataset.match_labels(
                fields="segmentations", filter=F("label") == "person"
            )
        )
        == 25
    )
    assert "person" in counts
    assert counts["person"] >= 25
    dataset.delete()

    dataset = foz.load_zoo_dataset("coco-2017", split="validation")
    dataset.delete()


def test_open_images_v6():
    dataset = foz.load_zoo_dataset(
        "open-images-v6",
        split="validation",
        label_types=["segmentations"],
        max_samples=25,
    )

    assert len(dataset) == 25
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "open-images-v6",
        split="validation",
        label_types=[],
        label_field="oi_id",
        max_samples=5,
    )
    schema = dataset.get_field_schema()

    assert "oi_id" in schema
    assert "positive_labels" not in schema
    assert "negative_labels" not in schema
    assert "detections" not in schema
    assert "relationships" not in schema
    assert "segmentations" not in schema
    assert len(dataset) == 5
    assert len(dataset.match_tags("validation")) == 5
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "open-images-v6",
        split="validation",
        label_types=[],
        include_id=False,
        max_samples=5,
    )
    schema = dataset.get_field_schema()

    assert "ground_truth" not in schema
    assert "positive_labels" not in schema
    assert "negative_labels" not in schema
    assert "detections" not in schema
    assert "relationships" not in schema
    assert "segmentations" not in schema
    assert "open_images_id" not in schema
    assert len(dataset) == 5
    assert len(dataset.match_tags("validation")) == 5
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "open-images-v6",
        split="validation",
        label_types="detections",
        include_id=False,
        max_samples=5,
    )
    schema = dataset.get_field_schema()

    assert "ground_truth" in schema
    assert "open_images_id" not in schema
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "open-images-v6",
        split="validation",
        max_samples=5,
    )
    schema = dataset.get_field_schema()

    assert "positive_labels" in schema
    assert "negative_labels" in schema
    assert "detections" in schema
    assert "relationships" in schema
    assert "segmentations" in schema
    assert "open_images_id" in schema
    assert len(dataset) == 5
    assert len(dataset.match_tags("validation")) == 5
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "open-images-v6",
        split="validation",
        max_samples=5,
        label_field="gt",
    )
    schema = dataset.get_field_schema()

    assert "gt_positive_labels" in schema
    assert "gt_negative_labels" in schema
    assert "gt_detections" in schema
    assert "gt_relationships" in schema
    assert "gt_segmentations" in schema
    assert "gt_open_images_id" in schema
    assert len(dataset) == 5
    assert len(dataset.match_tags("validation")) == 5
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "open-images-v6",
        split="validation",
        label_types=["detections", "relationships"],
        classes=["Piano", "Fedora"],
        max_samples=50,
    )
    schema = dataset.get_field_schema()

    assert "detections" in schema
    assert "relationships" in schema
    assert "open_images_id" in schema
    assert (
        len(
            dataset.match_labels(
                filter=F("label").is_in(["Fedora", "Piano"]),
                fields="detections",
            )
        )
        == 50
    )
    assert len(dataset.count_values("detections.detections.label")) > 1
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "open-images-v6",
        split="validation",
        label_types=["detections", "relationships"],
        classes=["Piano", "Fedora"],
        only_matching=True,
        max_samples=50,
    )
    schema = dataset.get_field_schema()

    assert "detections" in schema
    assert "relationships" in schema
    assert "open_images_id" in schema
    assert (
        len(
            dataset.match_labels(
                filter=F("label").is_in(["Fedora", "Piano"]),
                fields="detections",
            )
        )
        == 50
    )
    assert len(dataset.count_values("detections.detections.label")) == 2
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "open-images-v6",
        split="validation",
        label_types=["detections", "relationships"],
        attrs="Plastic",
        max_samples=50,
    )
    schema = dataset.get_field_schema()

    assert "detections" in schema
    assert "relationships" in schema
    assert "open_images_id" in schema
    assert (
        len(
            dataset.match_labels(
                filter=(F("Label1") == "Plastic") | (F("Label2") == "Plastic"),
                fields="relationships",
            )
        )
        == 50
    )
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "open-images-v6",
        split="validation",
        label_types=["detections", "relationships"],
        attrs="Plastic",
        only_matching=True,
        max_samples=50,
    )
    schema = dataset.get_field_schema()

    assert "detections" in schema
    assert "relationships" in schema
    assert "open_images_id" in schema
    assert (
        len(
            dataset.match_labels(
                filter=(F("Label1") == "Plastic") | (F("Label2") == "Plastic"),
                fields="relationships",
            )
        )
        == 50
    )
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "open-images-v6",
        split="validation",
        label_types=["detections", "relationships"],
        classes=["Piano", "Fedora"],
        attrs="Plastic",
        max_samples=50,
    )
    schema = dataset.get_field_schema()

    assert "detections" in schema
    assert "relationships" in schema
    assert "open_images_id" in schema
    assert len(
        dataset.match_labels(
            filter=F("label").is_in(["Fedora", "Piano"]), fields="detections"
        )
    ) == len(dataset)
    assert len(
        dataset.match_labels(
            filter=(F("Label1") == "Plastic") | (F("Label2") == "Plastic"),
            fields="relationships",
        )
    ) == len(dataset)
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "open-images-v6",
        split="validation",
        classes="Violin",
        max_samples=25,
    )

    assert (
        len(
            dataset.match_labels(
                fields="detections", filter=F("label") == "Violin"
            )
        )
        == 25
    )
    dataset.delete()

    dataset = foz.load_zoo_dataset(
        "open-images-v6",
        split="validation",
        label_types=["detections", "segmentations"],
        classes="Violin",
        max_samples=25,
    )

    assert (
        len(
            dataset.match_labels(
                fields="detections", filter=F("label") == "Violin"
            )
        )
        == 25
    )
    dataset.delete()


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    unittest.main(verbosity=2)
