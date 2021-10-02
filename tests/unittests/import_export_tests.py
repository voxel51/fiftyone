"""
FiftyOne import/export-related unit tests.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import random
import string
import unittest

import numpy as np
import pytest

import eta.core.image as etai
import eta.core.utils as etau
import eta.core.video as etav

import fiftyone as fo

from decorators import drop_datasets


class ImageDatasetTests(unittest.TestCase):
    def setUp(self):
        temp_dir = etau.TempDir()
        tmp_dir = temp_dir.__enter__()
        ref_image_path = os.path.join(tmp_dir, "_ref_image.jpg")
        images_dir = os.path.join(tmp_dir, "_images")

        img = np.random.randint(255, size=(480, 640, 3), dtype=np.uint8)
        etai.write(img, ref_image_path)

        self._temp_dir = temp_dir
        self._tmp_dir = tmp_dir
        self._ref_image_path = ref_image_path
        self.images_dir = images_dir

    def tearDown(self):
        self._temp_dir.__exit__()

    def _new_image(self):
        filepath = os.path.join(
            self.images_dir,
            self._new_name() + os.path.splitext(self._ref_image_path)[1],
        )

        etau.copy_file(self._ref_image_path, filepath)
        return filepath

    def _new_name(self):
        return "".join(
            random.choice(string.ascii_lowercase + string.digits)
            for _ in range(24)
        )

    def _new_dir(self):
        return os.path.join(self._tmp_dir, self._new_name())


class DuplicateImageExportTests(ImageDatasetTests):
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
                        label="cat", bounding_box=[0.1, 0.1, 0.4, 0.4],
                    ),
                    fo.Detection(
                        label="dog", bounding_box=[0.5, 0.5, 0.4, 0.4],
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
            export_dir=export_dir, dataset_type=fo.types.COCODetectionDataset,
        )

        #
        # Multiple compatible field types exist, but the first one is still
        # chosen and used
        #

        dataset.clone_sample_field("ground_truth", "predictions")

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir, dataset_type=fo.types.COCODetectionDataset,
        )

    @drop_datasets
    def test_patch_exports(self):
        sample = fo.Sample(
            filepath=self._new_image(),
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat", bounding_box=[0.1, 0.1, 0.4, 0.4],
                    ),
                    fo.Detection(
                        label="dog", bounding_box=[0.5, 0.5, 0.4, 0.4],
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
            export_dir=export_dir, dataset_type=fo.types.ImageDirectory,
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
            dataset_dir=export_dir, dataset_type=fo.types.ImageDirectory,
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

    @drop_datasets
    def test_single_label_to_lists(self):
        sample = fo.Sample(
            filepath=self._new_image(),
            ground_truth=fo.Detection(
                label="cat", bounding_box=[0.1, 0.1, 0.4, 0.4],
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
            filepath=self._new_image(), animal=fo.Classification(label="cat"),
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
            label_field="animal",
        )

        bounding_box = dataset2.first().animal.detections[0].bounding_box
        self.assertTrue(np.allclose(bounding_box, [0, 0, 1, 1]))


class UnlabeledImageDatasetTests(ImageDatasetTests):
    def _make_dataset(self):
        samples = [fo.Sample(filepath=self._new_image()) for _ in range(5)]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        return dataset

    @drop_datasets
    def test_image_directory(self):
        dataset = self._make_dataset()
        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir, dataset_type=fo.types.ImageDirectory,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir, dataset_type=fo.types.ImageDirectory,
        )

        self.assertEqual(len(dataset), len(dataset2))


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
            set(dataset.values("filepath")), set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("predictions"), dataset2.count("predictions"),
        )

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


class ImageDetectionDatasetTests(ImageDatasetTests):
    def _make_dataset(self):
        samples = [
            fo.Sample(
                filepath=self._new_image(),
                predictions=fo.Detections(
                    detections=[
                        fo.Detection(
                            label="cat", bounding_box=[0.1, 0.1, 0.4, 0.4],
                        ),
                        fo.Detection(
                            label="dog", bounding_box=[0.5, 0.5, 0.4, 0.4],
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
            set(dataset.values("filepath")), set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

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
            export_dir=export_dir, dataset_type=fo.types.COCODetectionDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.COCODetectionDataset,
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
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")), set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

    @drop_datasets
    def test_voc_detection_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        view = dataset.limit(2)
        view.export(
            export_dir=export_dir, dataset_type=fo.types.VOCDetectionDataset,
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
            export_dir=export_dir, dataset_type=fo.types.VOCDetectionDataset,
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
            dataset_type=fo.types.VOCDetectionDataset, labels_path=labels_path,
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
            set(dataset.values("filepath")), set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

    @drop_datasets
    def test_kitti_detection_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        view = dataset.limit(2)
        view.export(
            export_dir=export_dir, dataset_type=fo.types.KITTIDetectionDataset,
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
            export_dir=export_dir, dataset_type=fo.types.KITTIDetectionDataset,
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
            dataset_type=fo.types.KITTIDetectionDataset,
            labels_path=labels_path,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.KITTIDetectionDataset,
            data_path=data_path,
            labels_path=labels_path,
            label_field="predictions",
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")), set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

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
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
        )

    @drop_datasets
    def test_yolov5_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir, dataset_type=fo.types.YOLOv5Dataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.YOLOv5Dataset,
            label_field="predictions",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("predictions.detections"),
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

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.ImageSegmentationDirectory,
            label_field="segmentations",
        )

        self.assertEqual(len(view), len(dataset2))
        self.assertEqual(
            view.count("segmentations.mask"),
            dataset2.count("segmentations.mask"),
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

        dataset2 = fo.Dataset.from_dir(
            dataset_type=fo.types.ImageSegmentationDirectory,
            data_path=data_path,
            labels_path=labels_path,
            label_field="segmentations",
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")), set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("segmentations.mask"),
            dataset2.count("segmentations.mask"),
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
            labels_path=labels_path, dataset_type=fo.types.GeoJSONDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            data_path=data_path,
            labels_path=labels_path,
            dataset_type=fo.types.GeoJSONDataset,
            location_field="coordinates",
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertSetEqual(
            set(dataset.values("filepath")), set(dataset2.values("filepath")),
        )
        self.assertEqual(
            dataset.count("coordinates"), dataset2.count("coordinates")
        )


skipwindows = pytest.mark.skipif(
    os.name == "nt", reason="Windows hangs in workflows, fix me"
)


class MultitaskImageDatasetTests(ImageDatasetTests):
    def _make_dataset(self):
        samples = [
            fo.Sample(
                filepath=self._new_image(),
                weather=fo.Classification(label="sunny", confidence=0.9),
                predictions=fo.Detections(
                    detections=[
                        fo.Detection(
                            label="cat", bounding_box=[0.1, 0.1, 0.4, 0.4],
                        ),
                        fo.Detection(
                            label="dog", bounding_box=[0.5, 0.5, 0.4, 0.4],
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
            dataset.count("weather"), dataset2.count("attributes"),
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

    @drop_datasets
    def test_bdd_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        view = dataset.limit(2)
        view.export(
            export_dir=export_dir, dataset_type=fo.types.BDDDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir, dataset_type=fo.types.BDDDataset,
        )

        self.assertEqual(len(view), len(dataset2))
        self.assertEqual(
            view.count("weather"), dataset2.count("attributes"),
        )
        self.assertEqual(
            view.count("predictions.detections"),
            dataset2.count("detections.detections"),
        )

        # Handle unlabeled data

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir, dataset_type=fo.types.BDDDataset,
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
            labels_path=labels_path, dataset_type=fo.types.BDDDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            data_path=data_path,
            labels_path=labels_path,
            dataset_type=fo.types.BDDDataset,
            include_all_data=True,
        )

        self.assertEqual(len(dataset), len(dataset2))
        self.assertEqual(
            dataset.count("weather"), dataset2.count("attributes"),
        )
        self.assertEqual(
            dataset.count("predictions.detections"),
            dataset2.count("detections.detections"),
        )

    @drop_datasets
    def test_cvat_image_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        view = dataset.limit(2)
        view.export(
            export_dir=export_dir, dataset_type=fo.types.CVATImageDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir, dataset_type=fo.types.CVATImageDataset,
        )

        self.assertEqual(len(view), len(dataset2))
        self.assertEqual(
            view.count("predictions.detections"),
            dataset2.count("detections.detections"),
        )

        # Handle unlabeled data

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir, dataset_type=fo.types.CVATImageDataset,
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
            labels_path=labels_path, dataset_type=fo.types.CVATImageDataset,
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

    @skipwindows
    @drop_datasets
    def test_fiftyone_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir, dataset_type=fo.types.FiftyOneDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir, dataset_type=fo.types.FiftyOneDataset,
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


class VideoDatasetTests(unittest.TestCase):
    def setUp(self):
        temp_dir = etau.TempDir()
        tmp_dir = temp_dir.__enter__()
        ref_video_path = os.path.join(tmp_dir, "_ref_video.mp4")
        videos_dir = os.path.join(tmp_dir, "_videos")

        with etav.FFmpegVideoWriter(ref_video_path, 5, (640, 480)) as writer:
            for _ in range(5):
                img = np.random.randint(
                    255, size=(480, 640, 3), dtype=np.uint8
                )
                writer.write(img)

        self._temp_dir = temp_dir
        self._tmp_dir = tmp_dir
        self._ref_video_path = ref_video_path
        self.videos_dir = videos_dir

    def tearDown(self):
        self._temp_dir.__exit__()

    def _new_video(self):
        filepath = os.path.join(
            self.videos_dir,
            self._new_name() + os.path.splitext(self._ref_video_path)[1],
        )

        etau.copy_file(self._ref_video_path, filepath)
        return filepath

    def _new_name(self):
        return "".join(
            random.choice(string.ascii_lowercase + string.digits)
            for _ in range(24)
        )

    def _new_dir(self):
        return os.path.join(self._tmp_dir, self._new_name())


class VideoExportCoersionTests(VideoDatasetTests):
    @drop_datasets
    def test_clip_exports(self):
        sample1 = fo.Sample(
            filepath=self._new_video(),
            predictions=fo.VideoClassifications(
                classifications=[
                    fo.VideoClassification(
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
                        label="cat", bounding_box=[0.1, 0.1, 0.4, 0.4],
                    ),
                    fo.Detection(
                        label="dog", bounding_box=[0.5, 0.5, 0.4, 0.4],
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
            predictions=fo.VideoClassifications(
                classifications=[
                    fo.VideoClassification(
                        label="cat", support=[1, 4], confidence=0.95,
                    ),
                    fo.VideoClassification(
                        label="dog", support=[2, 5], confidence=0.95,
                    ),
                ]
            ),
        )

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2])

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
            dataset_dir=export_dir, dataset_type=fo.types.VideoDirectory,
        )

        self.assertEqual(
            len(dataset2), dataset.count("predictions.classifications")
        )

        #
        # Export video classification clips in a VideoClassifications field
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
            len(dataset2), dataset.count("predictions.classifications")
        )

        #
        # Export video classification clips directly from a ClipsView
        #

        export_dir = self._new_dir()

        dataset.to_clips("predictions").export(
            export_dir=export_dir,
            dataset_type=fo.types.VideoClassificationDirectoryTree,
            label_field="predictions",
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir,
            dataset_type=fo.types.VideoClassificationDirectoryTree,
        )

        self.assertEqual(
            len(dataset2), dataset.count("predictions.classifications")
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
        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir, dataset_type=fo.types.VideoDirectory,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir, dataset_type=fo.types.VideoDirectory,
        )

        self.assertEqual(len(dataset), len(dataset2))


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
                            label="cat", support=[1, 4], confidence=0.95,
                        ),
                        fo.TemporalDetection(
                            label="dog", support=[2, 5], confidence=0.95,
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


class MultitaskVideoDatasetTests(VideoDatasetTests):
    def _make_dataset(self):
        sample1 = fo.Sample(filepath=self._new_video())
        sample1.frames[1] = fo.Frame(
            weather=fo.Classification(label="sunny", confidence=0.9),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat", bounding_box=[0.1, 0.1, 0.4, 0.4],
                    ),
                    fo.Detection(
                        label="dog", bounding_box=[0.5, 0.5, 0.4, 0.4],
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

    @drop_datasets
    def test_cvat_video_dataset(self):
        dataset = self._make_dataset()

        # Standard format

        export_dir = self._new_dir()

        view = dataset.limit(1)
        view.export(
            export_dir=export_dir, dataset_type=fo.types.CVATVideoDataset,
        )

        dataset2 = fo.Dataset.from_dir(
            dataset_dir=export_dir, dataset_type=fo.types.CVATVideoDataset,
        )

        self.assertEqual(len(view), len(dataset2))
        self.assertEqual(
            view.count("frames.predictions.detections"),
            dataset2.count("frames.detections.detections"),
        )

        # Handle unlabeled data

        export_dir = self._new_dir()

        dataset.export(
            export_dir=export_dir, dataset_type=fo.types.CVATVideoDataset,
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
            labels_path=labels_path, dataset_type=fo.types.CVATVideoDataset,
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


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
