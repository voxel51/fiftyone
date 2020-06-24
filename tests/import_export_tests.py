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


@pytest.fixture
def basedir():
    with etau.TempDir() as tmpdir:
        print(tmpdir)
        yield tmpdir


@pytest.fixture
def img():
    return np.random.randint(255, size=(32, 32, 3), dtype=np.uint8)


def make_classification_dataset(name, img, images_dir, num_samples=4):
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
                filepath=filepath, ground_truth=fo.Classification(label=label),
            )
        )

    dataset = fo.Dataset(name)
    dataset.add_samples(samples)
    return dataset


def make_detection_dataset(
    name, img, images_dir, num_samples=4, num_objects_per_sample=3
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
                fo.Detection(label=label, bounding_box=bounding_box,)
            )

        samples.append(
            fo.Sample(
                filepath=filepath,
                ground_truth=fo.Detections(detections=detections),
            )
        )

    dataset = fo.Dataset(name)
    dataset.add_samples(samples)
    return dataset


def make_image_labels_dataset(
    name, img, images_dir, num_samples=4, num_objects_per_sample=3
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
                etao.DetectedObject(label=_label, bounding_box=_bounding_box,)
            )

        samples.append(
            fo.Sample(
                filepath=filepath,
                ground_truth=fo.ImageLabels(labels=image_labels),
            )
        )

    dataset = fo.Dataset(name)
    dataset.add_samples(samples)
    return dataset


def test_classification_datasets(basedir, img):
    # Create a classification dataset
    images_dir = os.path.join(basedir, "source-images")
    dataset = make_classification_dataset(
        "test-classification", img, images_dir
    )

    # ImageClassificationDataset
    export_dir = os.path.join(basedir, "image-classification")
    dataset_type = fo.types.ImageClassificationDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fod.Dataset.from_dir(export_dir, dataset_type)

    # ImageClassificationDirectoryTree
    export_dir = os.path.join(basedir, "image-classification-dir-tree")
    dataset_type = fo.types.ImageClassificationDirectoryTree
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fod.Dataset.from_dir(export_dir, dataset_type)

    # TFImageClassificationDataset
    export_dir = os.path.join(basedir, "tf-image-classification")
    dataset_type = fo.types.TFImageClassificationDataset
    tmp_dir = os.path.join(basedir, "tf-image-classification-tmp-images")
    dataset.export(export_dir, dataset_type=dataset_type, num_shards=2)
    dataset2 = fod.Dataset.from_dir(
        export_dir, dataset_type, images_dir=tmp_dir
    )

    # JSON
    json_path = os.path.join(basedir, "dataset.json")
    dataset.write_json(json_path, pretty_print=True)
    dataset2 = fod.Dataset.from_json(
        json_path, name=fod.get_default_dataset_name()
    )


def test_detection_datasets(basedir, img):
    # Create a detection dataset
    images_dir = os.path.join(basedir, "source-images")
    dataset = make_detection_dataset("test-detection", img, images_dir)

    # ImageDetectionDataset
    export_dir = os.path.join(basedir, "image-detection")
    dataset_type = fo.types.ImageDetectionDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fod.Dataset.from_dir(export_dir, dataset_type)

    # COCODetectionDataset
    export_dir = os.path.join(basedir, "coco-detection")
    dataset_type = fo.types.COCODetectionDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fod.Dataset.from_dir(export_dir, dataset_type)

    # VOCDetectionDataset
    export_dir = os.path.join(basedir, "voc-detection")
    dataset_type = fo.types.VOCDetectionDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fod.Dataset.from_dir(export_dir, dataset_type)

    # KITTIDetectionDataset
    export_dir = os.path.join(basedir, "kitti-detection")
    dataset_type = fo.types.KITTIDetectionDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fod.Dataset.from_dir(export_dir, dataset_type)

    # TFObjectDetectionDataset
    export_dir = os.path.join(basedir, "tf-object-detection")
    dataset_type = fo.types.TFObjectDetectionDataset
    tmp_dir = os.path.join(basedir, "tf-object-detection-tmp-images")
    dataset.export(export_dir, dataset_type=dataset_type, num_shards=2)
    dataset2 = fod.Dataset.from_dir(
        export_dir, dataset_type, images_dir=tmp_dir
    )

    # CVATImageDataset
    export_dir = os.path.join(basedir, "cvat-image")
    dataset_type = fo.types.CVATImageDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fod.Dataset.from_dir(export_dir, dataset_type)

    # JSON
    json_path = os.path.join(basedir, "dataset.json")
    dataset.write_json(json_path, pretty_print=True)
    dataset2 = fod.Dataset.from_json(
        json_path, name=fod.get_default_dataset_name()
    )


def test_image_labels_datasets(basedir, img):
    # Create an image labels dataset
    images_dir = os.path.join(basedir, "source-images")
    dataset = make_image_labels_dataset("test-image-labels", img, images_dir)

    # ImageLabelsDataset
    export_dir = os.path.join(basedir, "image-labels")
    dataset_type = fo.types.ImageLabelsDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fod.Dataset.from_dir(export_dir, dataset_type)

    # BDDDataset
    export_dir = os.path.join(basedir, "bdd")
    dataset_type = fo.types.BDDDataset
    dataset.export(export_dir, dataset_type=dataset_type)
    dataset2 = fod.Dataset.from_dir(export_dir, dataset_type)


if __name__ == "__main__":
    pytest.main([__file__])
