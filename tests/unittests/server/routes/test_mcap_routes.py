"""
FiftyOne Server MCAP route unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import tempfile
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.exceptions import HTTPException

import fiftyone as fo
import fiftyone.server.routes.mcap as form


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


def _json_payload(payload):
    return json.dumps(payload).encode("utf-8")


@pytest.fixture(name="dataset")
def fixture_dataset():
    """Creates a persistent dataset for testing."""
    dataset = fo.Dataset()
    dataset.persistent = True
    dataset.add_sample_field("mcap_path", fo.StringField)

    sample = fo.Sample(filepath="/tmp/not-mcap.jpg", mcap_path="")
    dataset.add_sample(sample)

    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


@pytest.fixture(name="dataset_id")
def fixture_dataset_id(dataset):
    """Returns the dataset ID."""
    # pylint: disable-next=protected-access
    return dataset._doc.id


@pytest.fixture(name="sample")
def fixture_sample(dataset):
    """Returns the dataset's sample."""
    return dataset.first()


@pytest.fixture(name="sample_id")
def fixture_sample_id(sample):
    """Returns the sample ID."""
    return str(sample.id)


@pytest.fixture(name="scene_endpoint")
def fixture_scene_endpoint():
    """Returns the scene endpoint instance."""
    return form.McapScene(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="buffer_endpoint")
def fixture_buffer_endpoint():
    """Returns the buffer endpoint instance."""
    return form.McapBuffer(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="timeline_endpoint")
def fixture_timeline_endpoint():
    """Returns the timeline endpoint instance."""
    return form.McapTimeline(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="mock_scene_request")
def fixture_mock_scene_request(dataset_id, sample_id):
    """Builds a mock scene request."""

    def _make_request(media_field):
        request = MagicMock()
        request.path_params = {
            "dataset_id": dataset_id,
            "sample_id": sample_id,
        }
        request.query_params = {"media_field": media_field}
        return request

    return _make_request


@pytest.fixture(name="mock_buffer_request")
def fixture_mock_buffer_request(dataset_id, sample_id):
    """Builds a mock buffer request."""

    def _make_request(payload):
        request = MagicMock()
        request.path_params = {
            "dataset_id": dataset_id,
            "sample_id": sample_id,
        }
        request.headers = {"Content-Type": "application/json"}
        request.json = AsyncMock(return_value=payload)
        request.body = AsyncMock(return_value=_json_payload(payload))
        return request

    return _make_request


@pytest.fixture(name="mock_timeline_request")
def fixture_mock_timeline_request(dataset_id, sample_id):
    """Builds a mock timeline request."""

    def _make_request(payload):
        request = MagicMock()
        request.path_params = {
            "dataset_id": dataset_id,
            "sample_id": sample_id,
        }
        request.headers = {"Content-Type": "application/json"}
        request.json = AsyncMock(return_value=payload)
        request.body = AsyncMock(return_value=_json_payload(payload))
        return request

    return _make_request


class TestMcapSceneRoute:
    """Tests for the MCAP scene endpoint."""

    @pytest.mark.asyncio
    async def test_scene_open_happy_path(
        self, sample, scene_endpoint, mock_scene_request
    ):
        """The scene endpoint returns inventory and playback-plan data."""
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["mcap_path"] = handle.name
            sample.save()

            schema = _make_schema(
                1, "sensor_msgs/msg/CompressedImage", "ros2msg"
            )
            channel = _make_channel(1, "/camera/front", 1)
            reader = _FakeReader(
                summary=SimpleNamespace(
                    channels={1: channel},
                    schemas={1: schema},
                    statistics=SimpleNamespace(
                        channel_message_counts={1: 1},
                        message_start_time=10,
                        message_end_time=10,
                    ),
                    chunk_indexes=[],
                ),
                messages=[(schema, channel, _make_message(10, 11, b"frame"))],
            )

            with patch.object(
                form.fosm,
                "_get_mcap_reader_module",
                return_value=SimpleNamespace(
                    make_reader=lambda _stream: reader
                ),
            ):
                response = await scene_endpoint.get(
                    mock_scene_request("mcap_path")
                )

        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["scene"]["mediaField"] == "mcap_path"
        assert data["scene"]["streams"][0]["streamId"] == "/camera/front"
        assert data["playbackPlan"]["panels"][0]["panelType"] == "2d"

    @pytest.mark.asyncio
    async def test_scene_open_returns_empty_supported_streams(
        self, sample, scene_endpoint, mock_scene_request
    ):
        """A valid MCAP with unsupported schemas returns empty stream inventory."""
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["mcap_path"] = handle.name
            sample.save()

            schema = _make_schema(1, "std_msgs/msg/String", "ros2msg")
            channel = _make_channel(1, "/ignored", 1)
            reader = _FakeReader(
                summary=SimpleNamespace(
                    channels={1: channel},
                    schemas={1: schema},
                    statistics=SimpleNamespace(
                        channel_message_counts={1: 4},
                        message_start_time=3,
                        message_end_time=9,
                    ),
                    chunk_indexes=[],
                )
            )

            with patch.object(
                form.fosm,
                "_get_mcap_reader_module",
                return_value=SimpleNamespace(
                    make_reader=lambda _stream: reader
                ),
            ):
                response = await scene_endpoint.get(
                    mock_scene_request("mcap_path")
                )

        data = json.loads(response.body)
        assert response.status_code == 200
        assert data["scene"]["timeRange"] == {"startNs": 3, "endNs": 9}
        assert data["scene"]["streams"] == []
        assert data["playbackPlan"]["panels"] == []

    @pytest.mark.asyncio
    async def test_scene_open_rejects_unknown_media_field(
        self, scene_endpoint, mock_scene_request
    ):
        """Unknown media fields are rejected with 400."""
        with pytest.raises(HTTPException) as exc_info:
            await scene_endpoint.get(mock_scene_request("unknown_field"))

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_scene_open_rejects_missing_file(
        self, sample, scene_endpoint, mock_scene_request
    ):
        """Missing MCAP files return 404."""
        sample["mcap_path"] = "/tmp/does-not-exist-test-route.mcap"
        sample.save()

        with pytest.raises(HTTPException) as exc_info:
            await scene_endpoint.get(mock_scene_request("mcap_path"))

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_scene_open_rejects_non_mcap_media(
        self, sample, scene_endpoint, mock_scene_request
    ):
        """Resolved media must point to an MCAP file."""
        sample["mcap_path"] = "/tmp/not-an-mcap.jpg"
        sample.save()

        with pytest.raises(HTTPException) as exc_info:
            await scene_endpoint.get(mock_scene_request("mcap_path"))

        assert exc_info.value.status_code == 400


class TestMcapBufferRoute:
    """Tests for the MCAP buffer endpoint."""

    @pytest.mark.asyncio
    async def test_buffer_open_happy_path(
        self, sample, buffer_endpoint, mock_buffer_request
    ):
        """The buffer endpoint returns raw-mode message payloads."""
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["mcap_path"] = handle.name
            sample.save()

            schema = _make_schema(1, "sensor_msgs/msg/PointCloud2", "ros2msg")
            channel = _make_channel(1, "/lidar/top", 1)
            reader = _FakeReader(
                summary=SimpleNamespace(
                    channels={1: channel},
                    schemas={1: schema},
                    statistics=SimpleNamespace(
                        channel_message_counts={1: 1},
                        message_start_time=10,
                        message_end_time=10,
                    ),
                    chunk_indexes=[],
                ),
                messages=[
                    (schema, channel, _make_message(10, 12, b"\x01\x02\x03"))
                ],
            )

            with patch.object(
                form.fosm,
                "_get_mcap_reader_module",
                return_value=SimpleNamespace(
                    make_reader=lambda _stream: reader
                ),
            ):
                response = await buffer_endpoint.post(
                    mock_buffer_request(
                        {
                            "mediaField": "mcap_path",
                            "streamIds": ["/lidar/top"],
                            "window": {"startNs": 10, "endNs": 10},
                            "mode": "raw",
                        }
                    )
                )

        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["mode"] == "raw"
        assert data["streams"][0]["streamId"] == "/lidar/top"
        assert data["streams"][0]["messages"][0]["payloadB64"] == "AQID"

    @pytest.mark.asyncio
    async def test_buffer_rejects_unknown_stream_id(
        self, sample, buffer_endpoint, mock_buffer_request
    ):
        """Unknown stream IDs are rejected with 400."""
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["mcap_path"] = handle.name
            sample.save()

            schema = _make_schema(
                1, "sensor_msgs/msg/CompressedImage", "ros2msg"
            )
            channel = _make_channel(1, "/camera/front", 1)
            reader = _FakeReader(
                summary=SimpleNamespace(
                    channels={1: channel},
                    schemas={1: schema},
                    statistics=SimpleNamespace(
                        channel_message_counts={1: 1},
                        message_start_time=10,
                        message_end_time=10,
                    ),
                    chunk_indexes=[],
                )
            )

            with patch.object(
                form.fosm,
                "_get_mcap_reader_module",
                return_value=SimpleNamespace(
                    make_reader=lambda _stream: reader
                ),
            ):
                with pytest.raises(HTTPException) as exc_info:
                    await buffer_endpoint.post(
                        mock_buffer_request(
                            {
                                "mediaField": "mcap_path",
                                "streamIds": ["/nope"],
                                "window": {"startNs": 10, "endNs": 12},
                                "mode": "raw",
                            }
                        )
                    )

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_buffer_rejects_decoded_mode(
        self, sample, buffer_endpoint, mock_buffer_request
    ):
        """Decoded mode is reserved but not implemented."""
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["mcap_path"] = handle.name
            sample.save()

            with pytest.raises(HTTPException) as exc_info:
                await buffer_endpoint.post(
                    mock_buffer_request(
                        {
                            "mediaField": "mcap_path",
                            "streamIds": ["/camera/front"],
                            "window": {"startNs": 1, "endNs": 2},
                            "mode": "decoded",
                        }
                    )
                )

        assert exc_info.value.status_code == 501


class TestMcapTimelineRoute:
    """Tests for the MCAP timeline endpoint."""

    @pytest.mark.asyncio
    async def test_timeline_open_happy_path(
        self, sample, timeline_endpoint, mock_timeline_request
    ):
        """The timeline endpoint returns shared and per-stream timestamps."""
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["mcap_path"] = handle.name
            sample.save()

            schema = _make_schema(
                1, "sensor_msgs/msg/CompressedImage", "ros2msg"
            )
            channel = _make_channel(1, "/camera/front", 1)
            reader = _FakeReader(
                summary=SimpleNamespace(
                    channels={1: channel},
                    schemas={1: schema},
                    statistics=SimpleNamespace(
                        channel_message_counts={1: 2},
                        message_start_time=10,
                        message_end_time=20,
                    ),
                    chunk_indexes=[],
                ),
                messages=[
                    (schema, channel, _make_message(20, 20, b"two")),
                    (schema, channel, _make_message(10, 10, b"one")),
                ],
            )

            with patch.object(
                form.fosm,
                "_get_mcap_reader_module",
                return_value=SimpleNamespace(
                    make_reader=lambda _stream: reader
                ),
            ):
                response = await timeline_endpoint.post(
                    mock_timeline_request(
                        {
                            "mediaField": "mcap_path",
                            "streamIds": ["/camera/front"],
                        }
                    )
                )

        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["sceneId"].endswith(":mcap_path")
        assert data["timeline"]["timestampSource"] == "log_time"
        assert data["timeline"]["timestampsNs"] == [10, 20]
        assert data["timeline"]["streams"] == [
            {
                "streamId": "/camera/front",
                "timestampsNs": [10, 20],
            }
        ]

    @pytest.mark.asyncio
    async def test_timeline_returns_empty_for_empty_stream_request(
        self, sample, timeline_endpoint, mock_timeline_request
    ):
        """An empty stream request returns an empty timeline payload."""
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["mcap_path"] = handle.name
            sample.save()

            response = await timeline_endpoint.post(
                mock_timeline_request(
                    {
                        "mediaField": "mcap_path",
                        "streamIds": [],
                    }
                )
            )

        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["timeline"]["timestampsNs"] == []
        assert data["timeline"]["streams"] == []

    @pytest.mark.asyncio
    async def test_timeline_rejects_unknown_stream_id(
        self, sample, timeline_endpoint, mock_timeline_request
    ):
        """Unknown stream IDs are rejected with 400."""
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["mcap_path"] = handle.name
            sample.save()

            schema = _make_schema(
                1, "sensor_msgs/msg/CompressedImage", "ros2msg"
            )
            channel = _make_channel(1, "/camera/front", 1)
            reader = _FakeReader(
                summary=SimpleNamespace(
                    channels={1: channel},
                    schemas={1: schema},
                    statistics=SimpleNamespace(
                        channel_message_counts={1: 1},
                        message_start_time=10,
                        message_end_time=10,
                    ),
                    chunk_indexes=[],
                )
            )

            with patch.object(
                form.fosm,
                "_get_mcap_reader_module",
                return_value=SimpleNamespace(
                    make_reader=lambda _stream: reader
                ),
            ):
                with pytest.raises(HTTPException) as exc_info:
                    await timeline_endpoint.post(
                        mock_timeline_request(
                            {
                                "mediaField": "mcap_path",
                                "streamIds": ["/nope"],
                            }
                        )
                    )

        assert exc_info.value.status_code == 400
