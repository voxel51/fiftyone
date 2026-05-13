"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest.mock import Mock

from fiftyone.multimodal.metadata import MultimodalMetadata
from fiftyone.multimodal.schemas.v1 import SourceFingerprint


class TestMultimodalMetadata:
    class TestBuildForSceneInventory:
        def test_populates_base_metadata_fields(self):
            inventory = Mock(
                scene_id="some_scene_id",
                source_format="some_format",
                source_fingerprint=SourceFingerprint(size_bytes=2342),
                inventory_version="some_version",
                streams=[],
                produced_by="some_producer",
                produced_at="2011-11-04T00:05:23+00:00",
            )

            metadata = MultimodalMetadata.build_for_scene_inventory(inventory)

            assert metadata.size_bytes == 2342
            assert metadata.mime_type == "application/octet-stream"

        def test_handles_malformed_produced_at(self):
            inventory = Mock(
                scene_id="some_scene_id",
                source_format="some_format",
                source_fingerprint=SourceFingerprint(size_bytes=2342),
                inventory_version="some_version",
                streams=[],
                produced_by="some_producer",
                produced_at="not a real datetime",
            )

            metadata = MultimodalMetadata.build_for_scene_inventory(inventory)

            assert metadata.produced_at is None
