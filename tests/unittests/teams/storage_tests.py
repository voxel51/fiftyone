"""
FiftyOne storage-related unit tests.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
import pytest
import fiftyone.core.storage as fos
from unittest.mock import patch, MagicMock


supported_signed_urls = [
    "gs://bucket/path/to/image.jpeg",
]

unsupported_urls = ["https://[your-minio-server-domain]/bucket/image.jpeg"]

hours_values = [None, 1, 24, 48]


class CloudStorageTests(unittest.TestCase):
    def test_cloud_path_resolve(self):
        self.assertEqual(
            fos.abspath("gs://bucket/path/to/image.jpeg"),
            "gs://bucket/path/to/image.jpeg",
        )
        self.assertEqual(
            fos.abspath("gs://bucket/path/to/../image.jpeg"),
            "gs://bucket/path/image.jpeg",
        )
        self.assertEqual(
            fos.abspath("gs://bucket/path/./to/image.jpeg"),
            "gs://bucket/path/to/image.jpeg",
        )
        self.assertEqual(
            fos.abspath("gs://bucket/path/to/image.jpeg"),
            "gs://bucket/path/to/image.jpeg",
        )
        self.assertEqual(
            fos.abspath("gs://bucket/path/to/../../image.jpeg"),
            "gs://bucket/image.jpeg",
        )

    @pytest.mark.parametrize("url", supported_signed_urls)
    @pytest.mark.parametrize("hours", hours_values)
    @patch("fiftyone.core.storage.get_client")
    def test_get_url_with_ttl(self, mock_get_client, url=None, hours=None):
        mock_client = MagicMock()
        mock_client.generate_signed_url.return_value = MagicMock()
        mock_get_client.return_value = mock_client

        if hours:
            fos.get_url(url, hours=hours)
        else:
            fos.get_url(url)

        expected_hours = hours or 24
        mock_get_client.assert_called_once()
        mock_client.generate_signed_url.assert_called_with(
            url, hours=expected_hours
        )

    @pytest.mark.parametrize("url", unsupported_urls)
    @patch("fiftyone.core.storage.get_client")
    def test_get_signed_url_unsupported(self, mock_get_client, url=None):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        delattr(mock_client, "generate_signed_url")

        with pytest.raises(ValueError):
            fos.get_url(url)
