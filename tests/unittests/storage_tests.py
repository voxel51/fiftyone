"""
FiftyOne storage-related unit tests.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone.core.storage as fos


class CloudStorageTests(unittest.TestCase):
    def test_cloud_path_resolve(self):
        self.assertEqual(
            fos.resolve("gs://bucket/path/to/image.jpeg"),
            "gs://bucket/path/to/image.jpeg",
        )
        self.assertEqual(
            fos.resolve("gs://bucket/path/to/../image.jpeg"),
            "gs://bucket/path/image.jpeg",
        )
        self.assertEqual(
            fos.resolve("gs://bucket/path/./to/image.jpeg"),
            "gs://bucket/path/to/image.jpeg",
        )
        self.assertEqual(
            fos.resolve("gs://bucket/path/to/image.jpeg"),
            "gs://bucket/path/to/image.jpeg",
        )
        self.assertEqual(
            fos.resolve("gs://bucket/path/to/../../image.jpeg"),
            "gs://bucket/image.jpeg",
        )
