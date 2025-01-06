"""
Dataset import/export tests.

You must run these tests interactively as follows::

    pytest tests/intensive/import_export_tests.py -s -k <test_case>

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import random
import os

import numpy as np
import pytest

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.utils.image as foui
import fiftyone.brain as fob  # pylint: disable=import-error,no-name-in-module
import fiftyone.zoo as foz
from fiftyone import ViewField as F


@pytest.fixture
def basedir():
    with etau.TempDir() as tmpdir:
        print(tmpdir)
        yield tmpdir


@pytest.fixture
def img():
    return np.random.randint(255, size=(32, 32, 3), dtype=np.uint8)


@pytest.fixture
def multilabel_img():
    return np.random.randint(255, size=(720, 1280, 3), dtype=np.uint8)


def _make_classification_dataset(img, images_dir, num_samples=4):
    exts = [".jpg", ".png"]

    samples = []
    for idx in range(num_samples):
        filepath = os.path.join(
            images_dir, "%06d%s" % (idx, exts[idx % len(exts)])
        )
        foui.write(img, filepath)

        label = random.choice(["sun", "rain", "snow"])
        samples.append(
            fo.Sample(
                filepath=filepath, ground_truth=fo.Classification(label=label)
            )
        )

    dataset = fo.Dataset()
    dataset.add_samples(samples)
    return dataset


def _make_detection_dataset(
    img, images_dir, num_samples=4, num_objects_per_sample=3
):
    exts = [".jpg", ".png"]

    samples = []
    for idx in range(num_samples):
        filepath = os.path.join(
            images_dir, "%06d%s" % (idx, exts[idx % len(exts)])
        )
        foui.write(img, filepath)

        detections = []
        for _ in range(num_objects_per_sample):
            label = random.choice(["cat", "dog", "bird", "rabbit"])
            bounding_box = [
                0.8 * random.random(),
                0.8 * random.random(),
                0.2,
                0.2,
            ]
            detections.append(
                fo.Detection(label=label, bounding_box=bounding_box)
            )

        samples.append(
            fo.Sample(
                filepath=filepath,
                ground_truth=fo.Detections(detections=detections),
            )
        )

    dataset = fo.Dataset()
    dataset.add_samples(samples)
    return dataset


def _make_image_labels_dataset(
    img, images_dir, num_samples=4, num_objects_per_sample=3
):
    exts = [".jpg", ".png"]

    samples = []
    for idx in range(num_samples):
        filepath = os.path.join(
            images_dir, "%06d%s" % (idx, exts[idx % len(exts)])
        )
        foui.write(img, filepath)

        sample = fo.Sample(filepath=filepath)

        label = random.choice(["sun", "rain", "snow"])
        sample["gt_weather"] = fo.Classification(label=label)

        detections = []
        for _ in range(num_objects_per_sample):
            label = random.choice(["cat", "dog", "bird", "rabbit"])
            bounding_box = [
                0.8 * random.random(),
                0.8 * random.random(),
                0.2,
                0.2,
            ]
            detections.append(
                fo.Detection(label=label, bounding_box=bounding_box)
            )

        sample["gt_objects"] = fo.Detections(detections=detections)

        samples.append(sample)

    dataset = fo.Dataset()
    dataset.add_samples(samples)
    return dataset


def _make_labeled_dataset_with_no_labels(img, images_dir):
    filepath = os.path.join(images_dir, "test.png")
    foui.write(img, filepath)

    dataset = fo.Dataset()
    dataset.add_sample(fo.Sample(filepath=filepath))
    dataset.add_sample_field(
        "ground_truth", fo.EmbeddedDocumentField, embedded_doc_type=fo.Label
    )

    dataset.info = {
        # FiftyOneImageClassificationDataset
        # FiftyOneImageDetectionDataset
        "classes": ["cat", "dog"],
        # COCODetectionDataset
        "year": "5151",
        "version": "5151",
        "description": "Brian's Dataset",
        "contributor": "Brian Moore",
        "url": "https://github.com/brimoor",
        "date_created": "5151-51-51T51:51:51",
        "licenses": ["license1", "license2"],
        # CVATImageDataset
        "task_labels": [
            {
                "name": "cat",
                "attributes": [
                    {"name": "fluffy", "categories": ["yes", "no"]}
                ],
            },
            {
                "name": "dog",
                "attributes": [
                    {"name": "awesome", "categories": ["yes", "of course"]}
                ],
            },
        ],
    }
    dataset.save()

    return dataset


def _make_multilabel_dataset(img, images_dir):
    image_path = os.path.join(images_dir, "image.jpg")
    foui.write(img, image_path)

    sample = fo.Sample.from_dict(
        {
            "filepath": image_path,
            "tags": [],
            "metadata": {
                "_cls": "ImageMetadata",
                "size_bytes": 53219,
                "mime_type": "image/jpeg",
                "width": 1280,
                "height": 720,
                "num_channels": 3,
            },
            "gt_weather": {"_cls": "Classification", "label": "overcast"},
            "gt_scene": {"_cls": "Classification", "label": "city street"},
            "gt_timeofday": {"_cls": "Classification", "label": "daytime"},
            "gt_objs": {
                "_cls": "Detections",
                "detections": [
                    {
                        "_cls": "Detection",
                        "label": "traffic sign",
                        "bounding_box": [
                            0.7817958921875,
                            0.39165613194444443,
                            0.031193851562499986,
                            0.06238770138888894,
                        ],
                        "attributes": {
                            "occluded": {
                                "_cls": "BooleanAttribute",
                                "value": False,
                            },
                            "truncated": {
                                "_cls": "BooleanAttribute",
                                "value": False,
                            },
                            "trafficLightColor": {
                                "_cls": "CategoricalAttribute",
                                "value": "none",
                            },
                        },
                    }
                ],
            },
            "uniqueness": 0.5432120379367298,
        }
    )

    dataset = fo.Dataset()
    dataset.add_sample(sample)
    return dataset


def _run_custom_imports(
    sample_collection,
    export_dir,
    dataset_type,
    num_unlabeled=None,
    max_samples=None,
    **kwargs
):
    # Generate a temporary export
    sample_collection.export(
        export_dir=export_dir, dataset_type=dataset_type, **kwargs
    )

    # Test unlabeled sample handling when importing
    if num_unlabeled is not None:
        # Some formats require `include_all_data` in order to load unlabeled
        # samples. If the format doesn't support this flag, it will be ignored
        _dataset = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=dataset_type,
            include_all_data=True,
        )

        label_field = _dataset._get_label_fields()[0]

        num_samples = len(_dataset)
        num_labeled = len(_dataset.exists(label_field))

        assert num_samples == num_labeled + num_unlabeled

    # Test `shuffle` and `max_samples` when importing
    if max_samples is not None:
        _dataset = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=dataset_type,
            max_samples=max_samples,
            shuffle=True,
        )
        assert len(_dataset) == max_samples
        for s in _dataset:
            print(s.filepath)


def test_classification_datasets(basedir, img):
    # Create a classification dataset
    images_dir = os.path.join(basedir, "source-images")
    dataset = _make_classification_dataset(img, images_dir)

    # FiftyOneImageClassificationDataset
    export_dir = os.path.join(basedir, "fiftyone-image-classification")
    dataset_type = fo.types.FiftyOneImageClassificationDataset
    dataset.export(export_dir=export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=dataset_type
    )

    # ImageClassificationDirectoryTree
    export_dir = os.path.join(basedir, "image-classification-dir-tree")
    dataset_type = fo.types.ImageClassificationDirectoryTree
    dataset.export(export_dir=export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=dataset_type
    )

    # TFImageClassificationDataset
    export_dir = os.path.join(basedir, "tf-image-classification")
    dataset_type = fo.types.TFImageClassificationDataset
    tmp_dir = os.path.join(basedir, "tf-image-classification-tmp-images")
    dataset.export(
        export_dir=export_dir, dataset_type=dataset_type, num_shards=2
    )
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=dataset_type, images_dir=tmp_dir
    )

    # JSON
    json_path = os.path.join(basedir, "dataset.json")
    dataset.write_json(json_path, pretty_print=True)
    dataset2 = fo.Dataset.from_json(
        json_path, name=fo.get_default_dataset_name()
    )


def test_detection_datasets(basedir, img):
    # Create a detection dataset
    images_dir = os.path.join(basedir, "source-images")
    dataset = _make_detection_dataset(img, images_dir)

    # FiftyOneImageDetectionDataset
    export_dir = os.path.join(basedir, "fiftyone-image-detection")
    dataset_type = fo.types.FiftyOneImageDetectionDataset
    dataset.export(export_dir=export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=dataset_type
    )

    # COCODetectionDataset
    export_dir = os.path.join(basedir, "coco-detection")
    dataset_type = fo.types.COCODetectionDataset
    dataset.export(export_dir=export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=dataset_type
    )

    # VOCDetectionDataset
    export_dir = os.path.join(basedir, "voc-detection")
    dataset_type = fo.types.VOCDetectionDataset
    dataset.export(export_dir=export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=dataset_type
    )

    # KITTIDetectionDataset
    export_dir = os.path.join(basedir, "kitti-detection")
    dataset_type = fo.types.KITTIDetectionDataset
    dataset.export(export_dir=export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=dataset_type
    )

    # YOLOv4Dataset
    export_dir = os.path.join(basedir, "yolov4")
    dataset_type = fo.types.YOLOv4Dataset
    dataset.export(export_dir=export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=dataset_type
    )

    # YOLOv5Dataset
    export_dir = os.path.join(basedir, "yolov5")
    dataset_type = fo.types.YOLOv5Dataset
    dataset.export(export_dir=export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=dataset_type
    )

    # TFObjectDetectionDataset
    export_dir = os.path.join(basedir, "tf-object-detection")
    dataset_type = fo.types.TFObjectDetectionDataset
    tmp_dir = os.path.join(basedir, "tf-object-detection-tmp-images")
    dataset.export(
        export_dir=export_dir, dataset_type=dataset_type, num_shards=2
    )
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=dataset_type, images_dir=tmp_dir
    )

    # CVATImageDataset
    export_dir = os.path.join(basedir, "cvat-image")
    dataset_type = fo.types.CVATImageDataset
    dataset.export(export_dir=export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=dataset_type
    )

    # JSON
    json_path = os.path.join(basedir, "dataset.json")
    dataset.write_json(json_path, pretty_print=True)
    dataset2 = fo.Dataset.from_json(
        json_path, name=fo.get_default_dataset_name()
    )


def test_image_labels_datasets(basedir, img):
    # Create an image labels dataset
    images_dir = os.path.join(basedir, "source-images")
    dataset = _make_image_labels_dataset(img, images_dir)

    # FiftyOneImageLabelsDataset
    export_dir = os.path.join(basedir, "fiftyone-image-labels")
    dataset_type = fo.types.FiftyOneImageLabelsDataset
    dataset.export(export_dir=export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=dataset_type
    )

    # BDDDataset
    export_dir = os.path.join(basedir, "bdd")
    dataset_type = fo.types.BDDDataset
    dataset.export(export_dir=export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=dataset_type
    )

    # JSON
    json_path = os.path.join(basedir, "dataset.json")
    dataset.write_json(json_path, pretty_print=True)
    dataset2 = fo.Dataset.from_json(
        json_path, name=fo.get_default_dataset_name()
    )


def test_generic_sample_dataset(basedir, img):
    #
    # Classification dataset
    #

    images_dir = os.path.join(basedir, "source-images1")
    dataset = _make_classification_dataset(img, images_dir)

    # FiftyOneDataset
    export_dir = os.path.join(basedir, "fo-dataset1")
    dataset_type = fo.types.FiftyOneDataset
    dataset.export(export_dir=export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=dataset_type
    )

    #
    # Detection dataset
    #

    images_dir = os.path.join(basedir, "source-images2")
    dataset = _make_detection_dataset(img, images_dir)

    # FiftyOneDataset
    export_dir = os.path.join(basedir, "fo-dataset2")
    dataset_type = fo.types.FiftyOneDataset
    dataset.export(export_dir=export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=dataset_type
    )

    #
    # ImageLabels dataset
    #

    images_dir = os.path.join(basedir, "source-images3")
    dataset = _make_image_labels_dataset(img, images_dir)

    # FiftyOneDataset
    export_dir = os.path.join(basedir, "fo-dataset3")
    dataset_type = fo.types.FiftyOneDataset
    dataset.export(export_dir=export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=dataset_type
    )


def test_multilabel_dataset(basedir, multilabel_img):
    # Create a multilabel dataset
    images_dir = os.path.join(basedir, "source-images")
    dataset = _make_multilabel_dataset(multilabel_img, images_dir)

    # Multilabel BDDDataset
    export_dir = os.path.join(basedir, "bdd")
    dataset.export(
        export_dir=export_dir,
        dataset_type=fo.types.BDDDataset,
        label_field="gt_*",
    )
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir,
        dataset_type=fo.types.BDDDataset,
        label_field="gt",
    )

    # Multilabel FiftyOneImageLabelsDataset
    export_dir = os.path.join(basedir, "fo-image-labels")
    dataset.export(
        export_dir=export_dir,
        dataset_type=fo.types.FiftyOneImageLabelsDataset,
        label_field="gt_*",
    )
    dataset3 = fo.Dataset.from_dir(
        dataset_dir=export_dir,
        dataset_type=fo.types.FiftyOneImageLabelsDataset,
        label_field="gt",
    )


def test_rel_filepaths(basedir, img):
    # Create a classification dataset
    images_dir = os.path.join(basedir, "source-images")
    dataset = _make_classification_dataset(img, images_dir)

    # Test `Dataset.to_dict` with and without relative paths
    rel_dir = basedir
    d_abs = dataset.to_dict()
    d_rel = dataset.to_dict(rel_dir=rel_dir)
    for sd_abs, sd_rel in zip(d_abs["samples"], d_rel["samples"]):
        assert sd_abs["filepath"] == os.path.join(rel_dir, sd_rel["filepath"])

    # Test `Dataset.from_dict` with and without relative paths
    dataset1 = fo.Dataset.from_dict(d_abs, name=fo.get_default_dataset_name())
    dataset2 = fo.Dataset.from_dict(
        d_rel, name=fo.get_default_dataset_name(), rel_dir=rel_dir
    )
    for s_abs, s_rel in zip(dataset1, dataset2):
        assert s_abs.filepath == s_rel.filepath


def test_labeled_datasets_with_no_labels(basedir, img):
    # Create a classification dataset
    images_dir = os.path.join(basedir, "source-images")
    dataset = _make_labeled_dataset_with_no_labels(img, images_dir)

    # FiftyOneImageClassificationDataset
    export_dir = os.path.join(basedir, "FiftyOneImageClassificationDataset")
    dataset_type = fo.types.FiftyOneImageClassificationDataset
    dataset.export(
        export_dir=export_dir,
        dataset_type=dataset_type,
        label_field="ground_truth",
    )
    fo.Dataset.from_dir(dataset_dir=export_dir, dataset_type=dataset_type)

    # ImageClassificationDirectoryTree
    export_dir = os.path.join(basedir, "ImageClassificationDirectoryTree")
    dataset_type = fo.types.ImageClassificationDirectoryTree
    dataset.export(
        export_dir=export_dir,
        dataset_type=dataset_type,
        label_field="ground_truth",
    )
    fo.Dataset.from_dir(dataset_dir=export_dir, dataset_type=dataset_type)

    # TFImageClassificationDataset
    export_dir = os.path.join(basedir, "TFImageClassificationDataset")
    images_dir = os.path.join(
        basedir, "TFImageClassificationDataset/unpacked-images"
    )
    dataset_type = fo.types.TFImageClassificationDataset
    dataset.export(
        export_dir=export_dir,
        dataset_type=dataset_type,
        label_field="ground_truth",
    )
    fo.Dataset.from_dir(
        dataset_dir=export_dir,
        dataset_type=dataset_type,
        images_dir=images_dir,
    )

    # FiftyOneImageDetectionDataset
    export_dir = os.path.join(basedir, "FiftyOneImageDetectionDataset")
    dataset_type = fo.types.FiftyOneImageDetectionDataset
    dataset.export(
        export_dir=export_dir,
        dataset_type=dataset_type,
        label_field="ground_truth",
    )
    fo.Dataset.from_dir(dataset_dir=export_dir, dataset_type=dataset_type)

    # COCODetectionDataset
    export_dir = os.path.join(basedir, "COCODetectionDataset")
    dataset_type = fo.types.COCODetectionDataset
    dataset.export(
        export_dir=export_dir,
        dataset_type=dataset_type,
        label_field="ground_truth",
    )
    fo.Dataset.from_dir(dataset_dir=export_dir, dataset_type=dataset_type)

    # VOCDetectionDataset
    export_dir = os.path.join(basedir, "VOCDetectionDataset")
    dataset_type = fo.types.VOCDetectionDataset
    dataset.export(
        export_dir=export_dir,
        dataset_type=dataset_type,
        label_field="ground_truth",
    )
    fo.Dataset.from_dir(dataset_dir=export_dir, dataset_type=dataset_type)

    # KITTIDetectionDataset
    export_dir = os.path.join(basedir, "KITTIDetectionDataset")
    dataset_type = fo.types.KITTIDetectionDataset
    dataset.export(
        export_dir=export_dir,
        dataset_type=dataset_type,
        label_field="ground_truth",
    )
    fo.Dataset.from_dir(dataset_dir=export_dir, dataset_type=dataset_type)

    # YOLOv4Dataset
    export_dir = os.path.join(basedir, "YOLOv4Dataset")
    dataset_type = fo.types.YOLOv4Dataset
    dataset.export(
        export_dir=export_dir,
        dataset_type=dataset_type,
        label_field="ground_truth",
    )
    fo.Dataset.from_dir(dataset_dir=export_dir, dataset_type=dataset_type)

    # YOLOv5Dataset
    export_dir = os.path.join(basedir, "YOLOv5Dataset")
    dataset_type = fo.types.YOLOv5Dataset
    dataset.export(
        export_dir=export_dir,
        dataset_type=dataset_type,
        label_field="ground_truth",
    )
    fo.Dataset.from_dir(dataset_dir=export_dir, dataset_type=dataset_type)

    # TFObjectDetectionDataset
    export_dir = os.path.join(basedir, "TFObjectDetectionDataset")
    images_dir = os.path.join(
        basedir, "TFObjectDetectionDataset/unpacked-images"
    )
    dataset_type = fo.types.TFObjectDetectionDataset
    dataset.export(
        export_dir=export_dir,
        dataset_type=dataset_type,
        label_field="ground_truth",
    )
    fo.Dataset.from_dir(
        dataset_dir=export_dir,
        dataset_type=dataset_type,
        images_dir=images_dir,
    )

    # CVATImageDataset
    export_dir = os.path.join(basedir, "CVATImageDataset")
    dataset_type = fo.types.CVATImageDataset
    dataset.export(
        export_dir=export_dir,
        dataset_type=dataset_type,
        label_field="ground_truth",
    )
    fo.Dataset.from_dir(dataset_dir=export_dir, dataset_type=dataset_type)

    # FiftyOneImageLabelsDataset
    export_dir = os.path.join(basedir, "FiftyOneImageLabelsDataset")
    dataset_type = fo.types.FiftyOneImageLabelsDataset
    dataset.export(
        export_dir=export_dir,
        dataset_type=dataset_type,
        label_field="ground_truth",
    )
    fo.Dataset.from_dir(dataset_dir=export_dir, dataset_type=dataset_type)

    # BDDDataset
    export_dir = os.path.join(basedir, "BDDDataset")
    dataset_type = fo.types.BDDDataset
    dataset.export(
        export_dir=export_dir,
        dataset_type=dataset_type,
        label_field="ground_truth",
    )
    fo.Dataset.from_dir(dataset_dir=export_dir, dataset_type=dataset_type)

    # FiftyOneDataset
    export_dir = os.path.join(basedir, "FiftyOneDataset")
    dataset_type = fo.types.FiftyOneDataset
    dataset.export(export_dir=export_dir, dataset_type=dataset_type)
    fo.Dataset.from_dir(dataset_dir=export_dir, dataset_type=dataset_type)


def test_custom_unlabeled_image_dataset_imports(basedir):
    # Types of unlabeled image datasets to test
    dataset_types = [
        fo.types.ImageDirectory,
    ]

    # Load a small unlabeled image dataset
    udataset = foz.load_zoo_dataset(
        "cifar10",
        split="test",
        dataset_name="unlabeled-dataset",
        shuffle=True,
        max_samples=100,
    )
    udataset.delete_sample_field("ground_truth")

    # Test custom imports
    for dataset_type in dataset_types:
        print(dataset_type.__name__)
        export_dir = os.path.join(
            basedir, "custom-imports", dataset_type.__name__
        )
        _run_custom_imports(udataset, export_dir, dataset_type, max_samples=3)


def test_custom_classification_dataset_imports(basedir):
    # Types of classification datasets to test
    dataset_types = [
        fo.types.FiftyOneImageClassificationDataset,
        fo.types.ImageClassificationDirectoryTree,
        fo.types.TFImageClassificationDataset,
    ]

    # Load a small classification dataset
    cdataset = foz.load_zoo_dataset(
        "cifar10",
        split="test",
        dataset_name="classification-dataset",
        shuffle=True,
        max_samples=100,
    )

    # Remove labels from some samples
    for s in cdataset.take(10):
        s.ground_truth = None
        s.save()

    # Test custom imports
    for dataset_type in dataset_types:
        print(dataset_type.__name__)
        export_dir = os.path.join(
            basedir, "custom-imports", dataset_type.__name__
        )
        _run_custom_imports(
            cdataset, export_dir, dataset_type, num_unlabeled=10, max_samples=3
        )


def test_custom_detection_dataset_imports(basedir):
    # Types of detection datasets to test
    dataset_types = [
        fo.types.FiftyOneImageDetectionDataset,
        fo.types.COCODetectionDataset,
        fo.types.VOCDetectionDataset,
        fo.types.KITTIDetectionDataset,
        fo.types.YOLOv4Dataset,
        fo.types.YOLOv5Dataset,
        fo.types.TFObjectDetectionDataset,
        fo.types.CVATImageDataset,
    ]

    # Load a small detection dataset
    ddataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name="detection-dataset",
        shuffle=True,
        max_samples=20,
        num_workers=1,  # pytest crashes without this
    )

    # Remove labels from some samples
    for s in ddataset.take(10):
        s.ground_truth = None
        s.save()

    # Test custom imports
    for dataset_type in dataset_types:
        print(dataset_type.__name__)

        # COCODetectionDataset and TFObjectDetectionDataset formats cannot
        # distinguish between an unlabeled image and a labeled image with zero
        # detections
        num_unlabeled = 10
        if dataset_type in (
            fo.types.COCODetectionDataset,
            fo.types.TFObjectDetectionDataset,
        ):
            num_unlabeled = None

        export_dir = os.path.join(
            basedir, "custom-imports", dataset_type.__name__
        )
        _run_custom_imports(
            ddataset,
            export_dir,
            dataset_type,
            num_unlabeled=num_unlabeled,
            max_samples=3,
        )


def test_custom_multitask_image_dataset_imports(basedir):
    # Types of multitask datasets to test
    dataset_types = [
        fo.types.FiftyOneImageLabelsDataset,
        fo.types.BDDDataset,
    ]

    # Load a small multitask image dataset
    idataset = foz.load_zoo_dataset(
        "open-images-v6",
        split="validation",
        label_types=["classifications", "detections"],
        dataset_name="image-labels-dataset",
        shuffle=True,
        max_samples=100,
        num_workers=1,  # pytest crashes without this
    )

    # Remove labels from some samples
    for s in idataset.take(10):
        s.detections = None
        s.save()

    # Test custom imports
    for dataset_type in dataset_types:
        print(dataset_type.__name__)
        export_dir = os.path.join(
            basedir, "custom-imports", dataset_type.__name__
        )
        _run_custom_imports(
            idataset,
            export_dir,
            dataset_type,
            label_field=["positive_labels", "detections"],
            max_samples=3,
        )


def test_custom_generic_dataset_imports(basedir):
    # Types of generic datasets to test
    dataset_types = [
        fo.types.LegacyFiftyOneDataset,
        fo.types.FiftyOneDataset,
    ]

    # Load a small generic dataset
    gdataset = foz.load_zoo_dataset(
        "quickstart",
        dataset_name="generic-dataset",
        shuffle=True,
        max_samples=100,
    )

    for dataset_type in dataset_types:
        print(dataset_type.__name__)
        export_dir = os.path.join(
            basedir, "custom-imports", dataset_type.__name__
        )
        _run_custom_imports(gdataset, export_dir, dataset_type, max_samples=3)


def test_fiftyone_dataset_with_run_results(basedir):
    dataset = foz.load_zoo_dataset("quickstart").clone()

    dataset.evaluate_detections("predictions", eval_key="eval")
    fob.compute_visualization(dataset, brain_key="umap")

    export_dir = os.path.join(basedir, "fiftyone-dataset")

    dataset.export(
        export_dir=export_dir, dataset_type=fo.types.FiftyOneDataset
    )
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=fo.types.FiftyOneDataset
    )

    print(dataset)
    print(dataset.get_evaluation_info("eval"))
    print(dataset.get_brain_info("umap"))
    print(repr(dataset.load_evaluation_results("eval")))
    print(repr(dataset.load_brain_results("umap")))

    print(dataset2)
    print(dataset2.get_evaluation_info("eval"))
    print(dataset2.get_brain_info("umap"))
    print(repr(dataset2.load_evaluation_results("eval")))
    print(repr(dataset2.load_brain_results("umap")))


def test_fiftyone_dataset_with_filtered_video(basedir):
    dataset = foz.load_zoo_dataset("quickstart-video").clone()

    view = dataset.filter_labels("frames.detections", F("label") == "vehicle")

    export_dir = os.path.join(basedir, "fiftyone-dataset-video")

    view.export(export_dir=export_dir, dataset_type=fo.types.FiftyOneDataset)
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=fo.types.FiftyOneDataset
    )

    print(view)
    print(view.count_values("frames.detections.detections.label"))

    print(dataset2)
    print(dataset2.count_values("frames.detections.detections.label"))


def test_legacy_fiftyone_dataset_with_run_results(basedir):
    dataset = foz.load_zoo_dataset("quickstart").clone()

    dataset.evaluate_detections("predictions", eval_key="eval")
    fob.compute_visualization(dataset, brain_key="umap")

    export_dir = os.path.join(basedir, "legacy-fiftyone-dataset")

    dataset.export(
        export_dir=export_dir, dataset_type=fo.types.LegacyFiftyOneDataset
    )
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=fo.types.LegacyFiftyOneDataset
    )

    print(dataset)
    print(dataset.get_evaluation_info("eval"))
    print(dataset.get_brain_info("umap"))
    print(repr(dataset.load_evaluation_results("eval")))
    print(repr(dataset.load_brain_results("umap")))

    print(dataset2)
    print(dataset2.get_evaluation_info("eval"))
    print(dataset2.get_brain_info("umap"))
    print(repr(dataset2.load_evaluation_results("eval")))
    print(repr(dataset2.load_brain_results("umap")))


def test_legacy_fiftyone_dataset_with_filtered_video(basedir):
    dataset = foz.load_zoo_dataset("quickstart-video").clone()

    view = dataset.filter_labels("frames.detections", F("label") == "vehicle")

    export_dir = os.path.join(basedir, "legacy-fiftyone-dataset-video")

    view.export(
        export_dir=export_dir, dataset_type=fo.types.LegacyFiftyOneDataset
    )
    dataset2 = fo.Dataset.from_dir(
        dataset_dir=export_dir, dataset_type=fo.types.LegacyFiftyOneDataset
    )

    print(view)
    print(view.count_values("frames.detections.detections.label"))

    print(dataset2)
    print(dataset2.count_values("frames.detections.detections.label"))


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    pytest.main([__file__])
