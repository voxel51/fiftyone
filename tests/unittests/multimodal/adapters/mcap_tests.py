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
    TimeTrack,
    TimeValueRange,
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
            schema = Mock(encoding="schema's encoding")
            schema.name = (
                "this_schema"  # 'name' is used by the Mock constructor
            )

            stream_metadata = {"some_key": "some_value"}
            summary = Mock(
                channels={
                    "channel_id": Mock(
                        topic="some_topic",
                        schema_id=1,
                        metadata=stream_metadata,
                        message_encoding="some_encoding",
                    )
                },
                schemas={1: schema},
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
            assert inventory.time_tracks == [
                TimeTrack(value_range=TimeValueRange(start=51, end=52))
            ]
            assert inventory.streams == [
                StreamInventory(
                    stream_id="channel_id",
                    display_name="some_topic",
                    payload=PayloadDescriptor(
                        encoding="some_encoding",
                        schema="this_schema",
                        schema_encoding="schema's encoding",
                    ),
                    record_count=435,
                    metadata=stream_metadata,
                )
            ]
            assert inventory.static_coordinate_frame_edges == []
            assert inventory.produced_at == "now now now"
            assert inventory.produced_by == "McapAdapter 1.0"

        def test_missing_summary(self):
            ###
            inventory = McapAdapter._read_scene_inventory(
                summary=None,
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
            assert inventory.time_tracks == []
            assert inventory.streams == []
            assert inventory.static_coordinate_frame_edges == []
            assert inventory.produced_at
            assert inventory.produced_by == "McapAdapter 1.0"

        def test_missing_statistics(self, datetime):
            schema = Mock(encoding="schema's encoding")
            schema.name = (
                "this_schema"  # 'name' is used by the Mock constructor
            )

            stream_metadata = {"some_key": "some_value"}
            summary = Mock(
                channels={
                    "channel_id": Mock(
                        topic="some_topic",
                        schema_id=2,
                        metadata=stream_metadata,
                        message_encoding="some_encoding",
                    )
                },
                schemas={2: schema},
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
            assert inventory.time_tracks == []
            assert inventory.streams == [
                StreamInventory(
                    stream_id="channel_id",
                    display_name="some_topic",
                    payload=PayloadDescriptor(
                        encoding="some_encoding",
                        schema="this_schema",
                        schema_encoding="schema's encoding",
                    ),
                    record_count=0,
                    metadata=stream_metadata,
                )
            ]
            assert inventory.static_coordinate_frame_edges == []
            assert inventory.produced_at == "now now now"
            assert inventory.produced_by == "McapAdapter 1.0"

        def test_schemaless_channel(self, datetime):
            stream_metadata = {"some_key": "some_value"}
            summary = Mock(
                channels={
                    "channel_id": Mock(
                        topic="some_topic",
                        schema_id=0,
                        metadata=stream_metadata,
                        message_encoding="some_encoding",
                    )
                },
                schemas={},
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
            assert inventory.time_tracks == []
            assert inventory.streams == [
                StreamInventory(
                    stream_id="channel_id",
                    display_name="some_topic",
                    payload=PayloadDescriptor(
                        encoding="some_encoding",
                        schema=None,
                        schema_encoding=None,
                    ),
                    record_count=0,
                    metadata=stream_metadata,
                )
            ]
            assert inventory.static_coordinate_frame_edges == []
            assert inventory.produced_at == "now now now"
            assert inventory.produced_by == "McapAdapter 1.0"

        def test_missing_schema(self, datetime):
            schema = Mock(encoding="schema's encoding")
            schema.name = (
                "this_schema"  # 'name' is used by the Mock constructor
            )

            stream_metadata = {"some_key": "some_value"}
            summary = Mock(
                channels={
                    "channel_id": Mock(
                        topic="some_topic",
                        schema_id=1,
                        metadata=stream_metadata,
                        message_encoding="some_encoding",
                    )
                },
                schemas={},
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
            assert inventory.time_tracks == [
                TimeTrack(value_range=TimeValueRange(start=51, end=52))
            ]
            assert inventory.streams == [
                StreamInventory(
                    stream_id="channel_id",
                    display_name="some_topic",
                    payload=PayloadDescriptor(encoding="some_encoding"),
                    record_count=435,
                    metadata=stream_metadata,
                )
            ]
            assert inventory.static_coordinate_frame_edges == []
            assert inventory.produced_at == "now now now"
            assert inventory.produced_by == "McapAdapter 1.0"
