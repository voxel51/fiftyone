"""
| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest.mock import Mock, patch

import pytest

from fiftyone.multimodal.adapters.formats import SceneFormat
from fiftyone.multimodal.adapters.mcap import McapAdapter
from fiftyone.multimodal.schemas.v1.__generated__.common_pb2 import (
    PayloadDescriptor,
    SourceFingerprint,
)
from fiftyone.multimodal.schemas.v1.__generated__.inventory_pb2 import (
    SceneInventory,
    StreamInventory,
)


@pytest.fixture(name="datetime")
def fixture_datetime():
    with patch("fiftyone.multimodal.adapters.mcap.datetime") as mock:
        yield mock


class TestMcapAdapter:
    class TestReadSceneInventory:
        def test_success(self, datetime):
            schema = Mock(encoding="json")
            schema.name = "this_schema"  # 'name' is used by the constructor

            stream_metadata = {"some_key": "some_value"}
            summary = Mock(
                channels={
                    "channel_id": Mock(
                        schema_id="schema_id", metadata=stream_metadata
                    )
                },
                schemas={"schema_id": schema},
                statistics=Mock(
                    message_start_time=51,
                    message_end_time=52,
                    channel_message_counts={"channel_id": 435},
                ),
            )
            datetime.datetime.now.return_value = Mock(
                isoformat=lambda: "now now now"
            )

            ###
            inventory = McapAdapter._read_scene_inventory(
                summary=summary,
                scene_id="some_id",
                size=10,
                first_chunk_crc=5,
                last_chunk_crc=15,
            )
            ###

            assert isinstance(inventory, SceneInventory)
            assert inventory.scene_id == "some_id"
            assert inventory.source_format == SceneFormat.MCAP
            assert inventory.source_fingerprint == SourceFingerprint(
                size_bytes=10, first_chunk_crc=5, last_chunk_crc=15
            )
            assert inventory.inventory_version == "1.0"
            assert inventory.streams == [
                StreamInventory(
                    stream_id="channel_id",
                    payload=PayloadDescriptor(
                        encoding="json",
                        schema="this_schema",
                        schema_encoding=None,
                    ),
                    record_count=435,
                    metadata=stream_metadata,
                )
            ]
            assert inventory.static_coordinate_frame_edges == []
            assert inventory.produced_at == "now now now"
            assert inventory.produced_by == "McapAdapter 1.0"

        def test_missing_statistics(self, datetime):
            schema = Mock(encoding="json")
            schema.name = "this_schema"  # 'name' is used by the constructor

            stream_metadata = {"some_key": "some_value"}
            summary = Mock(
                channels={
                    "channel_id": Mock(
                        schema_id="schema_id", metadata=stream_metadata
                    )
                },
                schemas={"schema_id": schema},
                statistics=None,
            )
            datetime.datetime.now.return_value = Mock(
                isoformat=lambda: "now now now"
            )

            ###
            inventory = McapAdapter._read_scene_inventory(
                summary=summary,
                scene_id="some_id",
                size=10,
                first_chunk_crc=5,
                last_chunk_crc=15,
            )
            ###

            assert isinstance(inventory, SceneInventory)
            assert inventory.scene_id == "some_id"
            assert inventory.source_format == SceneFormat.MCAP
            assert inventory.source_fingerprint == SourceFingerprint(
                size_bytes=10, first_chunk_crc=5, last_chunk_crc=15
            )
            assert inventory.inventory_version == "1.0"
            assert inventory.streams == [
                StreamInventory(
                    stream_id="channel_id",
                    payload=PayloadDescriptor(
                        encoding="json",
                        schema="this_schema",
                        schema_encoding=None,
                    ),
                    record_count=0,
                    metadata=stream_metadata,
                )
            ]
            assert inventory.static_coordinate_frame_edges == []
            assert inventory.produced_at == "now now now"
            assert inventory.produced_by == "McapAdapter 1.0"
