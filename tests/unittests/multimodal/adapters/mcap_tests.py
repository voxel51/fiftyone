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


@pytest.fixture(name="now")
def fixture_now():
    with patch("fiftyone.multimodal.adapters.mcap.datetime") as mock:
        mock.datetime.now.return_value = Mock(isoformat=lambda: "now now now")
        yield mock


@pytest.fixture(name="stream_metadata")
def fixture_stream_metadata():
    return {"some_key": "some_value"}


@pytest.fixture(name="default_summary")
def fixture_default_summary(stream_metadata):
    schema = Mock(encoding="schema's encoding")
    schema.name = "this_schema"  # 'name' is used by the Mock constructor

    return Mock(
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


class TestMcapAdapter:
    @pytest.mark.usefixtures("now")
    class TestReadSceneInventory:
        def assert_inventory(self, inventory, **kwargs):
            assert isinstance(inventory, SceneInventory)

            default_expectations = {
                "inventory_id": "some_id now now now",
                "scene_id": "some_id",
                "source_format": SceneFormat.MCAP,
                "source_fingerprint": SourceFingerprint(
                    size_bytes=10, first_chunk_crc=5, last_chunk_crc=15
                ),
                "inventory_version": "1.0",
                "time_tracks": [
                    TimeTrack(value_range=TimeValueRange(start=51, end=52))
                ],
                "streams": [
                    StreamInventory(
                        stream_id="channel_id",
                        display_name="some_topic",
                        payload=PayloadDescriptor(
                            encoding="some_encoding",
                            schema="this_schema",
                            schema_encoding="schema's encoding",
                        ),
                        record_count=435,
                        metadata={"some_key": "some_value"},
                    )
                ],
                "static_coordinate_frame_edges": [],
                "produced_at": "now now now",
                "produced_by": "McapAdapter 1.0",
            }

            for key, value in {**default_expectations, **kwargs}.items():
                assert getattr(inventory, key) == value

        def test_success(self, default_summary):
            inventory = McapAdapter._read_scene_inventory(
                summary=default_summary,
                scene_id="some_id",
                size=10,
                first_chunk_crc=5,
                last_chunk_crc=15,
            )

            self.assert_inventory(inventory)

        def test_missing_summary(self):
            inventory = McapAdapter._read_scene_inventory(
                summary=None,
                scene_id="some_id",
                size=10,
                first_chunk_crc=5,
                last_chunk_crc=15,
            )

            self.assert_inventory(inventory, time_tracks=[], streams=[])

        def test_missing_statistics(self, default_summary, stream_metadata):
            default_summary.statistics = None

            inventory = McapAdapter._read_scene_inventory(
                summary=default_summary,
                scene_id="some_id",
                size=10,
                first_chunk_crc=5,
                last_chunk_crc=15,
            )

            self.assert_inventory(
                inventory,
                time_tracks=[],
                streams=[
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
                ],
            )

        def test_schemaless_channel(self, default_summary, stream_metadata):
            default_summary.channels["channel_id"].schema_id = 0

            inventory = McapAdapter._read_scene_inventory(
                summary=default_summary,
                scene_id="some_id",
                size=10,
                first_chunk_crc=5,
                last_chunk_crc=15,
            )

            self.assert_inventory(
                inventory,
                streams=[
                    StreamInventory(
                        stream_id="channel_id",
                        display_name="some_topic",
                        payload=PayloadDescriptor(encoding="some_encoding"),
                        record_count=435,
                        metadata=stream_metadata,
                    )
                ],
            )

        def test_missing_schema(self, default_summary, stream_metadata):
            default_summary.schemas = {}

            inventory = McapAdapter._read_scene_inventory(
                summary=default_summary,
                scene_id="some_id",
                size=10,
                first_chunk_crc=5,
                last_chunk_crc=15,
            )

            self.assert_inventory(
                inventory,
                streams=[
                    StreamInventory(
                        stream_id="channel_id",
                        display_name="some_topic",
                        payload=PayloadDescriptor(encoding="some_encoding"),
                        record_count=435,
                        metadata=stream_metadata,
                    )
                ],
            )
