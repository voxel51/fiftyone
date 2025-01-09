"""
FiftyOne import/export-related unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import pathlib
import random
import string
import tempfile
import unittest

import cv2
import numpy as np
import pytest

import eta.core.utils as etau
import eta.core.video as etav

import fiftyone as fo
import fiftyone.utils.coco as fouc
import fiftyone.utils.image as foui
import fiftyone.utils.labels as foul
import fiftyone.utils.yolo as fouy
from fiftyone import ViewField as F

from decorators import drop_datasets

skipwindows = pytest.mark.skipif(
    os.name == "nt", reason="Windows hangs in workflows, fix me"
)


class ImageDatasetTests(unittest.TestCase):
    def setUp(self):
        temp_dir = etau.TempDir()
        root_dir = temp_dir.__enter__()
        ref_image_path = os.path.join(root_dir, "_ref_image.jpg")
        images_dir = os.path.join(root_dir, "_images")

        img = np.random.randint(255, size=(480, 640, 3), dtype=np.uint8)
        foui.write(img, ref_image_path)

        self.root_dir = root_dir
        self.images_dir = images_dir

        self._temp_dir = temp_dir
        self._ref_image_path = ref_image_path

    def tearDown(self):
        self._temp_dir.__exit__()

    def _new_image(self, name=None):
        if name is None:
            name = self._new_name()

        filepath = os.path.join(
            self.images_dir,
            name + os.path.splitext(self._ref_image_path)[1],
        )

        etau.copy_file(self._ref_image_path, filepath)
        return filepath

    def _new_name(self):
        return "".join(
            random.choice(string.ascii_lowercase + string.digits)
            for _ in range(24)
        )

    def _new_dir(self):
        return os.path.join(self.root_dir, self._new_name())


class DuplicateImageExportTests(ImageDatasetTests):
    @skipwindows
    @drop_datasets
    def test_duplicate_images(self):
        sample = fo.Sample(
            filepath=self._new_image(),
            cls=fo.Classification(label="sunny"),
            det=fo.Detections(
                detections=[
                    fo.Detection(label="cat", bounding_box=[0, 0, 1, 1])
                ]
            ),
        )

        # This dataset contains two samples with the same `filepath`
        dataset = fo.Dataset()
        dataset.add_samples([sample, sample])

        export_dir = self._new_dir()

        #
        # In general, duplicate copies of the same images are NOT created
        #

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.ImageDirectory,
            overwrite=True,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir, dataset_type=fo.types.ImageDirectory
        )

        # We didn't create a duplicate image during export, so there's only
        # one image to import here
        self.assertEqual(len(dataset2), 1)

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
            overwrite=True,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir, dataset_type=fo.types.FiftyOneDataset
        )

        self.assertEqual(len(dataset2), 2)

        # Use COCODetectionDataset as a representative for other labeled image
        # dataset types

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            overwrite=True,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir, dataset_type=fo.types.COCODetectionDataset
        )

        self.assertEqual(len(dataset2), 2)

        #
        # The one exception is labeled dataset types where the location of the
        # exported media encodes the label (what if the same image has
        # different labels in different samples). In this case, duplicate
        # images ARE exported
        #
        #

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.ImageClassificationDirectoryTree,
            overwrite=True,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.ImageClassificationDirectoryTree,
        )

        self.assertEqual(len(dataset2), 2)


class ImageExportCoersionTests(ImageDatasetTests):
    @drop_datasets
    def test_field_inference(self):
        sample = fo.Sample(
            filepath=self._new_image(),
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                    ),
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.5, 0.5, 0.4, 0.4],
                    ),
                ]
            ),
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        #
        # A field of appropriate type is inferred
        #

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
        )

        #
        # Multiple compatible field types exist, but the first one is still
        # chosen and used
        #

        dataset.clone_sample_field("ground_truth", "predictions")

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
        )

    @drop_datasets
    def test_patch_exports(self):
        sample = fo.Sample(
            filepath=self._new_image(),
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                    ),
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.5, 0.5, 0.4, 0.4],
                    ),
                ]
            ),
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        #
        # No label field is provided; only images are exported
        #

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.ImageDirectory,
        )

        #
        # A detections field is provided, so the object patches are exported as
        # a directory of images
        #

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.ImageDirectory,
            label_field="ground_truth",
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.ImageDirectory,
        )

        self.assertEqual(
            len(dataset2), dataset.count("ground_truth.detections")
        )

        #
        # A detections field is provided, so the object patches are exported as
        # an image classification directory tree
        #

        export_dir3 = self._new_dir()

        dataset.export(
            export_dir=export_dir3,
            dataset_type=fo.types.ImageClassificationDirectoryTree,
            label_field="ground_truth",
        )

        dataset3 = fo.Dataset.from_dir(
            dataset_dir=export_dir3,
            dataset_type=fo.types.ImageClassificationDirectoryTree,
        )

        self.assertEqual(
            len(dataset3), dataset.count("ground_truth.detections")
        )

        #
        # A patches view is provided, so object patches are exported as images
        #

        export_dir4 = self._new_dir()

        patches = dataset.to_patches("ground_truth")
        patches.export(
            export_dir=export_dir4,
            dataset_type=fo.types.ImageDirectory,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir4,
            dataset_type=fo.types.ImageDirectory,
        )

        self.assertEqual(
            len(dataset2), dataset.count("ground_truth.detections")
        )

        #
        # A patches view is provided, so the object patches are exported as an
        # image classification directory tree
        #

        export_dir5 = self._new_dir()

        patches = dataset.to_patches("ground_truth")
        patches.export(
            export_dir=export_dir5,
            dataset_type=fo.types.ImageClassificationDirectoryTree,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir5,
            dataset_type=fo.types.ImageClassificationDirectoryTree,
        )

        self.assertEqual(
            len(dataset2), dataset.count("ground_truth.detections")
        )

    @drop_datasets
    def test_single_label_to_lists(self):
        sample = fo.Sample(
            filepath=self._new_image(),
            ground_truth=fo.Detection(
                label="cat",
                bounding_box=[0.1, 0.1, 0.4, 0.4],
            ),
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        #
        # The `ground_truth` field has type `Detection`, but COCO format
        # expects `Detections`, so the labels are automatically coerced to
        # single-label lists
        #

        export_dir4 = self._new_dir()

        dataset.export(
            export_dir=export_dir4,
            dataset_type=fo.types.COCODetectionDataset,
            label_field="ground_truth",
        )

    @drop_datasets
    def test_classification_as_detections(self):
        sample = fo.Sample(
            filepath=self._new_image(),
            animal=fo.Classification(label="cat"),
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        #
        # The `animal` field is exported as detections that span entire images
        #

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            label_field="animal",
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            label_types="detections",
            label_field="animal",
        )

        bounding_box = dataset2.first().animal.detections[0].bounding_box
        self.assertTrue(np.allclose(bounding_box, [0, 0, 1, 1]))


class ImageNestedLabelsTests(ImageDatasetTests):
    @drop_datasets
    def test_nested_label_fields(self):
        sample = fo.Sample(
            filepath=self._new_image(),
            dynamic=fo.DynamicEmbeddedDocument(
                ground_truth=fo.Detections(
                    detections=[
                        fo.Detection(
                            label="cat",
                            bounding_box=[0.1, 0.1, 0.4, 0.4],
                        ),
                        fo.Detection(
                            label="dog",
                            bounding_box=[0.5, 0.5, 0.4, 0.4],
                        ),
                    ]
                )
            ),
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample, dynamic=True)

        #
        # The nested label field should be automatically inferred
        #

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            label_types="detections",
            label_field="ground_truth",
        )

        self.assertEqual(
            dataset.count("dynamic.ground_truth.detections"),
            dataset2.count("ground_truth.detections"),
        )


class UnlabeledImageDatasetTests(ImageDatasetTests):
    def _make_dataset(self):
        samples = [fo.Sample(filepath=self._new_image()) for _ in range(5)]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        return dataset

    @drop_datasets
    def test_image_directory(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.ImageDirectory,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.ImageDirectory,
        )

        self.assertEqual(len(dataset), len(dataset2))

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.ImageDirectory,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.ImageDirectory,
        )

        self.assertEqual(len(dataset), len(dataset2))

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # _images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 2)


class ImageClassificationDatasetTests(ImageDatasetTests):
    def _make_dataset(self):
        samples = [
            fo.Sample(
                filepath=self._new_image(),
                predictions=fo.Classification(label="cat", confidence=0.9),
            ),
            fo.Sample(
                filepath=self._new_image(),
                predictions=fo.Classification(label="dog", confidence=0.95),
            ),
            fo.Sample(filepath=self._new_image()),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        return dataset

    @drop_datasets
    def test_fiftyone_image_classification_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions"), dataset2.count("predictions")
        )

        # Include confidence

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
            include_confidence=True,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
            label_field="predictions",
        )

        confs = dataset.values("predictions.confidence", missing_value=-1)
        confs2 = dataset2.values("predictions.confidence", missing_value=-1)

        self.assertEqual(len(dataset), len(dataset2))

        # sorting is necessary because sample order is arbitrary
        self.assertTrue(np.allclose(sorted(confs), sorted(confs2)))

        # Labels-only

        data_path = self.images_dir
        labels_path = os.path.join(self._new_dir(), "labels.json")

        dataset.export(
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
            labels_path=labels_path,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
            data_path=data_path,
            labels_path=labels_path,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")),
            set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("predictions"),
            dataset2.count("predictions"),
        )

        # Labels-only (absolute paths)

        labels_path = os.path.join(self._new_dir(), "labels.json")

        dataset.export(
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
            labels_path=labels_path,
            abs_paths=True,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
            labels_path=labels_path,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")),
            set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("predictions"),
            dataset2.count("predictions"),
        )

        # Standard format (with rel dir)

        data_path = "images"
        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            data_path=data_path,
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            data_path=data_path,
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions"), dataset2.count("predictions")
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # data/_images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)

        # Labels-only (with rel dir)

        labels_path = os.path.join(self._new_dir(), "labels.json")
        rel_dir = self.root_dir

        dataset.export(
            labels_path=labels_path,
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            data_path=rel_dir,
            labels_path=labels_path,
            dataset_type=fo.types.FiftyOneImageClassificationDataset,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions"), dataset2.count("predictions")
        )

        relpath = _relpath(dataset2.first().filepath, rel_dir)

        # _images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 2)

    @drop_datasets
    def test_image_classification_directory_tree(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.ImageClassificationDirectoryTree,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.ImageClassificationDirectoryTree,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions"), dataset2.count("predictions")
        )

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.ImageClassificationDirectoryTree,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.ImageClassificationDirectoryTree,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions"), dataset2.count("predictions")
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # <class>/_images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)

    @drop_datasets
    def test_tf_image_classification_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()
        images_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.TFImageClassificationDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.TFImageClassificationDataset,
            images_dir=images_dir,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions"), dataset2.count("predictions")
        )

        # Direct records path w/ sharding

        tf_records_path = os.path.join(self._new_dir(), "tf.records")
        tf_records_patt = tf_records_path + "-*-of-*"
        images_dir = self._new_dir()

        dataset.export(
            dataset_type=fo.types.TFImageClassificationDataset,
            tf_records_path=tf_records_path,
            num_shards=2,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.TFImageClassificationDataset,
            tf_records_path=tf_records_patt,
            images_dir=images_dir,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions"), dataset2.count("predictions")
        )


class ImageChannelsDatasetTests(ImageDatasetTests):
    def _make_dataset(self):
        samples = [
            fo.Sample(
                filepath=self._new_image(),
                predictions=fo.Classification(label="cat", confidence=0.9),
            ),
            fo.Sample(
                filepath=self._new_image(),
                predictions=fo.Classification(label="dog", confidence=0.95),
            ),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        return dataset

    @skipwindows
    @drop_datasets
    def test_tf_image_classification_channels(self):
        orig_dataset = self._make_dataset()

        # Export grayscale images

        export_dir1 = self._new_dir()

        for idx, sample in enumerate(orig_dataset, 1):
            label = sample.predictions.label
            outpath = os.path.join(export_dir1, label, "%06d.png" % idx)

            # pylint: disable=no-member
            img = foui.read(sample.filepath, flag=cv2.IMREAD_GRAYSCALE)
            foui.write(img, outpath)

        gray_dataset1 = fo.Dataset.from_dir(
            dataset_dir=export_dir1,
            dataset_type=fo.types.ImageClassificationDirectoryTree,
        )
        gray_dataset1.compute_metadata()
        self.assertEqual(gray_dataset1.first().metadata.num_channels, 1)

        export_dir2 = self._new_dir()

        # Export grayscale
        gray_dataset1.export(
            export_dir=export_dir2,
            dataset_type=fo.types.TFImageClassificationDataset,
            overwrite=True,
        )

        # Import grayscale
        gray_dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir2,
            dataset_type=fo.types.TFImageClassificationDataset,
            images_dir=os.path.join(export_dir2, "images-gray"),
        )
        gray_dataset2.compute_metadata()
        self.assertEqual(gray_dataset2.first().metadata.num_channels, 1)

        # Force RGB at import-time
        rgb_dataset1 = fo.Dataset.from_dir(
            dataset_dir=export_dir2,
            dataset_type=fo.types.TFImageClassificationDataset,
            images_dir=os.path.join(export_dir2, "images-rgb"),
            force_rgb=True,
        )
        rgb_dataset1.compute_metadata()
        self.assertEqual(rgb_dataset1.first().metadata.num_channels, 3)

        export_dir3 = self._new_dir()

        # Force RGB at export-time
        gray_dataset1.export(
            export_dir=export_dir3,
            dataset_type=fo.types.TFImageClassificationDataset,
            force_rgb=True,
        )

        # Import RGB
        rgb_dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir3,
            dataset_type=fo.types.TFImageClassificationDataset,
            images_dir=os.path.join(export_dir3, "images"),
        )
        rgb_dataset2.compute_metadata()
        self.assertEqual(rgb_dataset2.first().metadata.num_channels, 3)


class ImageDetectionDatasetTests(ImageDatasetTests):
    def _make_dataset(self):
        samples = [
            fo.Sample(
                filepath=self._new_image(),
                predictions=fo.Detections(
                    detections=[
                        fo.Detection(
                            label="cat",
                            bounding_box=[0.1, 0.1, 0.4, 0.4],
                        ),
                        fo.Detection(
                            label="dog",
                            bounding_box=[0.5, 0.5, 0.4, 0.4],
                        ),
                    ]
                ),
            ),
            fo.Sample(
                filepath=self._new_image(),
                predictions=fo.Detections(
                    detections=[
                        fo.Detection(
                            label="cat",
                            bounding_box=[0.1, 0.1, 0.4, 0.4],
                            confidence=0.9,
                            age=51,
                            cute=True,
                            mood="surly",
                        ),
                        fo.Detection(
                            label="dog",
                            bounding_box=[0.5, 0.5, 0.4, 0.4],
                            confidence=0.95,
                            age=52,
                            cute=False,
                            mood="derpy",
                        ),
                    ]
                ),
            ),
            fo.Sample(filepath=self._new_image()),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        return dataset

    @drop_datasets
    def test_fiftyone_image_detection_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneImageDetectionDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneImageDetectionDataset,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )
        self.assertEqual(
            dataset.distinct("predictions.detections.confidence"),
            dataset2.distinct("predictions.detections.confidence"),
        )
        self.assertEqual(
            dataset.distinct("predictions.detections.age"),
            dataset2.distinct("predictions.detections.age"),
        )
        self.assertEqual(
            dataset.distinct("predictions.detections.cute"),
            dataset2.distinct("predictions.detections.cute"),
        )
        self.assertEqual(
            dataset.distinct("predictions.detections.mood"),
            dataset2.distinct("predictions.detections.mood"),
        )

        # Labels-only

        data_path = self.images_dir
        labels_path = os.path.join(self._new_dir(), "labels.json")

        dataset.export(
            dataset_type=fo.types.FiftyOneImageDetectionDataset,
            labels_path=labels_path,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.FiftyOneImageDetectionDataset,
            data_path=data_path,
            labels_path=labels_path,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")),
            set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        # Labels-only (absolute paths)

        labels_path = os.path.join(self._new_dir(), "labels.json")

        dataset.export(
            dataset_type=fo.types.FiftyOneImageDetectionDataset,
            labels_path=labels_path,
            abs_paths=True,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.FiftyOneImageDetectionDataset,
            labels_path=labels_path,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")),
            set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        # Standard format (with rel dir)

        data_path = "images"
        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            data_path=data_path,
            dataset_type=fo.types.FiftyOneImageDetectionDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            data_path=data_path,
            dataset_type=fo.types.FiftyOneImageDetectionDataset,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # data/_images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)

        # Labels-only (with rel dir)

        labels_path = os.path.join(self._new_dir(), "labels.json")
        rel_dir = self.root_dir

        dataset.export(
            labels_path=labels_path,
            dataset_type=fo.types.FiftyOneImageDetectionDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            data_path=rel_dir,
            labels_path=labels_path,
            dataset_type=fo.types.FiftyOneImageDetectionDataset,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        relpath = _relpath(dataset2.first().filepath, rel_dir)

        # _images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 2)

    @drop_datasets
    def test_tf_object_detection_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()
        images_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.TFObjectDetectionDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.TFObjectDetectionDataset,
            images_dir=images_dir,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        # Direct records path w/ sharding

        tf_records_path = os.path.join(self._new_dir(), "tf.records")
        tf_records_patt = tf_records_path + "-*-of-*"
        images_dir = self._new_dir()

        dataset.export(
            dataset_type=fo.types.TFObjectDetectionDataset,
            tf_records_path=tf_records_path,
            num_shards=2,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.TFObjectDetectionDataset,
            tf_records_path=tf_records_patt,
            images_dir=images_dir,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

    @drop_datasets
    def test_coco_detection_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            label_types="detections",
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )
        self.assertEqual(
            dataset.distinct("predictions.detections.confidence"),
            dataset2.distinct("predictions.detections.confidence"),
        )
        self.assertEqual(
            dataset.distinct("predictions.detections.age"),
            dataset2.distinct("predictions.detections.age"),
        )
        self.assertEqual(
            dataset.distinct("predictions.detections.cute"),
            dataset2.distinct("predictions.detections.cute"),
        )
        self.assertEqual(
            dataset.distinct("predictions.detections.mood"),
            dataset2.distinct("predictions.detections.mood"),
        )

        schema = dataset2.get_field_schema(flat=True)

        # Dynamic attributes aren't declared on import by default
        self.assertNotIn("predictions.detections.age", schema)
        self.assertNotIn("predictions.detections.cute", schema)
        self.assertNotIn("predictions.detections.mood", schema)

        # Declare dynamic attributes on re-import

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            label_types="detections",
            label_field="predictions",
            dynamic=True,
        )

        schema = dataset2.get_field_schema(flat=True)

        self.assertIn("predictions.detections.age", schema)
        self.assertIn("predictions.detections.cute", schema)
        self.assertIn("predictions.detections.mood", schema)

        # Omit extra attributes

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            extra_attrs=False,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            label_types="detections",
            label_field="predictions",
        )

        self.assertEqual(dataset2.distinct("predictions.detections.age"), [])
        self.assertEqual(dataset2.distinct("predictions.detections.cute"), [])
        self.assertEqual(dataset2.distinct("predictions.detections.mood"), [])

        # Labels-only

        data_path = self.images_dir
        labels_path = os.path.join(self._new_dir(), "labels.json")

        dataset.export(
            dataset_type=fo.types.COCODetectionDataset,
            labels_path=labels_path,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.COCODetectionDataset,
            data_path=data_path,
            labels_path=labels_path,
            label_types="detections",
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")),
            set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        # Labels-only (absolute paths)

        labels_path = os.path.join(self._new_dir(), "labels.json")

        dataset.export(
            dataset_type=fo.types.COCODetectionDataset,
            labels_path=labels_path,
            abs_paths=True,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.COCODetectionDataset,
            labels_path=labels_path,
            label_types="detections",
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")),
            set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            label_types="detections",
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # data/_images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)

        # Non-sequential categories

        export_dir = self._new_dir()

        categories = [
            {"supercategory": "animal", "id": 10, "name": "cat"},
            {"supercategory": "vehicle", "id": 20, "name": "dog"},
        ]

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            categories=categories,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            label_types="detections",
            label_field="predictions",
        )
        categories2 = dataset2.info["categories"]

        self.assertSetEqual(
            {c["id"] for c in categories},
            {c["id"] for c in categories2},
        )

        # Alphabetized 1-based categories by default

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            label_types="detections",
            label_field="predictions",
        )
        categories2 = dataset2.info["categories"]

        self.assertListEqual([c["id"] for c in categories2], [1, 2])
        self.assertListEqual([c["name"] for c in categories2], ["cat", "dog"])

        # Only load matching classes

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            label_types="detections",
            label_field="predictions",
            classes="cat",
            only_matching=False,
        )

        self.assertEqual(len(dataset2), 2)
        self.assertListEqual(
            dataset2.distinct("predictions.detections.label"),
            ["cat", "dog"],
        )

        dataset3 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            label_types="detections",
            label_field="predictions",
            classes="cat",
            only_matching=True,
        )

        self.assertEqual(len(dataset3), 2)
        self.assertListEqual(
            dataset3.distinct("predictions.detections.label"),
            ["cat"],
        )

    @drop_datasets
    def test_voc_detection_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        view = dataset.limit(2)
        view.export(
            export_dir=export_dir,
            dataset_type=fo.types.VOCDetectionDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.VOCDetectionDataset,
            label_field="predictions",
        )

        self.assertEqual(len(view), len(dataset2))
        self.assertEqual(
            view.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )
        self.assertEqual(
            view.distinct("predictions.detections.age"),
            dataset2.distinct("predictions.detections.age"),
        )
        self.assertEqual(
            view.distinct("predictions.detections.cute"),
            dataset2.distinct("predictions.detections.cute"),
        )
        self.assertEqual(
            view.distinct("predictions.detections.mood"),
            dataset2.distinct("predictions.detections.mood"),
        )

        # Handle unlabeled data

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.VOCDetectionDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.VOCDetectionDataset,
            label_field="predictions",
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))

        # Labels-only

        data_path = self.images_dir
        labels_path = os.path.join(self._new_dir(), "labels.xml")

        dataset.export(
            dataset_type=fo.types.VOCDetectionDataset,
            labels_path=labels_path,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.VOCDetectionDataset,
            data_path=data_path,
            labels_path=labels_path,
            label_field="predictions",
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")),
            set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.VOCDetectionDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.VOCDetectionDataset,
            label_field="predictions",
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # data/_images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)

    @drop_datasets
    def test_kitti_detection_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        view = dataset.limit(2)
        view.export(
            export_dir=export_dir,
            dataset_type=fo.types.KITTIDetectionDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.KITTIDetectionDataset,
            label_field="predictions",
        )

        self.assertEqual(len(view), len(dataset2))
        self.assertEqual(
            view.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )
        self.assertEqual(
            view.distinct("predictions.detections.confidence"),
            dataset2.distinct("predictions.detections.confidence"),
        )

        # Handle unlabeled data

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.KITTIDetectionDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.KITTIDetectionDataset,
            label_field="predictions",
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))

        # Labels-only

        data_path = self.images_dir
        labels_path = os.path.join(self._new_dir(), "labels/")

        dataset.export(
            labels_path=labels_path,
            dataset_type=fo.types.KITTIDetectionDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            data_path=data_path,
            labels_path=labels_path,
            dataset_type=fo.types.KITTIDetectionDataset,
            label_field="predictions",
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")),
            set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.KITTIDetectionDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.KITTIDetectionDataset,
            label_field="predictions",
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # data/_images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)

    @drop_datasets
    def test_yolov4_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.YOLOv4Dataset,
            label_field="predictions",
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.YOLOv4Dataset,
            label_field="predictions",
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        # Include confidence

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.YOLOv4Dataset,
            label_field="predictions",
            include_confidence=True,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.YOLOv4Dataset,
            label_field="predictions",
            include_all_data=True,
        )

        bounds = dataset.bounds("predictions.detections.confidence")
        bounds2 = dataset2.bounds("predictions.detections.confidence")
        self.assertAlmostEqual(bounds[0], bounds2[0])
        self.assertAlmostEqual(bounds[1], bounds2[1])

        # Labels-only

        data_path = os.path.dirname(dataset.first().filepath)
        labels_path = os.path.join(self._new_dir(), "labels/")

        dataset.export(
            dataset_type=fo.types.YOLOv4Dataset,
            labels_path=labels_path,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.YOLOv4Dataset,
            data_path=data_path,
            labels_path=labels_path,
            label_field="predictions",
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        for sample in dataset2:
            self.assertTrue(os.path.isfile(sample.filepath))

        # Standard format

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.YOLOv4Dataset,
            rel_dir=rel_dir,
            label_field="predictions",
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.YOLOv4Dataset,
            label_field="predictions",
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # images/_images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)

    @drop_datasets
    def test_yolov5_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.YOLOv5Dataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.YOLOv5Dataset,
            label_field="predictions",
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        # Include confidence

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.YOLOv5Dataset,
            include_confidence=True,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.YOLOv5Dataset,
            label_field="predictions",
        )

        bounds = dataset.bounds("predictions.detections.confidence")
        bounds2 = dataset2.bounds("predictions.detections.confidence")
        self.assertAlmostEqual(bounds[0], bounds2[0])
        self.assertAlmostEqual(bounds[1], bounds2[1])

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.YOLOv5Dataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.YOLOv5Dataset,
            label_field="predictions",
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # images/<split>/_images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 4)

    @drop_datasets
    def test_add_yolo_labels(self):
        dataset = self._make_dataset()
        classes = dataset.distinct("predictions.detections.label")

        export_dir = self._new_dir()
        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.YOLOv5Dataset,
        )
        yolo_labels_path = os.path.join(export_dir, "labels", "val")

        # Standard

        fouy.add_yolo_labels(dataset, "yolo", yolo_labels_path, classes)
        self.assertEqual(
            dataset.count_values("predictions.detections.label"),
            dataset.count_values("yolo.detections.label"),
        )
        self.assertEqual(1, len(dataset) - len(dataset.exists("yolo")))

        # Include missing

        fouy.add_yolo_labels(
            dataset,
            "yolo_inclusive",
            yolo_labels_path,
            classes,
            include_missing=True,
        )
        self.assertEqual(
            dataset.count_values("predictions.detections.label"),
            dataset.count_values("yolo_inclusive.detections.label"),
        )
        self.assertEqual(len(dataset), len(dataset.exists("yolo_inclusive")))

    @skipwindows
    @drop_datasets
    def test_add_coco_labels(self):
        dataset = self._make_dataset()

        classes = dataset.distinct("predictions.detections.label")
        categories = [{"id": i, "name": l} for i, l in enumerate(classes, 1)]

        export_dir = self._new_dir()
        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
            categories=categories,
        )
        coco_labels_path = os.path.join(export_dir, "labels.json")

        fouc.add_coco_labels(dataset, "coco", coco_labels_path, categories)
        self.assertEqual(
            dataset.count_values("predictions.detections.label"),
            dataset.count_values("coco.detections.label"),
        )


class ImageSegmentationDatasetTests(ImageDatasetTests):
    def _make_dataset(self):
        mask1 = np.zeros((128, 128), dtype=np.uint8)
        mask1[32:96, 32:96] = 255

        mask2 = 255 * np.ones((128, 128), dtype=np.uint8)
        mask2[32:96, 32:96] = 0

        instance1 = np.zeros((32, 32), dtype=bool)
        instance1[8:24, 8:24] = True

        instance2 = np.ones((32, 32), dtype=bool)
        instance2[8:24, 8:24] = False

        samples = [
            fo.Sample(
                filepath=self._new_image(),
                segmentations=fo.Segmentation(mask=mask1),
                detections=fo.Detections(
                    detections=[
                        fo.Detection(
                            label="cat",
                            bounding_box=[0.1, 0.1, 0.4, 0.4],
                            mask=instance1,
                        ),
                        fo.Detection(
                            label="dog",
                            bounding_box=[0.5, 0.5, 0.4, 0.4],
                            mask=instance2,
                        ),
                    ]
                ),
                polylines=fo.Polylines(
                    polylines=[
                        fo.Polyline(
                            label="cat",
                            points=[
                                [
                                    (0.1, 0.1),
                                    (0.5, 0.1),
                                    (0.5, 0.5),
                                    (0.1, 0.5),
                                ]
                            ],
                            filled=True,
                        ),
                        fo.Polyline(
                            label="dog",
                            points=[
                                [
                                    (0.5, 0.5),
                                    (0.9, 0.5),
                                    (0.9, 0.9),
                                    (0.5, 0.9),
                                ]
                            ],
                            filled=True,
                        ),
                    ]
                ),
            ),
            fo.Sample(
                filepath=self._new_image(),
                segmentations=fo.Segmentation(mask=mask2),
                detections=fo.Detections(
                    detections=[
                        fo.Detection(
                            label="cat",
                            bounding_box=[0.1, 0.1, 0.4, 0.4],
                            mask=instance2,
                        ),
                        fo.Detection(
                            label="dog",
                            bounding_box=[0.5, 0.5, 0.4, 0.4],
                            mask=instance1,
                        ),
                    ]
                ),
                polylines=fo.Polylines(
                    polylines=[
                        fo.Polyline(
                            label="cat",
                            points=[
                                [
                                    (0.1, 0.1),
                                    (0.5, 0.1),
                                    (0.5, 0.5),
                                    (0.1, 0.5),
                                ]
                            ],
                            filled=True,
                        ),
                        fo.Polyline(
                            label="dog",
                            points=[
                                [
                                    (0.5, 0.5),
                                    (0.9, 0.5),
                                    (0.9, 0.9),
                                    (0.5, 0.9),
                                ]
                            ],
                            filled=True,
                        ),
                    ]
                ),
            ),
            fo.Sample(filepath=self._new_image()),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        return dataset

    @drop_datasets
    def test_image_segmentation_directory(self):
        dataset = self._make_dataset()

        # Segmentations

        export_dir = self._new_dir()

        view = dataset.limit(2)
        view.export(
            export_dir=export_dir,
            dataset_type=fo.types.ImageSegmentationDirectory,
            label_field="segmentations",
        )

        # Default: masks stay on disk
        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.ImageSegmentationDirectory,
            label_field="segmentations",
        )

        self.assertEqual(len(view), len(dataset2))
        self.assertEqual(
            view.count("segmentations.mask"),
            dataset2.count("segmentations.mask_path"),
        )

        # Load masks into memory
        dataset3 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.ImageSegmentationDirectory,
            label_field="segmentations",
            load_masks=True,
        )

        self.assertEqual(len(view), len(dataset3))
        self.assertEqual(
            view.count("segmentations.mask"),
            dataset3.count("segmentations.mask"),
        )

        # Detections

        export_dir = self._new_dir()

        view = dataset.limit(2)
        view.export(
            export_dir=export_dir,
            dataset_type=fo.types.ImageSegmentationDirectory,
            label_field="detections",
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.ImageSegmentationDirectory,
            label_field="segmentations",
        )

        self.assertEqual(len(view), len(dataset2))
        self.assertEqual(
            len(view.exists("detections")),
            len(dataset2.exists("segmentations")),
        )

        # Polylines

        export_dir = self._new_dir()

        view = dataset.limit(2)
        view.export(
            export_dir=export_dir,
            dataset_type=fo.types.ImageSegmentationDirectory,
            label_field="polylines",
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.ImageSegmentationDirectory,
            label_field="segmentations",
        )

        self.assertEqual(len(view), len(dataset2))
        self.assertEqual(
            len(view.exists("polylines")),
            len(dataset2.exists("segmentations")),
        )

        # Labels-only

        data_path = self.images_dir
        labels_path = os.path.join(self._new_dir(), "labels/")

        dataset.export(
            dataset_type=fo.types.ImageSegmentationDirectory,
            labels_path=labels_path,
            label_field="segmentations",
        )

        # Default: masks stay on disk
        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.ImageSegmentationDirectory,
            data_path=data_path,
            labels_path=labels_path,
            label_field="segmentations",
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")),
            set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("segmentations.mask"),
            dataset2.count("segmentations.mask_path"),
        )

        # Load masks into memory
        dataset3 = fo.Dataset.from_dir(
            dataset_type=fo.types.ImageSegmentationDirectory,
            data_path=data_path,
            labels_path=labels_path,
            label_field="segmentations",
            load_masks=True,
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset3))
        self.assertSetEqual(
            set(dataset.values("filepath")),
            set(dataset3.values("filepath")),
        )
        self.assertEqual(
            dataset.count("segmentations.mask"),
            dataset3.count("segmentations.mask"),
        )

        # Segmentations (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.ImageSegmentationDirectory,
            rel_dir=rel_dir,
            label_field="segmentations",
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.ImageSegmentationDirectory,
            label_field="segmentations",
            load_masks=True,
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("segmentations.mask"),
            dataset2.count("segmentations.mask"),
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # data/_images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)

    @drop_datasets
    def test_image_segmentation_fiftyone_dataset(self):
        self._test_image_segmentation_fiftyone_dataset(
            fo.types.FiftyOneDataset
        )

    @drop_datasets
    def test_image_segmentation_legacy_fiftyone_dataset(self):
        self._test_image_segmentation_fiftyone_dataset(
            fo.types.LegacyFiftyOneDataset
        )

    def _test_image_segmentation_fiftyone_dataset(self, dataset_type):
        dataset = self._make_dataset()

        # In-database segmentations

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=dataset_type,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=dataset_type,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(dataset.count("segmentations.mask_path"), 0)
        self.assertEqual(dataset2.count("segmentations.mask_path"), 0)
        self.assertEqual(
            dataset.count("segmentations.mask"),
            dataset2.count("segmentations.mask"),
        )

        # Convert to on-disk segmentations

        segmentations_dir = self._new_dir()

        foul.export_segmentations(dataset, "segmentations", segmentations_dir)
        self.assertEqual(dataset.count("segmentations.mask"), 0)
        for mask_path in dataset.values("segmentations.mask_path"):
            if mask_path is not None:
                self.assertTrue(mask_path.startswith(segmentations_dir))

        # On-disk segmentations

        export_dir = self._new_dir()
        field_dir = os.path.join(export_dir, "fields", "segmentations")

        dataset.export(
            export_dir=export_dir,
            dataset_type=dataset_type,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=dataset_type,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(dataset2.count("segmentations.mask"), 0)
        self.assertEqual(
            dataset.count("segmentations.mask_path"),
            dataset2.count("segmentations.mask_path"),
        )

        for mask_path in dataset2.values("segmentations.mask_path"):
            if mask_path is not None:
                self.assertTrue(mask_path.startswith(field_dir))

        # On-disk segmentations (don't export media)

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=dataset_type,
            export_media=False,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=dataset_type,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertListEqual(
            dataset.values("filepath"),
            dataset2.values("filepath"),
        )
        self.assertListEqual(
            dataset.values("segmentations.mask_path"),
            dataset2.values("segmentations.mask_path"),
        )

    @drop_datasets
    def test_instance_segmentation_fiftyone_dataset(self):
        self._test_instance_segmentation_fiftyone_dataset(
            fo.types.FiftyOneDataset
        )

    @drop_datasets
    def test_instance_segmentation_legacy_fiftyone_dataset(self):
        self._test_instance_segmentation_fiftyone_dataset(
            fo.types.LegacyFiftyOneDataset
        )

    def _test_instance_segmentation_fiftyone_dataset(self, dataset_type):
        dataset = self._make_dataset()

        # In-database instance segmentations

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=dataset_type,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=dataset_type,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(dataset.count("detections.detections.mask_path"), 0)
        self.assertEqual(dataset2.count("detections.detections.mask_path"), 0)
        self.assertEqual(
            dataset.count("detections.detections.mask"),
            dataset2.count("detections.detections.mask"),
        )

        # Convert to on-disk instance segmentations

        segmentations_dir = self._new_dir()

        foul.export_segmentations(dataset, "detections", segmentations_dir)

        self.assertEqual(dataset.count("detections.detections.mask"), 0)
        for mask_path in dataset.values("detections.detections[].mask_path"):
            if mask_path is not None:
                self.assertTrue(mask_path.startswith(segmentations_dir))

        # On-disk instance segmentations

        export_dir = self._new_dir()
        field_dir = os.path.join(export_dir, "fields", "detections.detections")

        dataset.export(
            export_dir=export_dir,
            dataset_type=dataset_type,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=dataset_type,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(dataset2.count("detections.detections.mask"), 0)
        self.assertEqual(
            dataset.count("detections.detections.mask_path"),
            dataset2.count("detections.detections.mask_path"),
        )

        for mask_path in dataset2.values("detections.detections[].mask_path"):
            if mask_path is not None:
                self.assertTrue(mask_path.startswith(field_dir))

        # On-disk instance segmentations (don't export media)

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=dataset_type,
            export_media=False,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=dataset_type,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertListEqual(
            dataset.values("filepath"),
            dataset2.values("filepath"),
        )
        self.assertListEqual(
            dataset.values("detections.detections[].mask_path"),
            dataset2.values("detections.detections[].mask_path"),
        )

        # Convert to in-database instance segmentations

        foul.import_segmentations(dataset2, "detections")

        self.assertEqual(dataset2.count("detections.detections.mask_path"), 0)
        self.assertEqual(
            dataset2.count("detections.detections.mask"),
            dataset.count("detections.detections.mask_path"),
        )


class DICOMDatasetTests(ImageDatasetTests):
    def _get_dcm_path(self):
        import pydicom  # pylint: disable=unused-import
        from pydicom.data import get_testdata_file

        return get_testdata_file("MR_small.dcm")

    @drop_datasets
    def test_dicom_dataset(self):
        dataset_dir = self._new_dir()
        images_dir = self._new_dir()

        ref_path = self._get_dcm_path()
        dicom_path = os.path.join(dataset_dir, "test.dcm")
        etau.copy_file(ref_path, dicom_path)

        # Standard format

        dataset = fo.Dataset.from_dir(
            dataset_dir=dataset_dir,
            images_dir=images_dir,
            dataset_type=fo.types.DICOMDataset,
        )

        self.assertEqual(len(dataset), 1)
        self.assertIn("PatientName", dataset.get_field_schema())

        # Direct path, specific keywords

        dataset2 = fo.Dataset.from_dir(
            dicom_path=dicom_path,
            images_dir=images_dir,
            dataset_type=fo.types.DICOMDataset,
            keywords=["PatientName"],
        )

        self.assertEqual(len(dataset2), 1)
        self.assertIn("PatientName", dataset2.get_field_schema())


class CSVDatasetTests(ImageDatasetTests):
    def _make_dataset(self):
        samples = [
            fo.Sample(
                filepath=self._new_image(),
                tags=["foo", "bar"],
                float_field=1.0,
                weather=fo.Classification(label="sunny"),
            ),
            fo.Sample(
                filepath=self._new_image(),
                tags=["spam", "eggs"],
                float_field=2.0,
                weather=fo.Classification(label="sunny"),
            ),
            fo.Sample(filepath=self._new_image()),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        return dataset

    @drop_datasets
    def test_csv_dataset(self):
        dataset = self._make_dataset()

        export_fields = {
            "filepath": "filepath",
            "tags": "tags",
            "float_field": "float_field",
            "weather.label": "weather",
        }

        import_fields = {
            "filepath": None,  # load as strings
            "tags": lambda v: v.strip("").split(","),
            "float_field": lambda v: float(v),
            "weather": lambda v: fo.Classification(label=v) if v else None,
        }

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.CSVDataset,
            fields=export_fields,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.CSVDataset,
            fields=import_fields,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(os.path.basename(f) for f in dataset.values("filepath")),
            set(os.path.basename(f) for f in dataset2.values("filepath")),
        )
        self.assertSetEqual(
            set(dataset.values("tags", unwind=True)),
            set(dataset2.values("tags", unwind=True)),
        )
        self.assertTrue(
            np.isclose(
                dataset.bounds("float_field"),
                dataset2.bounds("float_field"),
            ).all()
        )
        self.assertSetEqual(
            set(dataset.values("weather.label")),
            set(dataset2.values("weather.label")),
        )

        # Labels-only

        data_path = self.images_dir
        labels_path = os.path.join(self._new_dir(), "labels.csv")

        dataset.export(
            labels_path=labels_path,
            dataset_type=fo.types.CSVDataset,
            fields=export_fields,
        )

        dataset2 = fo.Dataset.from_dir(
            data_path=data_path,
            labels_path=labels_path,
            dataset_type=fo.types.CSVDataset,
            fields=import_fields,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(os.path.basename(f) for f in dataset.values("filepath")),
            set(os.path.basename(f) for f in dataset2.values("filepath")),
        )
        self.assertSetEqual(
            set(dataset.values("tags", unwind=True)),
            set(dataset2.values("tags", unwind=True)),
        )
        self.assertTrue(
            np.isclose(
                dataset.bounds("float_field"),
                dataset2.bounds("float_field"),
            ).all()
        )
        self.assertSetEqual(
            set(dataset.values("weather.label")),
            set(dataset2.values("weather.label")),
        )

        # Labels-only (absolute paths)

        labels_path = os.path.join(self._new_dir(), "labels.csv")

        dataset.export(
            labels_path=labels_path,
            dataset_type=fo.types.CSVDataset,
            fields=export_fields,
            abs_paths=True,
        )

        dataset2 = fo.Dataset.from_dir(
            labels_path=labels_path,
            dataset_type=fo.types.CSVDataset,
            fields=import_fields,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")), set(dataset2.values("filepath"))
        )
        self.assertSetEqual(
            set(dataset.values("tags", unwind=True)),
            set(dataset2.values("tags", unwind=True)),
        )
        self.assertTrue(
            np.isclose(
                dataset.bounds("float_field"),
                dataset2.bounds("float_field"),
            ).all()
        )
        self.assertSetEqual(
            set(dataset.values("weather.label")),
            set(dataset2.values("weather.label")),
        )

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.CSVDataset,
            rel_dir=rel_dir,
            fields=export_fields,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.CSVDataset,
            fields=import_fields,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(os.path.basename(f) for f in dataset.values("filepath")),
            set(os.path.basename(f) for f in dataset2.values("filepath")),
        )
        self.assertSetEqual(
            set(dataset.values("tags", unwind=True)),
            set(dataset2.values("tags", unwind=True)),
        )
        self.assertTrue(
            np.isclose(
                dataset.bounds("float_field"),
                dataset2.bounds("float_field"),
            ).all()
        )
        self.assertSetEqual(
            set(dataset.values("weather.label")),
            set(dataset2.values("weather.label")),
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # data/_images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)


class GeoLocationDatasetTests(ImageDatasetTests):
    def _make_dataset(self):
        samples = [
            fo.Sample(
                filepath=self._new_image(),
                coordinates=fo.GeoLocation(
                    point=[-73.77615468583421, 40.76392586346787],
                ),
                weather=fo.Classification(label="sunny"),
            ),
            fo.Sample(
                filepath=self._new_image(),
                coordinates=fo.GeoLocation(
                    point=[-74.00767702771716, 40.72345200411182],
                ),
                weather=fo.Classification(label="cloudy"),
            ),
            # @todo test with missing data; this currently may fail since
            # `add_samples()` does not graefully handle expanding the schema
            # to handle None-valued fields
            # fo.Sample(filepath=self._new_image()),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        return dataset

    @drop_datasets
    def test_geojson_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        def maker(label):
            return label.label if label is not None else None

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.GeoJSONDataset,
            property_makers={"weather": maker},
        )

        def parser(value):
            return (
                fo.Classification(label=value) if value is not None else None
            )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.GeoJSONDataset,
            location_field="coordinates",
            property_parsers={"weather": parser},
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("coordinates"), dataset2.count("coordinates")
        )
        self.assertEqual(dataset.count("weather"), dataset2.count("weather"))

        # Labels-only

        data_path = self.images_dir
        labels_path = os.path.join(self._new_dir(), "labels.json")

        dataset.export(
            labels_path=labels_path,
            dataset_type=fo.types.GeoJSONDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            data_path=data_path,
            labels_path=labels_path,
            dataset_type=fo.types.GeoJSONDataset,
            location_field="coordinates",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")),
            set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("coordinates"), dataset2.count("coordinates")
        )

        # Labels-only (absolute paths)

        labels_path = os.path.join(self._new_dir(), "labels.json")

        dataset.export(
            labels_path=labels_path,
            dataset_type=fo.types.GeoJSONDataset,
            abs_paths=True,
        )

        dataset2 = fo.Dataset.from_dir(
            labels_path=labels_path,
            dataset_type=fo.types.GeoJSONDataset,
            location_field="coordinates",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")),
            set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("coordinates"), dataset2.count("coordinates")
        )

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.GeoJSONDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.GeoJSONDataset,
            location_field="coordinates",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("coordinates"), dataset2.count("coordinates")
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # data/_images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)


class MultitaskImageDatasetTests(ImageDatasetTests):
    def _make_dataset(self):
        samples = [
            fo.Sample(
                filepath=self._new_image(),
                weather=fo.Classification(label="sunny", confidence=0.9),
                predictions=fo.Detections(
                    detections=[
                        fo.Detection(
                            label="cat",
                            bounding_box=[0.1, 0.1, 0.4, 0.4],
                        ),
                        fo.Detection(
                            label="dog",
                            bounding_box=[0.5, 0.5, 0.4, 0.4],
                        ),
                    ]
                ),
            ),
            fo.Sample(
                filepath=self._new_image(),
                weather=fo.Classification(label="cloudy", confidence=0.95),
                predictions=fo.Detections(
                    detections=[
                        fo.Detection(
                            label="cat",
                            bounding_box=[0.1, 0.1, 0.4, 0.4],
                            confidence=0.9,
                            age=51,
                            cute=True,
                            mood="surly",
                        ),
                        fo.Detection(
                            label="dog",
                            bounding_box=[0.5, 0.5, 0.4, 0.4],
                            confidence=0.95,
                            age=52,
                            cute=False,
                            mood="derpy",
                        ),
                    ]
                ),
            ),
            fo.Sample(filepath=self._new_image()),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        return dataset

    @drop_datasets
    def test_fiftyone_image_labels_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneImageLabelsDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneImageLabelsDataset,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("weather"),
            dataset2.count("attributes"),
        )
        self.assertEqual(
            dataset.distinct("weather.confidence"),
            dataset2.distinct("attributes.confidence"),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("detections.detections"),
        )
        self.assertEqual(
            dataset.distinct("predictions.detections.confidence"),
            dataset2.distinct("detections.detections.confidence"),
        )

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneImageLabelsDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneImageLabelsDataset,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("detections.detections"),
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # data/_images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)

    @drop_datasets
    def test_bdd_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        view = dataset.limit(2)
        view.export(
            export_dir=export_dir,
            dataset_type=fo.types.BDDDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.BDDDataset,
        )

        self.assertEqual(len(view), len(dataset2))
        self.assertEqual(
            view.count("weather"),
            dataset2.count("attributes"),
        )
        self.assertEqual(
            view.count("predictions.detections"),
            dataset2.count("detections.detections"),
        )

        # Handle unlabeled data

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.BDDDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.BDDDataset,
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))

        # Labels-only

        data_path = self.images_dir
        labels_path = os.path.join(self._new_dir(), "labels.json")

        dataset.export(
            labels_path=labels_path,
            dataset_type=fo.types.BDDDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            data_path=data_path,
            labels_path=labels_path,
            dataset_type=fo.types.BDDDataset,
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("weather"),
            dataset2.count("attributes"),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("detections.detections"),
        )

        # Labels-only (absolute paths)

        labels_path = os.path.join(self._new_dir(), "labels.json")

        dataset.export(
            labels_path=labels_path,
            dataset_type=fo.types.BDDDataset,
            abs_paths=True,
        )

        dataset2 = fo.Dataset.from_dir(
            labels_path=labels_path,
            dataset_type=fo.types.BDDDataset,
        )

        self.assertEqual(
            dataset.count("weather"),
            dataset2.count("attributes"),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("detections.detections"),
        )

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.BDDDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.BDDDataset,
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("weather"),
            dataset2.count("attributes"),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("detections.detections"),
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # data/_images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)

    @drop_datasets
    def test_cvat_image_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        view = dataset.limit(2)
        view.export(
            export_dir=export_dir,
            dataset_type=fo.types.CVATImageDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.CVATImageDataset,
        )

        self.assertEqual(len(view), len(dataset2))
        self.assertEqual(
            view.count("predictions.detections"),
            dataset2.count("detections.detections"),
        )

        # Handle unlabeled data

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.CVATImageDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.CVATImageDataset,
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))

        # Labels-only

        data_path = self.images_dir
        labels_path = os.path.join(self._new_dir(), "labels.xml")

        dataset.export(
            labels_path=labels_path,
            dataset_type=fo.types.CVATImageDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            data_path=data_path,
            labels_path=labels_path,
            dataset_type=fo.types.CVATImageDataset,
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("detections.detections"),
        )

        # Labels-only (absolute paths)

        labels_path = os.path.join(self._new_dir(), "labels.xml")

        dataset.export(
            labels_path=labels_path,
            dataset_type=fo.types.CVATImageDataset,
            abs_paths=True,
        )

        dataset2 = fo.Dataset.from_dir(
            labels_path=labels_path,
            dataset_type=fo.types.CVATImageDataset,
        )

        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("detections.detections"),
        )

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.CVATImageDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.CVATImageDataset,
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("detections.detections"),
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # data/_images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)

    @skipwindows
    @drop_datasets
    def test_fiftyone_dataset(self):
        dataset = self._make_dataset()
        dataset.reload()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertListEqual(
            [os.path.basename(f) for f in dataset.values("filepath")],
            [os.path.basename(f) for f in dataset2.values("filepath")],
        )
        self.assertListEqual(
            dataset.values("weather.label"), dataset2.values("weather.label")
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )
        self.assertListEqual(
            dataset2.distinct("_dataset_id"), [dataset2._doc.id]
        )

        # Include dynamic attributes

        export_dir = self._new_dir()

        dataset1 = dataset.clone()
        dataset1.add_dynamic_sample_fields()

        schema = dataset1.get_field_schema(flat=True)
        self.assertIn("predictions.detections.age", schema)
        self.assertIn("predictions.detections.cute", schema)
        self.assertIn("predictions.detections.mood", schema)

        dataset1.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        schema = dataset2.get_field_schema(flat=True)
        self.assertIn("predictions.detections.age", schema)
        self.assertIn("predictions.detections.cute", schema)
        self.assertIn("predictions.detections.mood", schema)

        # Test import/export of saved views

        view = dataset.match(F("weather.label") == "sunny")
        dataset.save_view("test", view)

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        self.assertTrue("test" in dataset.list_saved_views())
        self.assertTrue("test" in dataset2.list_saved_views())

        view_doc = dataset2._get_saved_view_doc("test")
        self.assertEqual(str(dataset2._doc.id), view_doc.dataset_id)

        view2 = dataset2.load_saved_view("test")
        self.assertEqual(len(view), len(view2))

        # Test import/export of workspaces

        histograms_panel = fo.Panel(
            type="Histograms",
            state=dict(plot="Labels"),
        )
        workspace = fo.Space(
            children=[histograms_panel], orientation="vertical"
        )

        workspace_name = "my-workspace"
        workspace_desc = "very nice, high five!"

        dataset.save_workspace(
            workspace_name, workspace, description=workspace_desc
        )

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        self.assertTrue(workspace_name in dataset.list_workspaces())
        self.assertTrue(workspace_name in dataset2.list_workspaces())

        workspace_doc = dataset2._get_workspace_doc(workspace_name)
        self.assertEqual(str(dataset2._doc.id), workspace_doc.dataset_id)

        workspace2 = dataset2.load_workspace(workspace_name)
        self.assertEqual(workspace, workspace2)
        self.assertEqual(
            dataset.get_workspace_info(workspace_name),
            dataset2.get_workspace_info(workspace_name),
        )

        # Test import/export of evaluations

        dataset.clone_sample_field("predictions", "ground_truth")

        view = dataset.limit(2)
        view.evaluate_detections(
            "predictions", gt_field="ground_truth", eval_key="test"
        )

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        self.assertTrue("test" in dataset.list_evaluations())
        self.assertTrue("test" in dataset2.list_evaluations())

        run_doc = dataset2._doc.evaluations["test"]
        self.assertEqual(str(dataset2._doc.id), run_doc.dataset_id)

        view2 = dataset2.load_evaluation_view("test")
        self.assertEqual(len(view), len(view2))

        info = dataset.get_evaluation_info("test")
        info2 = dataset2.get_evaluation_info("test")
        self.assertEqual(info.key, info2.key)

        # Test import/export of custom runs

        config = dataset.init_run()
        config.foo = "bar"
        config.spam = "eggs"
        dataset.register_run("custom", config)

        results = dataset.init_run_results("custom")
        results.foo = "bar"
        results.spam = "eggs"
        dataset.save_run_results("custom", results)

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        self.assertTrue("custom" in dataset.list_runs())
        self.assertTrue("custom" in dataset2.list_runs())

        run_doc = dataset2._doc.runs["custom"]
        self.assertEqual(str(dataset2._doc.id), run_doc.dataset_id)

        info = dataset.get_run_info("custom")
        info2 = dataset2.get_run_info("custom")
        self.assertEqual(info.key, info2.key)
        self.assertEqual(info.config.foo, info2.config.foo)
        self.assertEqual(info.config.spam, info2.config.spam)

        results = dataset.load_run_results("custom")
        results2 = dataset.load_run_results("custom")

        self.assertEqual(results.foo, results2.foo)
        self.assertEqual(results.spam, results2.spam)

        # Per sample/frame directories

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
            use_dirs=True,
        )

        dataset3 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        self.assertEqual(len(dataset), len(dataset3))
        self.assertListEqual(
            [os.path.basename(f) for f in dataset.values("filepath")],
            [os.path.basename(f) for f in dataset3.values("filepath")],
        )
        self.assertListEqual(
            dataset.values("weather.label"), dataset3.values("weather.label")
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset3.count("predictions.detections"),
        )

        # Labels-only (absolute paths)

        export_dir = self._new_dir()

        dataset.export(
            dataset_type=fo.types.FiftyOneDataset,
            export_dir=export_dir,
            export_media=False,
        )

        self.assertFalse(os.path.isdir(os.path.join(export_dir, "data")))

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertListEqual(
            dataset.values("filepath"),
            dataset2.values("filepath"),
        )

        # Labels-only (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
            export_media=False,
            rel_dir=rel_dir,
        )

        self.assertFalse(os.path.isdir(os.path.join(export_dir, "data")))

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
            rel_dir=rel_dir,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertListEqual(
            dataset.values("filepath"),
            dataset2.values("filepath"),
        )

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # data/_images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)

        # Alternate media

        export_dir = self._new_dir()
        field_dir = os.path.join(export_dir, "fields", "filepath2")

        dataset.clone_sample_field("filepath", "filepath2")
        dataset.app_config.media_fields.append("filepath2")
        dataset.save()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        self.assertEqual(
            dataset.count("filepath2"), dataset2.count("filepath2")
        )
        for filepath in dataset2.values("filepath2"):
            self.assertTrue(filepath.startswith(field_dir))

        # Alternate media (don't export media)

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
            export_media=False,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        self.assertListEqual(
            dataset.values("filepath2"), dataset2.values("filepath2")
        )

        # Retain description/tags

        description = "Hello, world!"
        tags = ["foo", "bar"]
        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        dataset2 = fo.Dataset()
        dataset2.description = description
        dataset2.tags = tags

        dataset2.add_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        self.assertEqual(dataset2.description, description)
        self.assertListEqual(dataset2.tags, tags)

        # Created at/last modified at

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        field_created_at1 = [
            f.created_at for f in dataset.get_field_schema().values()
        ]
        created_at1 = dataset.values("created_at")
        last_modified_at1 = dataset.values("last_modified_at")

        field_created_at2 = [
            f.created_at for f in dataset2.get_field_schema().values()
        ]
        created_at2 = dataset2.values("created_at")
        last_modified_at2 = dataset2.values("last_modified_at")

        self.assertTrue(
            all(
                f1 < f2 for f1, f2 in zip(field_created_at1, field_created_at2)
            )
        )
        self.assertTrue(
            all(c1 < c2 for c1, c2 in zip(created_at1, created_at2))
        )
        self.assertTrue(
            all(
                m1 < m2 for m1, m2 in zip(last_modified_at1, last_modified_at2)
            )
        )

    @skipwindows
    @drop_datasets
    def test_legacy_fiftyone_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertListEqual(
            [os.path.basename(f) for f in dataset.values("filepath")],
            [os.path.basename(f) for f in dataset2.values("filepath")],
        )
        self.assertListEqual(
            dataset.values("weather.label"), dataset2.values("weather.label")
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )
        self.assertListEqual(
            dataset2.distinct("_dataset_id"), [dataset2._doc.id]
        )

        # Test import/export of saved views

        view = dataset.match(F("weather.label") == "sunny")
        dataset.save_view("test", view)

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        self.assertTrue("test" in dataset.list_saved_views())
        self.assertTrue("test" in dataset2.list_saved_views())

        view_doc = dataset2._get_saved_view_doc("test")
        self.assertEqual(str(dataset2._doc.id), view_doc.dataset_id)

        view2 = dataset2.load_saved_view("test")
        self.assertEqual(len(view), len(view2))

        # Test import/export of workspaces

        histograms_panel = fo.Panel(
            type="Histograms",
            state=dict(plot="Labels"),
        )
        workspace = fo.Space(
            children=[histograms_panel], orientation="vertical"
        )

        workspace_name = "my-workspace"
        workspace_desc = "very nice, high five!"

        dataset.save_workspace(
            workspace_name, workspace, description=workspace_desc
        )

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        self.assertTrue(workspace_name in dataset.list_workspaces())
        self.assertTrue(workspace_name in dataset2.list_workspaces())

        workspace_doc = dataset2._get_workspace_doc(workspace_name)
        self.assertEqual(str(dataset2._doc.id), workspace_doc.dataset_id)

        workspace2 = dataset2.load_workspace(workspace_name)
        self.assertEqual(workspace, workspace2)
        self.assertEqual(
            dataset.get_workspace_info(workspace_name),
            dataset2.get_workspace_info(workspace_name),
        )

        # Test import/export of evaluations

        dataset.clone_sample_field("predictions", "ground_truth")

        view = dataset.limit(2)
        view.evaluate_detections(
            "predictions", gt_field="ground_truth", eval_key="test"
        )

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        self.assertTrue("test" in dataset.list_evaluations())
        self.assertTrue("test" in dataset2.list_evaluations())

        run_doc = dataset2._doc.evaluations["test"]
        self.assertEqual(str(dataset2._doc.id), run_doc.dataset_id)

        view2 = dataset2.load_evaluation_view("test")
        self.assertEqual(len(view), len(view2))

        info = dataset.get_evaluation_info("test")
        info2 = dataset2.get_evaluation_info("test")
        self.assertEqual(info.key, info2.key)

        # Test import/export of custom runs

        config = dataset.init_run()
        config.foo = "bar"
        config.spam = "eggs"
        dataset.register_run("custom", config)

        results = dataset.init_run_results("custom")
        results.foo = "bar"
        results.spam = "eggs"
        dataset.save_run_results("custom", results)

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        self.assertTrue("custom" in dataset.list_runs())
        self.assertTrue("custom" in dataset2.list_runs())

        run_doc = dataset2._doc.runs["custom"]
        self.assertEqual(str(dataset2._doc.id), run_doc.dataset_id)

        info = dataset.get_run_info("custom")
        info2 = dataset2.get_run_info("custom")
        self.assertEqual(info.key, info2.key)
        self.assertEqual(info.config.foo, info2.config.foo)
        self.assertEqual(info.config.spam, info2.config.spam)

        results = dataset.load_run_results("custom")
        results2 = dataset.load_run_results("custom")

        self.assertEqual(results.foo, results2.foo)
        self.assertEqual(results.spam, results2.spam)

        # Labels-only (absolute paths)

        export_dir = self._new_dir()

        dataset.export(
            dataset_type=fo.types.LegacyFiftyOneDataset,
            export_dir=export_dir,
            export_media=False,
            abs_paths=True,
        )

        self.assertFalse(os.path.isdir(os.path.join(export_dir, "data")))

        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.LegacyFiftyOneDataset,
            dataset_dir=export_dir,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertListEqual(
            dataset.values("filepath"),
            dataset2.values("filepath"),
        )

        # Labels-only (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
            export_media=False,
            rel_dir=rel_dir,
        )

        self.assertFalse(os.path.isdir(os.path.join(export_dir, "data")))

        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.LegacyFiftyOneDataset,
            dataset_dir=export_dir,
            rel_dir=rel_dir,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertListEqual(
            dataset.values("filepath"),
            dataset2.values("filepath"),
        )

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # data/_images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)

        # Alternate media

        export_dir = self._new_dir()
        field_dir = os.path.join(export_dir, "fields", "filepath2")

        dataset.clone_sample_field("filepath", "filepath2")
        dataset.app_config.media_fields.append("filepath2")
        dataset.save()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        self.assertEqual(
            dataset.count("filepath2"), dataset2.count("filepath2")
        )
        for filepath in dataset2.values("filepath2"):
            self.assertTrue(filepath.startswith(field_dir))

        # Alternate media (don't export media)

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
            export_media=False,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        self.assertListEqual(
            dataset.values("filepath2"), dataset2.values("filepath2")
        )

        # Retain description/tags

        description = "Hello, world!"
        tags = ["foo", "bar"]
        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        dataset2 = fo.Dataset()
        dataset2.description = description
        dataset2.tags = tags

        dataset2.add_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        self.assertEqual(dataset2.description, description)
        self.assertListEqual(dataset2.tags, tags)

        # Created at/last modified at

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        field_created_at1 = [
            f.created_at for f in dataset.get_field_schema().values()
        ]
        created_at1 = dataset.values("created_at")
        last_modified_at1 = dataset.values("last_modified_at")

        field_created_at2 = [
            f.created_at for f in dataset2.get_field_schema().values()
        ]
        created_at2 = dataset2.values("created_at")
        last_modified_at2 = dataset2.values("last_modified_at")

        self.assertTrue(
            all(
                f1 < f2 for f1, f2 in zip(field_created_at1, field_created_at2)
            )
        )

        self.assertTrue(
            all(c1 < c2 for c1, c2 in zip(created_at1, created_at2))
        )
        self.assertTrue(
            all(
                m1 < m2 for m1, m2 in zip(last_modified_at1, last_modified_at2)
            )
        )


class OpenLABELImageDatasetTests(ImageDatasetTests):
    @drop_datasets
    def test_openlabel_dataset(self):
        import utils.openlabel as ol

        labels_path = ol._make_image_labels(self.root_dir)
        img_filepath = self._new_image(name="openlabel_test")

        dataset = fo.Dataset.from_dir(
            data_path=self.images_dir,
            labels_path=labels_path,
            dataset_type=fo.types.OpenLABELImageDataset,
        )

        self.assertEqual(dataset.count("detections.detections.label"), 1)
        self.assertEqual(dataset.count("segmentations.detections.label"), 2)
        self.assertEqual(dataset.count("keypoints.keypoints.label"), 2)

    @drop_datasets
    def test_openlabel_single_type_dataset(self):
        import utils.openlabel as ol

        labels_path = ol._make_image_labels(self.root_dir)
        img_filepath = self._new_image(name="openlabel_test")

        dataset = fo.Dataset.from_dir(
            data_path=self.images_dir,
            labels_path=labels_path,
            dataset_type=fo.types.OpenLABELImageDataset,
            label_types="detections",
        )

        self.assertTrue(
            isinstance(dataset.first().ground_truth, fo.Detections)
        )

    @drop_datasets
    def test_openlabel_skeleton_dataset(self):
        import utils.openlabel as ol

        labels_path = ol._make_image_labels(self.root_dir)
        img_filepath = self._new_image(name="openlabel_test")

        skeleton, skeleton_key = ol._make_skeleton()
        dataset = fo.Dataset.from_dir(
            data_path=self.images_dir,
            labels_path=labels_path,
            dataset_type=fo.types.OpenLABELImageDataset,
            label_types="keypoints",
            skeleton_key=skeleton_key,
            skeleton=skeleton,
            dynamic=True,
        )
        dataset.default_skeleton = skeleton

        self.assertTrue(isinstance(dataset.first().ground_truth, fo.Keypoints))
        view = dataset.filter_labels(
            "ground_truth",
            F("points").length() > 1,
        )
        self.assertEqual(
            view.first().ground_truth.keypoints[0].name[0], "pose_point1"
        )
        self.assertEqual(len(view.first().ground_truth.keypoints[0].points), 3)

    @drop_datasets
    def test_openlabel_segmentation_dataset(self):
        import utils.openlabel as ol

        labels_path = ol._make_segmentation_labels(self.root_dir)
        img_filepath = self._new_image(name="openlabel_test")

        dataset = fo.Dataset.from_dir(
            data_path=self.images_dir,
            labels_path=labels_path,
            dataset_type=fo.types.OpenLABELImageDataset,
        )

        self.assertEqual(dataset.count("segmentations.detections.mask"), 2)

        dataset = fo.Dataset.from_dir(
            data_path=self.images_dir,
            labels_path=labels_path,
            dataset_type=fo.types.OpenLABELImageDataset,
            use_polylines=True,
        )

        self.assertEqual(dataset.count("segmentations.polylines"), 2)


class VideoDatasetTests(unittest.TestCase):
    def setUp(self):
        temp_dir = etau.TempDir()
        root_dir = temp_dir.__enter__()
        ref_video_path = os.path.join(root_dir, "_ref_video.mp4")
        videos_dir = os.path.join(root_dir, "_videos")

        with etav.FFmpegVideoWriter(ref_video_path, 5, (640, 480)) as writer:
            for _ in range(5):
                img = np.random.randint(
                    255, size=(480, 640, 3), dtype=np.uint8
                )
                writer.write(img)

        self.root_dir = root_dir
        self.videos_dir = videos_dir

        self._temp_dir = temp_dir
        self._ref_video_path = ref_video_path

    def tearDown(self):
        self._temp_dir.__exit__()

    def _new_video(self, filename=None):
        if filename is None:
            filename = self._new_name()
        filepath = os.path.join(
            self.videos_dir,
            filename + os.path.splitext(self._ref_video_path)[1],
        )

        etau.copy_file(self._ref_video_path, filepath)
        return filepath

    def _new_name(self):
        return "".join(
            random.choice(string.ascii_lowercase + string.digits)
            for _ in range(24)
        )

    def _new_dir(self):
        return os.path.join(self.root_dir, self._new_name())


class OpenLABELVideoDatasetTests(VideoDatasetTests):
    @drop_datasets
    def test_openlabel_dataset(self):
        import utils.openlabel as ol

        labels_path = ol._make_video_labels(self.root_dir)
        vid_filepath = self._new_video(filename="openlabel_test")

        dataset = fo.Dataset.from_dir(
            data_path=self.videos_dir,
            labels_path=labels_path,
            dataset_type=fo.types.OpenLABELVideoDataset,
        )

        self.assertEqual(
            dataset.count("frames.detections.detections.label"), 5
        )
        self.assertEqual(
            dataset.count("frames.segmentations.detections.label"), 5
        )
        self.assertEqual(dataset.count("frames.keypoints.keypoints.label"), 5)


class VideoExportCoersionTests(VideoDatasetTests):
    def _make_dataset(self):
        sample1 = fo.Sample(
            filepath=self._new_video(),
            predictions=fo.TemporalDetections(
                detections=[
                    fo.TemporalDetection(
                        label="cat", support=[1, 3], confidence=0.9
                    )
                ]
            ),
        )
        sample1.frames[1] = fo.Frame(
            weather=fo.Classification(label="sunny", confidence=0.9),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                    ),
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.5, 0.5, 0.4, 0.4],
                    ),
                ]
            ),
        )
        sample1.frames[2] = fo.Frame(
            weather=fo.Classification(label="cloudy", confidence=0.95),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                        confidence=0.9,
                        age=51,
                        cute=True,
                        mood="surly",
                    ),
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.5, 0.5, 0.4, 0.4],
                        confidence=0.95,
                        age=52,
                        cute=False,
                        mood="derpy",
                    ),
                ]
            ),
        )

        sample2 = fo.Sample(
            filepath=self._new_video(),
            predictions=fo.TemporalDetections(
                detections=[
                    fo.TemporalDetection(
                        label="cat",
                        support=[1, 4],
                        confidence=0.95,
                    ),
                    fo.TemporalDetection(
                        label="dog",
                        support=[2, 5],
                        confidence=0.95,
                    ),
                ]
            ),
        )

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2])

        return dataset

    @drop_datasets
    def test_frame_label_fields(self):
        dataset = self._make_dataset()

        #
        # `label_field` scalar syntax
        #

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
            label_field="frames.predictions",
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
            label_field={"detections": "predictions"},
        )

        self.assertEqual(
            dataset.count("frames.predictions.detections"),
            dataset2.count("frames.predictions.detections"),
        )

        #
        # `label_field` dict syntax
        #

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
            label_field={"dets": "frames.predictions"},
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
            label_field={"detections": "predictions"},
        )

        self.assertEqual(
            dataset.count("frames.predictions.detections"),
            dataset2.count("frames.predictions.detections"),
        )

        #
        # `frame_labels_field`
        #

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
            frame_labels_field="predictions",
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
            label_field={"detections": "predictions"},
        )

        self.assertEqual(
            dataset.count("frames.predictions.detections"),
            dataset2.count("frames.predictions.detections"),
        )

        #
        # `frame_labels_field` with "frames." prefix
        #

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
            frame_labels_field="frames.predictions",
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
            label_field={"detections": "predictions"},
        )

        self.assertEqual(
            dataset.count("frames.predictions.detections"),
            dataset2.count("frames.predictions.detections"),
        )

        #
        # `frame_labels_field` with dict syntax
        #

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
            frame_labels_field={"dets": "frames.predictions"},
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
            label_field={"detections": "predictions"},
        )

        self.assertEqual(
            dataset.count("frames.predictions.detections"),
            dataset2.count("frames.predictions.detections"),
        )

    @skipwindows
    @drop_datasets
    def test_clip_exports(self):
        dataset = self._make_dataset()

        #
        # Export unlabeled video clips
        #

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.VideoDirectory,
            label_field="predictions",
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.VideoDirectory,
        )

        self.assertEqual(
            len(dataset2), dataset.count("predictions.detections")
        )

        #
        # Export temporal detection clips in a TemporalDetections field
        #

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.VideoClassificationDirectoryTree,
            label_field="predictions",
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.VideoClassificationDirectoryTree,
        )

        self.assertEqual(
            len(dataset2), dataset.count("predictions.detections")
        )

        #
        # Export video clips directly from a clips view
        #

        export_dir = self._new_dir()

        clips = dataset.to_clips("predictions")
        clips.export(
            export_dir=export_dir,
            dataset_type=fo.types.VideoDirectory,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.VideoDirectory,
        )

        self.assertEqual(
            len(dataset2), dataset.count("predictions.detections")
        )

        #
        # Export video classification clips directly from a clips view
        #

        export_dir = self._new_dir()

        clips = dataset.to_clips("predictions")
        clips.export(
            export_dir=export_dir,
            dataset_type=fo.types.VideoClassificationDirectoryTree,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.VideoClassificationDirectoryTree,
        )

        self.assertEqual(
            len(dataset2), dataset.count("predictions.detections")
        )

        #
        # Export frame labels for clips
        #

        export_dir = self._new_dir()

        clips = dataset.to_clips("predictions")
        clips.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneVideoLabelsDataset,
            frame_labels_field="predictions",
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneVideoLabelsDataset,
        )

        self.assertEqual(
            clips.count("frames.predictions.detections"),
            dataset2.count("frames.predictions.detections"),
        )

        #
        # Export entire clips view as a dataset
        #

        export_dir = self._new_dir()

        clips = dataset.to_clips("predictions")
        clips.export(
            export_dir=export_dir, dataset_type=fo.types.FiftyOneDataset
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir, dataset_type=fo.types.FiftyOneDataset
        )

        self.assertEqual(len(clips), len(dataset2))
        self.assertEqual(clips.count("frames"), dataset2.count("frames"))
        self.assertListEqual(
            clips.values("support"), dataset2.values("support")
        )

        dataset3 = clips.clone()

        self.assertEqual(len(clips), len(dataset3))
        self.assertEqual(clips.count("frames"), dataset3.count("frames"))
        self.assertListEqual(
            clips.values("support"), dataset3.values("support")
        )


class UnlabeledVideoDatasetTests(VideoDatasetTests):
    def _make_dataset(self):
        samples = [fo.Sample(filepath=self._new_video()) for _ in range(5)]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        return dataset

    @drop_datasets
    def test_video_directory(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.VideoDirectory,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.VideoDirectory,
        )

        self.assertEqual(len(dataset), len(dataset2))

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.VideoDirectory,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.VideoDirectory,
        )

        self.assertEqual(len(dataset), len(dataset2))

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # _videos/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 2)


class VideoClassificationDatasetTests(VideoDatasetTests):
    def _make_dataset(self):
        samples = [
            fo.Sample(
                filepath=self._new_video(),
                predictions=fo.Classification(label="cat", confidence=0.9),
            ),
            fo.Sample(
                filepath=self._new_video(),
                predictions=fo.Classification(label="dog", confidence=0.95),
            ),
            fo.Sample(filepath=self._new_video()),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        return dataset

    @drop_datasets
    def test_video_classification_directory_tree(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.VideoClassificationDirectoryTree,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.VideoClassificationDirectoryTree,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions"), dataset2.count("predictions")
        )

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.VideoClassificationDirectoryTree,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.VideoClassificationDirectoryTree,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions"), dataset2.count("predictions")
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # <class>/_videos/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)


class TemporalDetectionDatasetTests(VideoDatasetTests):
    def _make_dataset(self):
        samples = [
            fo.Sample(
                filepath=self._new_video(),
                predictions=fo.TemporalDetections(
                    detections=[
                        fo.TemporalDetection(
                            label="cat", support=[1, 3], confidence=0.9
                        )
                    ]
                ),
            ),
            fo.Sample(
                filepath=self._new_video(),
                predictions=fo.TemporalDetections(
                    detections=[
                        fo.TemporalDetection(
                            label="cat",
                            support=[1, 4],
                            confidence=0.95,
                        ),
                        fo.TemporalDetection(
                            label="dog",
                            support=[2, 5],
                            confidence=0.95,
                        ),
                    ]
                ),
            ),
            fo.Sample(filepath=self._new_video()),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        return dataset

    @drop_datasets
    def test_fiftyone_temporal_detection_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
            label_field="predictions",
        )

        supports = dataset.values("predictions.detections.support")
        supports2 = dataset2.values("predictions.detections.support")

        self.assertEqual(len(dataset), len(dataset2))

        # sorting is necessary because sample order is arbitrary
        self.assertListEqual(
            sorted(supports, key=lambda k: (k is None, k)),
            sorted(supports2, key=lambda k: (k is None, k)),
        )

        # Use timestamps

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
            use_timestamps=True,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
            label_field="predictions",
        )

        supports = dataset.values("predictions.detections.support")
        supports2 = dataset2.values("predictions.detections.support")

        self.assertEqual(len(dataset), len(dataset2))

        # sorting is necessary because sample order is arbitrary
        self.assertListEqual(
            sorted(supports, key=lambda k: (k is None, k)),
            sorted(supports2, key=lambda k: (k is None, k)),
        )

        # Labels-only

        data_path = self.videos_dir
        labels_path = os.path.join(self._new_dir(), "labels.json")

        dataset.export(
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
            labels_path=labels_path,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
            data_path=data_path,
            labels_path=labels_path,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")),
            set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        # Labels-only (absolute paths)

        labels_path = os.path.join(self._new_dir(), "labels.json")

        dataset.export(
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
            labels_path=labels_path,
            abs_paths=True,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
            labels_path=labels_path,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")),
            set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        # Standard format (with rel dir)

        data_path = "videos"
        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            data_path=data_path,
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            data_path=data_path,
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # data/_videos/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)

        # Labels-only (with rel dir)

        labels_path = os.path.join(self._new_dir(), "labels.json")
        rel_dir = self.root_dir

        dataset.export(
            labels_path=labels_path,
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            data_path=rel_dir,
            labels_path=labels_path,
            dataset_type=fo.types.FiftyOneTemporalDetectionDataset,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

        # _videos/<filename>
        relpath = _relpath(dataset2.first().filepath, rel_dir)

        self.assertEqual(len(relpath.split(os.path.sep)), 2)


class MultitaskVideoDatasetTests(VideoDatasetTests):
    def _make_dataset(self):
        sample1 = fo.Sample(filepath=self._new_video())
        sample1.frames[1] = fo.Frame(
            weather=fo.Classification(label="sunny", confidence=0.9),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                    ),
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.5, 0.5, 0.4, 0.4],
                    ),
                ]
            ),
        )
        sample1.frames[2] = fo.Frame(
            weather=fo.Classification(label="cloudy", confidence=0.95),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                        confidence=0.9,
                        age=51,
                        cute=True,
                        mood="surly",
                    ),
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.5, 0.5, 0.4, 0.4],
                        confidence=0.95,
                        age=52,
                        cute=False,
                        mood="derpy",
                    ),
                ]
            ),
        )

        sample2 = fo.Sample(filepath=self._new_video())
        sample2.frames[1] = fo.Frame()

        sample3 = fo.Sample(filepath=self._new_video())

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2, sample3])

        return dataset

    @drop_datasets
    def test_fiftyone_video_labels_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneVideoLabelsDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneVideoLabelsDataset,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("frames.weather"),
            dataset2.count("frames.attributes"),
        )
        self.assertEqual(
            dataset.distinct("frames.weather.confidence"),
            dataset2.distinct("frames.attributes.confidence"),
        )
        self.assertEqual(
            dataset.count("frames.predictions.detections"),
            dataset2.count("frames.detections.detections"),
        )
        self.assertEqual(
            dataset.distinct("frames.predictions.detections.confidence"),
            dataset2.distinct("frames.detections.detections.confidence"),
        )

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneVideoLabelsDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneVideoLabelsDataset,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("frames.predictions.detections"),
            dataset2.count("frames.detections.detections"),
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # data/_videos/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)

    @drop_datasets
    def test_cvat_video_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        view = dataset.limit(1)
        view.export(
            export_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
        )

        self.assertEqual(len(view), len(dataset2))
        self.assertEqual(
            view.count("frames.predictions.detections"),
            dataset2.count("frames.detections.detections"),
        )

        # Handle unlabeled data

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))

        # Labels-only

        data_path = self.videos_dir
        labels_path = os.path.join(self._new_dir(), "labels/")

        dataset.export(
            labels_path=labels_path,
            dataset_type=fo.types.CVATVideoDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            data_path=data_path,
            labels_path=labels_path,
            dataset_type=fo.types.CVATVideoDataset,
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("frames.predictions.detections"),
            dataset2.count("frames.detections.detections"),
        )

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.CVATVideoDataset,
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("frames.predictions.detections"),
            dataset2.count("frames.detections.detections"),
        )

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # data/_videos/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 3)

    @drop_datasets
    def test_fiftyone_dataset(self):
        dataset = self._make_dataset()

        # Created at/last modified at

        export_dir = self._new_dir()

        dataset.reload()
        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.FiftyOneDataset,
        )

        field_created_at1 = [
            f.created_at for f in dataset.get_frame_field_schema().values()
        ]
        created_at1 = dataset.values("frames.created_at", unwind=True)
        last_modified_at1 = dataset.values("last_modified_at", unwind=True)

        field_created_at2 = [
            f.created_at for f in dataset2.get_frame_field_schema().values()
        ]
        created_at2 = dataset2.values("frames.created_at", unwind=True)
        last_modified_at2 = dataset2.values(
            "frames.last_modified_at", unwind=True
        )

        self.assertTrue(
            all(
                f1 < f2 for f1, f2 in zip(field_created_at1, field_created_at2)
            )
        )
        self.assertTrue(
            all(c1 < c2 for c1, c2 in zip(created_at1, created_at2))
        )
        self.assertTrue(
            all(
                m1 < m2 for m1, m2 in zip(last_modified_at1, last_modified_at2)
            )
        )

    @drop_datasets
    def test_legacy_fiftyone_dataset(self):
        dataset = self._make_dataset()

        # Created at/last modified at

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.LegacyFiftyOneDataset,
        )

        field_created_at1 = [
            f.created_at for f in dataset.get_frame_field_schema().values()
        ]
        created_at1 = dataset.values("frames.created_at", unwind=True)
        last_modified_at1 = dataset.values("last_modified_at", unwind=True)

        field_created_at2 = [
            f.created_at for f in dataset2.get_frame_field_schema().values()
        ]
        created_at2 = dataset2.values("frames.created_at", unwind=True)
        last_modified_at2 = dataset2.values(
            "frames.last_modified_at", unwind=True
        )

        self.assertTrue(
            all(
                f1 < f2 for f1, f2 in zip(field_created_at1, field_created_at2)
            )
        )
        self.assertTrue(
            all(c1 < c2 for c1, c2 in zip(created_at1, created_at2))
        )
        self.assertTrue(
            all(
                m1 < m2 for m1, m2 in zip(last_modified_at1, last_modified_at2)
            )
        )


class UnlabeledMediaDatasetTests(ImageDatasetTests):
    def _make_dataset(self):
        samples = [fo.Sample(filepath=self._new_image()) for _ in range(5)]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        return dataset

    @drop_datasets
    def test_media_directory(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.MediaDirectory,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.MediaDirectory,
        )

        self.assertEqual(len(dataset), len(dataset2))

        # Standard format (with rel dir)

        export_dir = self._new_dir()
        rel_dir = self.root_dir

        dataset.export(
            export_dir=export_dir,
            dataset_type=fo.types.MediaDirectory,
            rel_dir=rel_dir,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.MediaDirectory,
        )

        self.assertEqual(len(dataset), len(dataset2))

        relpath = _relpath(dataset2.first().filepath, export_dir)

        # _images/<filename>
        self.assertEqual(len(relpath.split(os.path.sep)), 2)


class ThreeDMediaTests(unittest.TestCase):
    """Tests mostly for proper media export. Labels are tested
    properly elsewhere, 3D should be no different in that regard.
    """

    def _build_flat_relative(self, temp_dir):
        # Scene has relative asset paths
        # Data layout:
        # data/
        #   image.jpeg
        #   pcd.pcd
        #   obj.obj
        #   mtl.mtl
        #   s1.fo3d
        root_data_dir = os.path.join(temp_dir, "data")
        s = fo.Scene()
        s.background = fo.SceneBackground(image="image.jpeg")
        s.add(fo.PointCloud("pcd", "pcd.pcd"))
        s.add(fo.ObjMesh("obj", "obj.obj", "mtl.mtl"))
        scene_path = os.path.join(root_data_dir, "s1.fo3d")
        s.write(scene_path)
        for file in s.get_asset_paths():
            with open(os.path.join(root_data_dir, file), "w") as f:
                f.write(file)
        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample(scene_path))
        return s, dataset

    def _build_flat_absolute(self, temp_dir):
        # Scene has absolute asset paths
        # Data layout:
        # data/
        #   image.jpeg
        #   pcd.pcd
        #   obj.obj
        #   mtl.mtl
        #   s1.fo3d
        root_data_dir = os.path.join(temp_dir, "data")
        s = fo.Scene()
        s.background = fo.SceneBackground(
            image=os.path.join(root_data_dir, "image.jpeg")
        )
        s.add(fo.PointCloud("pcd", os.path.join(root_data_dir, "pcd.pcd")))
        s.add(
            fo.ObjMesh(
                "obj",
                os.path.join(root_data_dir, "obj.obj"),
                os.path.join(root_data_dir, "mtl.mtl"),
            )
        )
        scene_path = os.path.join(root_data_dir, "s1.fo3d")
        s.write(scene_path)
        for file in s.get_asset_paths():
            with open(os.path.join(root_data_dir, file), "w") as f:
                f.write(os.path.basename(file))

        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample(scene_path))
        return s, dataset

    def _build_nested_relative(self, temp_dir):
        # Scene has relative asset paths
        # Data layout:
        # data/
        #   image.jpeg
        #   label1/
        #       test/
        #           s.fo3d
        #           sub/
        #               pcd.pcd
        #               obj.obj
        #               mtl.mtl
        #   label2/
        #       test/
        #           s.fo3d
        #           sub/
        #               pcd.pcd
        #               obj.obj
        #               mtl.mtl
        root_data_dir = os.path.join(temp_dir, "data")
        scene1_dir = os.path.join(root_data_dir, "label1", "test")

        s = fo.Scene()
        s.background = fo.SceneBackground(image="../../image.jpeg")
        s.add(fo.PointCloud("pcd", "sub/pcd.pcd"))
        s.add(
            fo.ObjMesh(
                "obj",
                "sub/obj.obj",
                "sub/mtl.mtl",
            )
        )
        scene_path = os.path.join(scene1_dir, "s.fo3d")
        s.write(scene_path)

        scene2_dir = os.path.join(root_data_dir, "label2", "test")

        scene_path2 = os.path.join(scene2_dir, "s.fo3d")

        # Scene2 is the same except change something small so we know which
        #   is which.
        s.background.color = "red"
        s.write(scene_path2)

        # Write content as filename (with 2 suffix for files from scene 2)
        for file in s.get_asset_paths():
            f = pathlib.Path(os.path.join(scene1_dir, file))
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(os.path.basename(file))

            if file.endswith("image.jpeg"):
                continue

            f = pathlib.Path(os.path.join(scene2_dir, file))
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(os.path.basename(file) + "2")

        dataset = fo.Dataset()
        dataset.add_samples([fo.Sample(scene_path), fo.Sample(scene_path2)])
        return dataset

    def _assert_scene_content(self, original_scene, scene, export_dir=None):
        self.assertEqual(original_scene, scene)
        for file in scene.get_asset_paths():
            if export_dir:
                file = os.path.join(export_dir, file)
            with open(file) as f:
                self.assertEqual(f.read(), os.path.basename(file))

    @drop_datasets
    def test_flat_relative(self):
        """Tests a simple flat and relative-addressed scene"""
        with tempfile.TemporaryDirectory() as temp_dir:
            s, dataset = self._build_flat_relative(temp_dir)

            # Export
            export_dir = os.path.join(temp_dir, "export")
            dataset.export(
                export_dir=export_dir,
                dataset_type=fo.types.MediaDirectory,
                export_media=True,
            )

            # All files flat in export_dir
            fileset = set(os.listdir(export_dir))
            self.assertSetEqual(
                fileset,
                {"image.jpeg", "pcd.pcd", "obj.obj", "mtl.mtl", "s1.fo3d"},
            )

            # Same file content
            scene2 = fo.Scene.from_fo3d(os.path.join(export_dir, "s1.fo3d"))
            self._assert_scene_content(s, scene2, export_dir)

    @drop_datasets
    def test_flat_absolute(self):
        """Tests a simple flat and absolute-addressed scene"""
        with tempfile.TemporaryDirectory() as temp_dir:
            s, dataset = self._build_flat_absolute(temp_dir)

            # Export it
            export_dir = os.path.join(temp_dir, "export")
            dataset.export(
                export_dir=export_dir,
                dataset_type=fo.types.MediaDirectory,
                export_media=True,
            )

            # All files flat in export_dir
            fileset = set(os.listdir(export_dir))
            self.assertSetEqual(
                fileset,
                {"image.jpeg", "pcd.pcd", "obj.obj", "mtl.mtl", "s1.fo3d"},
            )

            # Write temp scene with resolving relative paths, so we can test
            #   that scenes are equal if relative paths are resolved
            tmp_scene = fo.Scene.from_fo3d(os.path.join(export_dir, "s1.fo3d"))
            tmp_scene.write(
                os.path.join(export_dir, "test.fo3d"),
                resolve_relative_paths=True,
            )
            scene2 = fo.Scene.from_fo3d(os.path.join(export_dir, "test.fo3d"))

            self._assert_scene_content(s, scene2)

    @drop_datasets
    def test_relative_nested_flatten(self):
        """Tests nested structure is flattened to export dir. Will require
        rename of duplicate asset file names and change of relative asset path
        in fo3d file.
        """
        with tempfile.TemporaryDirectory() as temp_dir:
            dataset = self._build_nested_relative(temp_dir)

            # Export it and flatten (no rel_dir)
            export_dir = os.path.join(temp_dir, "export")
            dataset.export(
                export_dir=export_dir,
                dataset_type=fo.types.MediaDirectory,
                export_media=True,
            )

            # Flattening should mean duplicate file names gain a '-2'
            fileset = set(os.listdir(export_dir))
            self.assertSetEqual(
                fileset,
                {
                    "image.jpeg",
                    "pcd.pcd",
                    "obj.obj",
                    "mtl.mtl",
                    "s.fo3d",
                    "image.jpeg",
                    "pcd-2.pcd",
                    "obj-2.obj",
                    "mtl-2.mtl",
                    "s-2.fo3d",
                },
            )

            # Scene 1
            scene1_2 = fo.Scene.from_fo3d(os.path.join(export_dir, "s.fo3d"))
            self.assertSetEqual(
                set(scene1_2.get_asset_paths()),
                {
                    "image.jpeg",
                    "pcd.pcd",
                    "obj.obj",
                    "mtl.mtl",
                },
            )
            # Scene 2
            scene2_2 = fo.Scene.from_fo3d(os.path.join(export_dir, "s-2.fo3d"))
            self.assertSetEqual(
                set(scene2_2.get_asset_paths()),
                {
                    "image.jpeg",
                    "pcd-2.pcd",
                    "obj-2.obj",
                    "mtl-2.mtl",
                },
            )

            # Make sure we align on scene number from before - remember, scene2
            #   has a red background! Swap if necessary
            if scene1_2.background.color == "red":
                scene2_2, scene1_2 = scene1_2, scene2_2

            for file in scene1_2.get_asset_paths():
                with open(os.path.join(export_dir, file)) as f:
                    self.assertEqual(f.read(), os.path.basename(file))

            for file in scene2_2.get_asset_paths():
                if file.endswith("image.jpeg"):
                    continue
                with open(os.path.join(export_dir, file)) as f:
                    self.assertEqual(
                        f.read(),
                        os.path.basename(file).replace("-2", "") + "2",
                    )

    @drop_datasets
    def test_relative_nested_maintain(self):
        """Tests nested structure is maintained in export dir. No change in
        relative asset paths in fo3d file.
        """
        with tempfile.TemporaryDirectory() as temp_dir:
            dataset = self._build_nested_relative(temp_dir)

            # Export it - with root data dir as rel_dir
            root_data_dir = os.path.join(temp_dir, "data")
            export_dir = os.path.join(temp_dir, "export")

            dataset.export(
                export_dir=export_dir,
                dataset_type=fo.types.MediaDirectory,
                export_media=True,
                rel_dir=root_data_dir,
            )

            scene1 = fo.Scene.from_fo3d(
                os.path.join(export_dir, "label1/test/s.fo3d")
            )
            self.assertEqual(scene1.background.image, "../../image.jpeg")

            for file in scene1.get_asset_paths():
                with open(os.path.join(export_dir, "label1/test/", file)) as f:
                    self.assertEqual(f.read(), os.path.basename(file))

            scene2 = fo.Scene.from_fo3d(
                os.path.join(export_dir, "label2/test/s.fo3d")
            )
            self.assertEqual(scene2.background.image, "../../image.jpeg")

            for file in scene2.get_asset_paths():
                with open(os.path.join(export_dir, "label2/test/", file)) as f:
                    if file.endswith("image.jpeg"):
                        continue
                    self.assertEqual(
                        f.read(),
                        os.path.basename(file) + "2",
                    )


def _relpath(path, start):
    # Avoids errors related to symlinks in `/tmp` directories
    return os.path.relpath(os.path.realpath(path), os.path.realpath(start))


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
