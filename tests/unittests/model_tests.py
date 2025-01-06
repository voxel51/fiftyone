"""
FiftyOne model inference unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import random
import string
import unittest

import numpy as np

import eta.core.utils as etau
import eta.core.video as etav

import fiftyone as fo
import fiftyone.utils.image as foui

from decorators import drop_datasets


class MockImageModel(fo.EmbeddingsMixin, fo.Model):
    @property
    def media_type(self):
        return "image"

    @property
    def has_embeddings(self):
        return True

    @property
    def ragged_batches(self):
        return True  # no batching

    @property
    def transforms(self):
        return None

    @property
    def preprocess(self):
        return False

    @preprocess.setter
    def preprocess(self, value):
        pass

    def predict(self, arg):
        return fo.Classification(label="foo")

    def get_embeddings(self):
        return np.random.randn(128)


class MockBatchImageModel(MockImageModel):
    @property
    def ragged_batches(self):
        return False  # allow batching


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


class ImageModelTests(ImageDatasetTests):
    def _make_dataset(self):
        samples = []
        for _ in range(5):
            sample = fo.Sample(
                filepath=self._new_image(),
                patches=fo.Detections(
                    detections=[
                        fo.Detection(bounding_box=[0.1, 0.1, 0.4, 0.2]),
                        fo.Detection(bounding_box=[0.3, 0.3, 0.2, 0.4]),
                        fo.Detection(bounding_box=[0.5, 0.5, 0.5, 0.5]),
                    ],
                ),
            )
            samples.append(sample)

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        return dataset

    def _test_model(self, model, batch_size=None):
        dataset = self._make_dataset()

        # Model inference

        dataset.apply_model(
            model, label_field="predictions", batch_size=batch_size
        )
        self.assertEqual(len(dataset.exists("predictions")), 5)

        # Embeddings

        embeddings = dataset.compute_embeddings(model, batch_size=batch_size)
        self.assertEqual(embeddings.shape, (5, 128))

        dataset.compute_embeddings(
            model, embeddings_field="embeddings", batch_size=batch_size
        )
        self.assertEqual(len(dataset.exists("embeddings")), 5)

        # Patch embeddings

        embeddings = dataset.compute_patch_embeddings(
            model, "patches", batch_size=batch_size
        )
        self.assertEqual(len(embeddings), 5)
        for e in embeddings.values():
            self.assertEqual(e.shape, (3, 128))

        dataset.compute_patch_embeddings(
            model,
            "patches",
            embeddings_field="embeddings",
            batch_size=batch_size,
        )
        self.assertEqual(dataset.count("patches.detections.embeddings"), 15)

    @drop_datasets
    def test_image_model(self):
        model = MockImageModel()
        self._test_model(model)

    @drop_datasets
    def test_image_model_batch(self):
        model = MockBatchImageModel()
        self._test_model(model, batch_size=2)


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


class VideoModelTests(VideoDatasetTests):
    def _make_dataset(self):
        samples = []
        for i in range(5):
            sample = fo.Sample(filepath=self._new_video())
            sample.frames[i + 1] = fo.Frame(
                patches=fo.Detections(
                    detections=[
                        fo.Detection(bounding_box=[0.1, 0.1, 0.4, 0.2]),
                        fo.Detection(bounding_box=[0.3, 0.3, 0.2, 0.4]),
                        fo.Detection(bounding_box=[0.5, 0.5, 0.5, 0.5]),
                    ],
                ),
            )
            samples.append(sample)

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        dataset.compute_metadata()

        return dataset

    def _test_model(self, model, batch_size=None):
        dataset = self._make_dataset()

        # Model inference

        dataset.apply_model(
            model, label_field="predictions", batch_size=batch_size
        )
        self.assertEqual(dataset.count("frames.predictions"), 25)

        # Embeddings

        embeddings = dataset.compute_embeddings(model, batch_size=batch_size)
        self.assertEqual(len(embeddings), 5)
        for e in embeddings.values():
            self.assertEqual(e.shape, (5, 128))

        dataset.compute_embeddings(
            model, embeddings_field="embeddings", batch_size=batch_size
        )
        self.assertEqual(dataset.count("frames.embeddings"), 25)

        # Patch embeddings

        embeddings = dataset.compute_patch_embeddings(
            model, "patches", batch_size=batch_size
        )
        self.assertEqual(len(embeddings), 5)
        for sample_embeddings in embeddings.values():
            self.assertEqual(len(sample_embeddings), 5)
            for e in sample_embeddings.values():
                # only one frame per video has patches
                if e is not None:
                    self.assertEqual(e.shape, (3, 128))

        dataset.compute_patch_embeddings(
            model,
            "patches",
            embeddings_field="embeddings",
            batch_size=batch_size,
        )
        self.assertEqual(
            dataset.count("frames.patches.detections.embeddings"),
            15,  # only one frame per video has patches
        )

    @drop_datasets
    def test_image_model_frames(self):
        model = MockImageModel()
        self._test_model(model)

    @drop_datasets
    def test_image_model_frames_batch(self):
        model = MockBatchImageModel()
        self._test_model(model, batch_size=2)
