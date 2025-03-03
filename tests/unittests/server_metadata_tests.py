import unittest
from unittest.mock import patch

from fiftyone.server.metadata import resolve_media_alias_for_svc_worker
import fiftyone as fo


class TestResolveMediaAliasForSvcWorker(unittest.TestCase):
    def test_no_alias(self):
        url = "http://localhost:5151/media/filename.jpg"
        unaliased = resolve_media_alias_for_svc_worker(url)
        self.assertEqual(unaliased, url)

    def test_alias(self):
        with patch.object(
            fo.config, "svc_worker_media_alias", "voxel51://"
        ), patch.object(
            fo.config,
            "svc_worker_media_endpoint",
            "https://localhost:5151/",
        ):
            url = "voxel51://media/filename.jpg"
            unaliased = resolve_media_alias_for_svc_worker(url)
            self.assertEqual(
                unaliased, "https://localhost:5151/media/filename.jpg"
            )
