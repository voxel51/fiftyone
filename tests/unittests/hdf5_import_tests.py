"""
Unit tests for HDF5 import functionality.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import tempfile
import unittest

import numpy as np

try:
    import h5py

    HAS_H5PY = True
except ImportError:
    HAS_H5PY = False

import fiftyone as fo
import fiftyone.core.labels as fol


def _create_hdf5_pixel_images(hdf5_path, num_images=5, height=32, width=32):
    """Creates a test HDF5 file with pixel-array images."""
    with h5py.File(hdf5_path, "w") as f:
        images = np.random.randint(
            0, 255, (num_images, height, width, 3), dtype=np.uint8
        )
        f.create_dataset("images", data=images)
    return num_images


def _create_hdf5_with_labels(
    hdf5_path, num_images=5, height=32, width=32, labels=None
):
    """Creates a test HDF5 file with pixel-array images and string labels."""
    if labels is None:
        labels = ["cat", "dog", "bird", "cat", "dog"][:num_images]

    with h5py.File(hdf5_path, "w") as f:
        images = np.random.randint(
            0, 255, (num_images, height, width, 3), dtype=np.uint8
        )
        f.create_dataset("images", data=images)

        dt = h5py.string_dtype()
        labels_ds = f.create_dataset("labels", (num_images,), dtype=dt)
        for i, label in enumerate(labels):
            labels_ds[i] = label

    return num_images, labels


def _create_hdf5_with_int_labels(hdf5_path, num_images=5, height=32, width=32):
    """Creates a test HDF5 file with pixel-array images and integer labels."""
    with h5py.File(hdf5_path, "w") as f:
        images = np.random.randint(
            0, 255, (num_images, height, width, 3), dtype=np.uint8
        )
        f.create_dataset("images", data=images)
        int_labels = np.array([0, 1, 2, 0, 1][:num_images], dtype=np.int64)
        f.create_dataset("labels", data=int_labels)

    return num_images


def _create_hdf5_grayscale(hdf5_path, num_images=5, height=32, width=32):
    """Creates a test HDF5 file with grayscale pixel-array images."""
    with h5py.File(hdf5_path, "w") as f:
        images = np.random.randint(
            0, 255, (num_images, height, width), dtype=np.uint8
        )
        f.create_dataset("images", data=images)
    return num_images


def _create_hdf5_custom_keys(
    hdf5_path, images_key="data", labels_key="targets", num_images=5
):
    """Creates a test HDF5 file with custom key names."""
    with h5py.File(hdf5_path, "w") as f:
        images = np.random.randint(
            0, 255, (num_images, 32, 32, 3), dtype=np.uint8
        )
        f.create_dataset(images_key, data=images)

        dt = h5py.string_dtype()
        labels_ds = f.create_dataset(labels_key, (num_images,), dtype=dt)
        for i in range(num_images):
            labels_ds[i] = "class_%d" % i

    return num_images


def _create_hdf5_encoded_images(hdf5_path, num_images=5):
    """Creates a test HDF5 file with JPEG-encoded images stored as
    variable-length byte strings.
    """
    import cv2

    with h5py.File(hdf5_path, "w") as f:
        dt = h5py.vlen_dtype(np.dtype("uint8"))
        images_ds = f.create_dataset("images", (num_images,), dtype=dt)
        for i in range(num_images):
            img = np.random.randint(0, 255, (32, 32, 3), dtype=np.uint8)
            _, encoded = cv2.imencode(".jpg", img)
            images_ds[i] = encoded.flatten()

    return num_images


@unittest.skipUnless(HAS_H5PY, "h5py is not installed")
class HDF5UnlabeledImportTests(unittest.TestCase):
    """Tests for importing unlabeled HDF5 datasets."""

    def setUp(self):
        self._tmp_dir = tempfile.mkdtemp()
        self._hdf5_path = os.path.join(self._tmp_dir, "data.h5")
        self._images_dir = os.path.join(self._tmp_dir, "images")
        os.makedirs(self._images_dir, exist_ok=True)

    def tearDown(self):
        import shutil

        shutil.rmtree(self._tmp_dir, ignore_errors=True)

    def test_unlabeled_pixel_images(self):
        """Test importing unlabeled pixel-array images from HDF5."""
        num_images = _create_hdf5_pixel_images(self._hdf5_path)

        dataset = fo.Dataset()
        dataset.add_dir(
            dataset_type=fo.types.HDF5Dataset,
            hdf5_path=self._hdf5_path,
            images_dir=self._images_dir,
        )

        self.assertEqual(len(dataset), num_images)
        for sample in dataset:
            self.assertTrue(os.path.isfile(sample.filepath))

        dataset.delete()

    def test_unlabeled_grayscale(self):
        """Test importing grayscale images from HDF5."""
        num_images = _create_hdf5_grayscale(self._hdf5_path)

        dataset = fo.Dataset()
        dataset.add_dir(
            dataset_type=fo.types.HDF5Dataset,
            hdf5_path=self._hdf5_path,
            images_dir=self._images_dir,
        )

        self.assertEqual(len(dataset), num_images)
        for sample in dataset:
            self.assertTrue(os.path.isfile(sample.filepath))

        dataset.delete()

    def test_unlabeled_encoded_images(self):
        """Test importing encoded (JPEG) images from HDF5."""
        num_images = _create_hdf5_encoded_images(self._hdf5_path)

        dataset = fo.Dataset()
        dataset.add_dir(
            dataset_type=fo.types.HDF5Dataset,
            hdf5_path=self._hdf5_path,
            images_dir=self._images_dir,
        )

        self.assertEqual(len(dataset), num_images)
        for sample in dataset:
            self.assertTrue(os.path.isfile(sample.filepath))

        dataset.delete()

    def test_max_samples(self):
        """Test importing with max_samples limit."""
        _create_hdf5_pixel_images(self._hdf5_path, num_images=10)

        dataset = fo.Dataset()
        dataset.add_dir(
            dataset_type=fo.types.HDF5Dataset,
            hdf5_path=self._hdf5_path,
            images_dir=self._images_dir,
            max_samples=3,
        )

        self.assertEqual(len(dataset), 3)

        dataset.delete()


@unittest.skipUnless(HAS_H5PY, "h5py is not installed")
class HDF5ClassificationImportTests(unittest.TestCase):
    """Tests for importing labeled HDF5 classification datasets."""

    def setUp(self):
        self._tmp_dir = tempfile.mkdtemp()
        self._hdf5_path = os.path.join(self._tmp_dir, "data.h5")
        self._images_dir = os.path.join(self._tmp_dir, "images")
        os.makedirs(self._images_dir, exist_ok=True)

    def tearDown(self):
        import shutil

        shutil.rmtree(self._tmp_dir, ignore_errors=True)

    def test_classification_with_string_labels(self):
        """Test importing classification dataset with string labels."""
        num_images, labels = _create_hdf5_with_labels(self._hdf5_path)

        dataset = fo.Dataset()
        dataset.add_dir(
            dataset_type=fo.types.HDF5ImageClassificationDataset,
            hdf5_path=self._hdf5_path,
            images_dir=self._images_dir,
        )

        self.assertEqual(len(dataset), num_images)

        for i, sample in enumerate(dataset):
            self.assertTrue(os.path.isfile(sample.filepath))
            self.assertIsInstance(sample.ground_truth, fol.Classification)
            self.assertEqual(sample.ground_truth.label, labels[i])

        dataset.delete()

    def test_classification_with_int_labels(self):
        """Test importing classification dataset with integer labels."""
        num_images = _create_hdf5_with_int_labels(self._hdf5_path)

        dataset = fo.Dataset()
        dataset.add_dir(
            dataset_type=fo.types.HDF5ImageClassificationDataset,
            hdf5_path=self._hdf5_path,
            images_dir=self._images_dir,
        )

        self.assertEqual(len(dataset), num_images)

        for sample in dataset:
            self.assertTrue(os.path.isfile(sample.filepath))
            self.assertIsInstance(sample.ground_truth, fol.Classification)
            # Integer labels should be converted to strings
            self.assertIn(sample.ground_truth.label, ["0", "1", "2"])

        dataset.delete()

    def test_custom_keys(self):
        """Test importing with custom HDF5 key names."""
        num_images = _create_hdf5_custom_keys(self._hdf5_path)

        dataset = fo.Dataset()
        dataset.add_dir(
            dataset_type=fo.types.HDF5ImageClassificationDataset,
            hdf5_path=self._hdf5_path,
            images_dir=self._images_dir,
            images_key="data",
            labels_key="targets",
        )

        self.assertEqual(len(dataset), num_images)

        for sample in dataset:
            self.assertTrue(os.path.isfile(sample.filepath))
            self.assertIsInstance(sample.ground_truth, fol.Classification)

        dataset.delete()

    def test_max_samples_labeled(self):
        """Test importing labeled dataset with max_samples limit."""
        _create_hdf5_with_labels(
            self._hdf5_path,
            num_images=10,
            labels=["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
        )

        dataset = fo.Dataset()
        dataset.add_dir(
            dataset_type=fo.types.HDF5ImageClassificationDataset,
            hdf5_path=self._hdf5_path,
            images_dir=self._images_dir,
            max_samples=4,
        )

        self.assertEqual(len(dataset), 4)

        dataset.delete()

    def test_force_rgb(self):
        """Test importing with force_rgb=True."""
        _create_hdf5_grayscale(self._hdf5_path)

        dataset = fo.Dataset()
        dataset.add_dir(
            dataset_type=fo.types.HDF5Dataset,
            hdf5_path=self._hdf5_path,
            images_dir=self._images_dir,
            force_rgb=True,
        )

        self.assertEqual(len(dataset), 5)

        dataset.delete()


@unittest.skipUnless(HAS_H5PY, "h5py is not installed")
class HDF5ErrorTests(unittest.TestCase):
    """Tests for error handling in HDF5 imports."""

    def setUp(self):
        self._tmp_dir = tempfile.mkdtemp()
        self._hdf5_path = os.path.join(self._tmp_dir, "data.h5")
        self._images_dir = os.path.join(self._tmp_dir, "images")
        os.makedirs(self._images_dir, exist_ok=True)

    def tearDown(self):
        import shutil

        shutil.rmtree(self._tmp_dir, ignore_errors=True)

    def test_missing_images_key(self):
        """Test error when images key is missing from HDF5 file."""
        with h5py.File(self._hdf5_path, "w") as f:
            f.create_dataset("other_key", data=np.zeros((5, 32, 32, 3)))

        from fiftyone.utils.hdf5 import from_hdf5

        with self.assertRaises(ValueError):
            list(from_hdf5(self._hdf5_path, images_key="images"))

    def test_missing_labels_key(self):
        """Test error when labels key is missing from HDF5 file."""
        with h5py.File(self._hdf5_path, "w") as f:
            f.create_dataset("images", data=np.zeros((5, 32, 32, 3)))

        from fiftyone.utils.hdf5 import from_hdf5

        with self.assertRaises(ValueError):
            list(
                from_hdf5(
                    self._hdf5_path,
                    images_key="images",
                    labels_key="missing_labels",
                )
            )

    def test_mismatched_lengths(self):
        """Test error when images and labels have different lengths."""
        with h5py.File(self._hdf5_path, "w") as f:
            f.create_dataset("images", data=np.zeros((5, 32, 32, 3)))
            dt = h5py.string_dtype()
            labels_ds = f.create_dataset("labels", (3,), dtype=dt)
            for i in range(3):
                labels_ds[i] = "label_%d" % i

        from fiftyone.utils.hdf5 import from_hdf5

        with self.assertRaises(ValueError):
            list(
                from_hdf5(
                    self._hdf5_path,
                    images_key="images",
                    labels_key="labels",
                )
            )

    def test_missing_both_paths(self):
        """Test error when neither dataset_dir nor hdf5_path is provided."""
        from fiftyone.utils.hdf5 import HDF5ImageDatasetImporter

        with self.assertRaises(ValueError):
            HDF5ImageDatasetImporter()


@unittest.skipUnless(HAS_H5PY, "h5py is not installed")
class HDF5FromDirTests(unittest.TestCase):
    """Tests for using fo.Dataset.from_dir() with HDF5 types."""

    def setUp(self):
        self._tmp_dir = tempfile.mkdtemp()
        self._hdf5_path = os.path.join(self._tmp_dir, "data.h5")
        self._images_dir = os.path.join(self._tmp_dir, "images")
        os.makedirs(self._images_dir, exist_ok=True)

    def tearDown(self):
        import shutil

        shutil.rmtree(self._tmp_dir, ignore_errors=True)

    def test_from_dir_unlabeled(self):
        """Test fo.Dataset.from_dir() with HDF5Dataset."""
        num_images = _create_hdf5_pixel_images(self._hdf5_path)

        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.HDF5Dataset,
            hdf5_path=self._hdf5_path,
            images_dir=self._images_dir,
        )

        self.assertEqual(len(dataset), num_images)

        dataset.delete()

    def test_from_dir_labeled(self):
        """Test fo.Dataset.from_dir() with HDF5ImageClassificationDataset."""
        num_images, labels = _create_hdf5_with_labels(self._hdf5_path)

        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.HDF5ImageClassificationDataset,
            hdf5_path=self._hdf5_path,
            images_dir=self._images_dir,
        )

        self.assertEqual(len(dataset), num_images)

        for i, sample in enumerate(dataset):
            self.assertIsInstance(sample.ground_truth, fol.Classification)
            self.assertEqual(sample.ground_truth.label, labels[i])

        dataset.delete()

    def test_from_dir_auto_images_dir(self):
        """Test that images_dir is auto-created when not specified."""
        _create_hdf5_pixel_images(self._hdf5_path, num_images=3)

        dataset = fo.Dataset.from_dir(
            dataset_type=fo.types.HDF5Dataset,
            hdf5_path=self._hdf5_path,
        )

        self.assertEqual(len(dataset), 3)

        dataset.delete()


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main()
