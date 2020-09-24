"""
Dataset import/export tests.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import random
import os

import numpy as np
import pytest

import eta.core.data as etad
import eta.core.geometry as etag
import eta.core.image as etai
import eta.core.objects as etao
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.utils.data as foud
import fiftyone.zoo as foz


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
        etai.write(img, filepath)

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
        etai.write(img, filepath)

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
        etai.write(img, filepath)

        image_labels = etai.ImageLabels()

        _label = random.choice(["sun", "rain", "snow"])
        image_labels.add_attribute(etad.CategoricalAttribute("label", _label))

        for _ in range(num_objects_per_sample):
            _label = random.choice(["cat", "dog", "bird", "rabbit"])
            _xtl = 0.8 * random.random()
            _ytl = 0.8 * random.random()
            _bounding_box = etag.BoundingBox.from_coords(
                _xtl, _ytl, _xtl + 0.2, _ytl + 0.2
            )
            image_labels.add_object(
                etao.DetectedObject(label=_label, bounding_box=_bounding_box)
            )

        samples.append(
            fo.Sample(
                filepath=filepath,
                ground_truth=fo.ImageLabels(labels=image_labels),
            )
        )

    dataset = fo.Dataset()
    dataset.add_samples(samples)
    return dataset


def _make_labeled_dataset_with_no_labels(img, images_dir):
    filepath = os.path.join(images_dir, "test.png")
    etai.write(img, filepath)

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
    etai.write(img, image_path)

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

    # Test `skip_unlabeled` when importing
    if num_unlabeled is not None:
        _dataset = fo.Dataset.from_dir(
            export_dir, dataset_type, skip_unlabeled=True
        )
        assert len(_dataset) == len(sample_collection) - num_unlabeled

    # Test `shuffle` and `max_samples` when importing
    if max_samples is not None:
        _dataset = fo.Dataset.from_dir(
            export_dir, dataset_type, shuffle=True, max_samples=max_samples
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
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(export_dir, dataset_type)

    # ImageClassificationDirectoryTree
    export_dir = os.path.join(basedir, "image-classification-dir-tree")
    dataset_type = fo.types.ImageClassificationDirectoryTree
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(export_dir, dataset_type)

    # TFImageClassificationDataset
    export_dir = os.path.join(basedir, "tf-image-classification")
    dataset_type = fo.types.TFImageClassificationDataset
    tmp_dir = os.path.join(basedir, "tf-image-classification-tmp-images")
    dataset.export(export_dir, dataset_type=dataset_type, num_shards=2)
    dataset2 = fo.Dataset.from_dir(
        export_dir, dataset_type, images_dir=tmp_dir
    )

    # JSON
    json_path = os.path.join(basedir, "dataset.json")
    dataset.write_json(json_path, pretty_print=True)
    dataset2 = fo.Dataset.from_json(
        json_path, name=fod.get_default_dataset_name()
    )


def test_detection_datasets(basedir, img):
    # Create a detection dataset
    images_dir = os.path.join(basedir, "source-images")
    dataset = _make_detection_dataset(img, images_dir)

    # FiftyOneImageDetectionDataset
    export_dir = os.path.join(basedir, "fiftyone-image-detection")
    dataset_type = fo.types.FiftyOneImageDetectionDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(export_dir, dataset_type)

    # COCODetectionDataset
    export_dir = os.path.join(basedir, "coco-detection")
    dataset_type = fo.types.COCODetectionDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(export_dir, dataset_type)

    # VOCDetectionDataset
    export_dir = os.path.join(basedir, "voc-detection")
    dataset_type = fo.types.VOCDetectionDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(export_dir, dataset_type)

    # KITTIDetectionDataset
    export_dir = os.path.join(basedir, "kitti-detection")
    dataset_type = fo.types.KITTIDetectionDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(export_dir, dataset_type)

    # TFObjectDetectionDataset
    export_dir = os.path.join(basedir, "tf-object-detection")
    dataset_type = fo.types.TFObjectDetectionDataset
    tmp_dir = os.path.join(basedir, "tf-object-detection-tmp-images")
    dataset.export(export_dir, dataset_type=dataset_type, num_shards=2)
    dataset2 = fo.Dataset.from_dir(
        export_dir, dataset_type, images_dir=tmp_dir
    )

    # CVATImageDataset
    export_dir = os.path.join(basedir, "cvat-image")
    dataset_type = fo.types.CVATImageDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(export_dir, dataset_type)

    # JSON
    json_path = os.path.join(basedir, "dataset.json")
    dataset.write_json(json_path, pretty_print=True)
    dataset2 = fo.Dataset.from_json(
        json_path, name=fod.get_default_dataset_name()
    )


def test_image_labels_datasets(basedir, img):
    # Create an image labels dataset
    images_dir = os.path.join(basedir, "source-images")
    dataset = _make_image_labels_dataset(img, images_dir)

    # FiftyOneImageLabelsDataset
    export_dir = os.path.join(basedir, "fiftyone-image-labels")
    dataset_type = fo.types.FiftyOneImageLabelsDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(export_dir, dataset_type)

    # BDDDataset
    export_dir = os.path.join(basedir, "bdd")
    dataset_type = fo.types.BDDDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(export_dir, dataset_type)

    # JSON
    json_path = os.path.join(basedir, "dataset.json")
    dataset.write_json(json_path, pretty_print=True)
    dataset2 = fo.Dataset.from_json(
        json_path, name=fod.get_default_dataset_name()
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
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(export_dir, dataset_type)

    #
    # Detection dataset
    #

    images_dir = os.path.join(basedir, "source-images2")
    dataset = _make_detection_dataset(img, images_dir)

    # FiftyOneDataset
    export_dir = os.path.join(basedir, "fo-dataset2")
    dataset_type = fo.types.FiftyOneDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(export_dir, dataset_type)

    #
    # ImageLabels dataset
    #

    images_dir = os.path.join(basedir, "source-images3")
    dataset = _make_image_labels_dataset(img, images_dir)

    # FiftyOneDataset
    export_dir = os.path.join(basedir, "fo-dataset3")
    dataset_type = fo.types.FiftyOneDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fo.Dataset.from_dir(export_dir, dataset_type)


def test_multilabel_dataset(basedir, multilabel_img):
    # Create a multilabel dataset
    images_dir = os.path.join(basedir, "source-images")
    dataset = _make_multilabel_dataset(multilabel_img, images_dir)

    # Test condense
    foud.condense_image_labels_field(dataset, "ground_truth", prefix="gt_")

    # Test expand
    foud.expand_image_labels_field(dataset, "ground_truth", prefix="gt_")

    # Multilabel BDDDataset
    export_dir = os.path.join(basedir, "bdd")
    dataset.export(
        export_dir=export_dir,
        dataset_type=fo.types.BDDDataset,
        label_prefix="gt_",
    )
    dataset2 = fo.Dataset.from_dir(
        export_dir, fo.types.BDDDataset, expand=True, prefix="gt_"
    )

    # Multilabel FiftyOneImageLabelsDataset
    export_dir = os.path.join(basedir, "fo-image-labels")
    dataset.export(
        export_dir=export_dir,
        dataset_type=fo.types.FiftyOneImageLabelsDataset,
        label_prefix="gt_",
    )
    dataset3 = fo.Dataset.from_dir(
        export_dir,
        fo.types.FiftyOneImageLabelsDataset,
        expand=True,
        prefix="gt_",
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
    dataset1 = fo.Dataset.from_dict(d_abs, name=fod.get_default_dataset_name())
    dataset2 = fo.Dataset.from_dict(
        d_rel, name=fod.get_default_dataset_name(), rel_dir=rel_dir
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
        export_dir, label_field="ground_truth", dataset_type=dataset_type
    )
    d1 = fo.Dataset.from_dir(export_dir, dataset_type)

    # ImageClassificationDirectoryTree
    export_dir = os.path.join(basedir, "ImageClassificationDirectoryTree")
    dataset_type = fo.types.ImageClassificationDirectoryTree
    dataset.export(
        export_dir, label_field="ground_truth", dataset_type=dataset_type
    )
    d2 = fo.Dataset.from_dir(export_dir, dataset_type)

    # TFImageClassificationDataset
    export_dir = os.path.join(basedir, "TFImageClassificationDataset")
    images_dir = os.path.join(
        basedir, "TFImageClassificationDataset/unpacked-images"
    )
    dataset_type = fo.types.TFImageClassificationDataset
    dataset.export(
        export_dir, label_field="ground_truth", dataset_type=dataset_type
    )
    d3 = fo.Dataset.from_dir(export_dir, dataset_type, images_dir=images_dir)

    # FiftyOneImageDetectionDataset
    export_dir = os.path.join(basedir, "FiftyOneImageDetectionDataset")
    dataset_type = fo.types.FiftyOneImageDetectionDataset
    dataset.export(
        export_dir, label_field="ground_truth", dataset_type=dataset_type
    )
    d4 = fo.Dataset.from_dir(export_dir, dataset_type)

    # COCODetectionDataset
    export_dir = os.path.join(basedir, "COCODetectionDataset")
    dataset_type = fo.types.COCODetectionDataset
    dataset.export(
        export_dir, label_field="ground_truth", dataset_type=dataset_type
    )
    d5 = fo.Dataset.from_dir(export_dir, dataset_type)

    # VOCDetectionDataset
    export_dir = os.path.join(basedir, "VOCDetectionDataset")
    dataset_type = fo.types.VOCDetectionDataset
    dataset.export(
        export_dir, label_field="ground_truth", dataset_type=dataset_type
    )
    d6 = fo.Dataset.from_dir(export_dir, dataset_type)

    # KITTIDetectionDataset
    export_dir = os.path.join(basedir, "KITTIDetectionDataset")
    dataset_type = fo.types.KITTIDetectionDataset
    dataset.export(
        export_dir, label_field="ground_truth", dataset_type=dataset_type
    )
    d7 = fo.Dataset.from_dir(export_dir, dataset_type)

    # TFObjectDetectionDataset
    export_dir = os.path.join(basedir, "TFObjectDetectionDataset")
    images_dir = os.path.join(
        basedir, "TFObjectDetectionDataset/unpacked-images"
    )
    dataset_type = fo.types.TFObjectDetectionDataset
    dataset.export(
        export_dir, label_field="ground_truth", dataset_type=dataset_type
    )
    d8 = fo.Dataset.from_dir(export_dir, dataset_type, images_dir=images_dir)

    # CVATImageDataset
    export_dir = os.path.join(basedir, "CVATImageDataset")
    dataset_type = fo.types.CVATImageDataset
    dataset.export(
        export_dir, label_field="ground_truth", dataset_type=dataset_type
    )
    d9 = fo.Dataset.from_dir(export_dir, dataset_type)

    # FiftyOneImageLabelsDataset
    export_dir = os.path.join(basedir, "FiftyOneImageLabelsDataset")
    dataset_type = fo.types.FiftyOneImageLabelsDataset
    dataset.export(
        export_dir, label_field="ground_truth", dataset_type=dataset_type
    )
    d10 = fo.Dataset.from_dir(export_dir, dataset_type)

    # BDDDataset
    export_dir = os.path.join(basedir, "BDDDataset")
    dataset_type = fo.types.BDDDataset
    dataset.export(
        export_dir, label_field="ground_truth", dataset_type=dataset_type
    )
    d11 = fo.Dataset.from_dir(export_dir, dataset_type)

    # FiftyOneDataset
    export_dir = os.path.join(basedir, "FiftyOneDataset")
    dataset_type = fo.types.FiftyOneDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    d12 = fo.Dataset.from_dir(export_dir, dataset_type)


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

    # Remove labeles from some samples
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
        fo.types.TFObjectDetectionDataset,
        fo.types.CVATImageDataset,
    ]

    # Load a small detection dataset
    ddataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name="detection-dataset",
        shuffle=True,
        max_samples=100,
    )

    # Remove labeles from some samples
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
        "coco-2017",
        split="validation",
        dataset_name="image-labels-dataset",
        shuffle=True,
        max_samples=100,
    )

    # Remove labeles from some samples
    for s in idataset.take(10):
        s.ground_truth = None
        s.save()

    # Test custom imports
    for dataset_type in dataset_types:
        print(dataset_type.__name__)
        export_dir = os.path.join(
            basedir, "custom-imports", dataset_type.__name__
        )
        _run_custom_imports(
            idataset, export_dir, dataset_type, max_samples=3, label_prefix="",
        )


def test_custom_generic_dataset_imports(basedir):
    # Types of generic datasets to test
    dataset_types = [
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


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    pytest.main([__file__])
