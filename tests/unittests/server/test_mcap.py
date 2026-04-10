"""
FiftyOne Server MCAP adapter unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from types import SimpleNamespace

import fiftyone.server.mcap as fosm


class _FakeReader:
    def __init__(self, summary=None, messages=None):
        self._summary = summary
        self._messages = messages or []

    def get_summary(self):
        return self._summary

    def iter_messages(
        self,
        topics=None,
        start_time=None,
        end_time=None,
        log_time_order=False,
    ):
        del log_time_order

        for schema, channel, message in self._messages:
            if topics is not None and not any(
                channel.topic == topic for topic in topics
            ):
                continue

            if start_time is not None and message.log_time < start_time:
                continue

            if end_time is not None and message.log_time >= end_time:
                continue

            yield schema, channel, message


def _make_schema(schema_id, name, encoding="ros2msg"):
    return SimpleNamespace(id=schema_id, name=name, encoding=encoding)


def _make_channel(
    channel_id, topic, schema_id, message_encoding="cdr", metadata=None
):
    return SimpleNamespace(
        id=channel_id,
        topic=topic,
        schema_id=schema_id,
        message_encoding=message_encoding,
        metadata=metadata or {},
    )


def _make_message(log_time, publish_time, data=b"payload", sequence=0):
    return SimpleNamespace(
        log_time=log_time,
        publish_time=publish_time,
        data=data,
        sequence=sequence,
    )


class TestMcapModule:
    """Tests for the internal MCAP adapter helpers."""

    def test_resolve_stream_role(self):
        """Supported schemas resolve to their playback roles."""
        assert (
            fosm._resolve_stream_role("sensor_msgs/msg/CompressedImage")
            == "image_stream"
        )
        assert (
            fosm._resolve_stream_role("sensor_msgs/msg/PointCloud2")
            == "pointcloud_stream"
        )
        assert fosm._resolve_stream_role("std_msgs/msg/String") is None

    def test_build_playback_plan(self):
        """Playback plans map supported stream roles to panel defaults."""
        plan = fosm._build_playback_plan(
            "scene-1",
            [
                {
                    "streamId": "/camera/front",
                    "role": "image_stream",
                },
                {
                    "streamId": "/lidar/top",
                    "role": "pointcloud_stream",
                },
            ],
        )

        assert plan["sceneId"] == "scene-1"
        assert plan["sync"]["timestampSource"] == "header.stamp"
        assert plan["panels"] == [
            {
                "panelId": "camera_front",
                "panelType": "2d",
                "contentType": "image",
                "streamId": "/camera/front",
            },
            {
                "panelId": "lidar_top",
                "panelType": "3d",
                "contentType": "pointcloud",
                "streamId": "/lidar/top",
            },
        ]

    def test_inspect_reader_without_summary(self):
        """Summary-less readers fall back to a full message scan."""
        supported_schema = _make_schema(
            1, "sensor_msgs/msg/CompressedImage", "ros2msg"
        )
        unsupported_schema = _make_schema(2, "std_msgs/msg/String", "ros2msg")
        supported_channel = _make_channel(1, "/camera/front", 1)
        unsupported_channel = _make_channel(2, "/ignored", 2)

        reader = _FakeReader(
            summary=None,
            messages=[
                (
                    unsupported_schema,
                    unsupported_channel,
                    _make_message(5, 5, b"ignore"),
                ),
                (
                    supported_schema,
                    supported_channel,
                    _make_message(10, 11, b"one"),
                ),
                (
                    supported_schema,
                    supported_channel,
                    _make_message(20, 21, b"two"),
                ),
            ],
        )

        result = fosm._inspect_reader(
            reader=reader,
            scene_id="scene-1",
            dataset_id="dataset-1",
            sample_id="sample-1",
            media_field="filepath",
            media_path="/tmp/test.mcap",
        )

        assert result["scene"]["timeRange"] == {"startNs": 5, "endNs": 20}
        assert result["scene"]["streams"] == [
            {
                "streamId": "/camera/front",
                "topic": "/camera/front",
                "schemaName": "sensor_msgs/msg/CompressedImage",
                "schemaEncoding": "ros2msg",
                "messageEncoding": "cdr",
                "role": "image_stream",
                "channelId": 1,
                "schemaId": 1,
                "timeRange": {"startNs": 10, "endNs": 20},
                "messageCount": 2,
            }
        ]

    def test_iter_reader_messages_uses_inclusive_end(self):
        """Window iteration includes messages at the requested end time."""
        supported_schema = _make_schema(
            1, "sensor_msgs/msg/PointCloud2", "ros2msg"
        )
        supported_channel = _make_channel(1, "/lidar/top", 1)
        summary = SimpleNamespace(
            channels={1: supported_channel},
            schemas={1: supported_schema},
            statistics=SimpleNamespace(
                channel_message_counts={1: 2},
                message_start_time=10,
                message_end_time=20,
            ),
            chunk_indexes=[],
        )
        reader = _FakeReader(
            summary=summary,
            messages=[
                (
                    supported_schema,
                    supported_channel,
                    _make_message(10, 10, b"a"),
                ),
                (
                    supported_schema,
                    supported_channel,
                    _make_message(20, 20, b"b"),
                ),
            ],
        )

        messages = [
            message
            for _schema, _channel, message in fosm._iter_reader_messages(
                reader,
                topics=["/lidar/top"],
                start_ns=10,
                end_ns=20,
            )
        ]

        assert [message.log_time for message in messages] == [10, 20]
