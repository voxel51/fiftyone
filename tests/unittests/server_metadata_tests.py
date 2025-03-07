import unittest
from unittest.mock import patch

from fiftyone.server.metadata import resolve_media_alias_to_url
import fiftyone as fo


class TestResolveMediaAliasForSvcWorker(unittest.TestCase):
    def test_no_alias(self):
        url = "http://localhost:5151/media/filename.jpg"
        unaliased = resolve_media_alias_to_url(url)
        self.assertEqual(unaliased, url)

    def test_alias(self):
        with patch.object(
            fo.config, "media_filepath_prefix_alias", "voxel51://"
        ), patch.object(
            fo.config,
            "media_filepath_prefix_url",
            "https://localhost:5151/",
        ):
            url = "voxel51://media/filename.jpg"
            unaliased = resolve_media_alias_to_url(url)
            self.assertEqual(
                unaliased, "https://localhost:5151/media/filename.jpg"
            )

    def test_replace_only_prefix(self):
        with patch.object(
            fo.config, "media_filepath_prefix_alias", "gs"
        ), patch.object(
            fo.config,
            "media_filepath_prefix_url",
            "www.googleapis.com/storage",
        ):
            url = "gs/media/gs/dogs.jpg"
            unaliased = resolve_media_alias_to_url(url)
            self.assertEqual(
                unaliased, "www.googleapis.com/storage/media/gs/dogs.jpg"
            )
