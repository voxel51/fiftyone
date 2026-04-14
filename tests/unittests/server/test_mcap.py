"""
FiftyOne Server MCAP adapter and service unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import tempfile
from types import SimpleNamespace

import pytest

import fiftyone as fo
import fiftyone.core.metadata as fom
import fiftyone.core.rendering as fopr
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


class _FakeAdapter(fosm.MultimodalSourceAdapter):
    def __init__(self, metadata, window_response=None, timeline_response=None):
        self.metadata = metadata
        self.window_response = window_response or {}
        self.timeline_response = timeline_response or {
            "timestamps_ns": [],
            "streams": {},
        }
        self.catalog_calls = 0

    def get_scene_catalog(self, scene_id, media_field, media_path):
        del scene_id, media_field, media_path
        self.catalog_calls += 1
        return self.metadata

    def read_stream_window(self, media_path, stream_ids, start_ns, end_ns):
        del media_path, stream_ids, start_ns, end_ns
        return self.window_response

    def read_timeline_index(self, media_path, stream_ids):
        del media_path, stream_ids
        return self.timeline_response


class _FakePlanner(fosm.RenderingPlanner):
    def __init__(self, rendering_plan):
        self.rendering_plan = rendering_plan
        self.calls = 0

    def build_rendering_plan(self, metadata):
        del metadata
        self.calls += 1
        return self.rendering_plan


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


def _make_stream(
    stream_id,
    role,
    schema_name="sensor_msgs/msg/CompressedImage",
    schema_id=1,
    channel_id=1,
    start_ns=10,
    end_ns=20,
    message_count=2,
):
    return fom.McapStreamMetadata(
        stream_id=stream_id,
        topic=stream_id,
        schema_name=schema_name,
        schema_encoding="ros2msg",
        message_encoding="cdr",
        role=role,
        channel_id=channel_id,
        schema_id=schema_id,
        time_range=fom.McapTimeRange(start_ns=start_ns, end_ns=end_ns),
        message_count=message_count,
    )


def _make_rendering_plan(scene_id, media_field, panels):
    return fopr.McapRenderingPlan(
        scene_id=scene_id,
        media_field=media_field,
        sync=fopr.McapSyncConfig(
            timestamp_source="header.stamp",
            fallback="log_time",
            mode="nearest",
        ),
        panels=panels,
        sidebars=fopr.McapSidebarConfig(
            left="panel_config",
            right="stream_metadata",
        ),
    )


@pytest.fixture(name="dataset")
def fixture_dataset():
    """Creates a persistent dataset for testing."""
    dataset = fo.Dataset()
    dataset.persistent = True
    dataset.add_sample_field("mcap_path", fo.StringField)
    dataset.add_sample(fo.Sample(filepath="/tmp/not-mcap.mcap", mcap_path=""))

    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


@pytest.fixture(name="sample")
def fixture_sample(dataset):
    """Returns the dataset sample used by the tests."""
    return dataset.first()


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

    def test_build_rendering_plan(self):
        """Rendering plans map supported stream roles to panel defaults."""
        metadata = fom.McapMetadata(
            scene_id="scene-1",
            media_field="filepath",
            streams=[
                _make_stream("/camera/front", "image_stream"),
                _make_stream(
                    "/lidar/top",
                    "pointcloud_stream",
                    schema_name="sensor_msgs/msg/PointCloud2",
                    schema_id=2,
                    channel_id=2,
                ),
            ],
        )

        plan = fosm.HeuristicMcapRenderingPlanner().build_rendering_plan(
            metadata
        )

        assert plan.scene_id == "scene-1"
        assert plan.sync.timestamp_source == "header.stamp"
        assert [panel.panel_id for panel in plan.panels] == [
            "camera_front",
            "lidar_top",
        ]
        assert [panel.panel_type for panel in plan.panels] == ["2d", "3d"]

    def test_catalog_reader_without_summary(self):
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

        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            metadata = fosm._catalog_reader_without_summary(
                reader=reader,
                scene_id="scene-1",
                media_field="filepath",
                media_path=handle.name,
            )

        assert metadata.scene_id == "scene-1"
        assert metadata.time_range.start_ns == 5
        assert metadata.time_range.end_ns == 20
        assert len(metadata.streams) == 1
        assert metadata.streams[0].stream_id == "/camera/front"
        assert metadata.streams[0].message_count == 2

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


class TestSampleMcapSceneRepository:
    """Tests for the sample-backed repository."""

    def test_save_and_load_round_trip(self, dataset, sample):
        """MCAP metadata and rendering plans round-trip via the sample."""
        repository = fosm.SampleMcapSceneRepository()

        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()

            metadata = fom.McapMetadata.build_for(
                scene_id="scene-1",
                media_field="filepath",
                media_path=handle.name,
                time_range=fom.McapTimeRange(start_ns=10, end_ns=20),
                streams=[_make_stream("/camera/front", "image_stream")],
            )
            rendering_plan = _make_rendering_plan(
                "scene-1",
                "filepath",
                [
                    fopr.McapPanelPlan(
                        panel_id="camera_front",
                        panel_type="2d",
                        content_type="image",
                        stream_id="/camera/front",
                    )
                ],
            )

            repository.save(dataset, sample, metadata, rendering_plan)
            reloaded_sample = dataset.first()
            state = repository.load(reloaded_sample)

        assert dataset.has_sample_field("rendering_plan")
        assert isinstance(state.metadata, fom.McapMetadata)
        assert isinstance(state.rendering_plan, fopr.McapRenderingPlan)
        assert state.metadata.media_field == "filepath"
        assert state.rendering_plan.panels[0].stream_id == "/camera/front"


class TestMcapSceneService:
    """Tests for read-through ingest and persistence behavior."""

    def test_cache_hit_reuses_persisted_scene_state(self, dataset, sample):
        """Fresh persisted state is reused without re-ingesting."""
        repository = fosm.SampleMcapSceneRepository()

        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()

            metadata = fom.McapMetadata.build_for(
                scene_id="scene-1",
                media_field="filepath",
                media_path=handle.name,
                time_range=fom.McapTimeRange(start_ns=10, end_ns=20),
                streams=[_make_stream("/camera/front", "image_stream")],
            )
            rendering_plan = _make_rendering_plan(
                "scene-1",
                "filepath",
                [
                    fopr.McapPanelPlan(
                        panel_id="camera_front",
                        panel_type="2d",
                        content_type="image",
                        stream_id="/camera/front",
                    )
                ],
            )
            repository.save(dataset, sample, metadata, rendering_plan)

            adapter = _FakeAdapter(metadata)
            planner = _FakePlanner(rendering_plan)
            service = fosm.McapSceneService(adapter, planner, repository)

            state = service.ingest_scene(dataset, sample, "filepath")

        assert adapter.catalog_calls == 0
        assert planner.calls == 0
        assert state.metadata.scene_id == "scene-1"
        assert state.rendering_plan.media_field == "filepath"

    def test_cache_miss_ingests_and_persists(self, dataset, sample):
        """Missing persisted state triggers ingest and persistence."""
        repository = fosm.SampleMcapSceneRepository()

        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()

            metadata = fom.McapMetadata.build_for(
                scene_id="scene-1",
                media_field="filepath",
                media_path=handle.name,
                time_range=fom.McapTimeRange(start_ns=10, end_ns=20),
                streams=[_make_stream("/camera/front", "image_stream")],
            )
            rendering_plan = _make_rendering_plan(
                "scene-1",
                "filepath",
                [
                    fopr.McapPanelPlan(
                        panel_id="camera_front",
                        panel_type="2d",
                        content_type="image",
                        stream_id="/camera/front",
                    )
                ],
            )
            adapter = _FakeAdapter(metadata)
            planner = _FakePlanner(rendering_plan)
            service = fosm.McapSceneService(adapter, planner, repository)

            state = service.ingest_scene(dataset, sample, "filepath")

        reloaded_sample = dataset.first()
        assert adapter.catalog_calls == 1
        assert planner.calls == 1
        assert isinstance(reloaded_sample.metadata, fom.McapMetadata)
        assert isinstance(
            reloaded_sample["rendering_plan"], fopr.McapRenderingPlan
        )
        assert state.metadata.scene_id == "scene-1"

    def test_stale_fingerprint_forces_reingest(self, dataset, sample):
        """A changed source fingerprint invalidates persisted scene state."""
        repository = fosm.SampleMcapSceneRepository()

        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            handle.write(b"old")
            handle.flush()
            sample["filepath"] = handle.name
            sample.save()

            stale_metadata = fom.McapMetadata.build_for(
                scene_id="scene-1",
                media_field="filepath",
                media_path=handle.name,
                time_range=fom.McapTimeRange(start_ns=10, end_ns=20),
                streams=[_make_stream("/camera/front", "image_stream")],
            )
            stale_plan = _make_rendering_plan(
                "scene-1",
                "filepath",
                [
                    fopr.McapPanelPlan(
                        panel_id="camera_front",
                        panel_type="2d",
                        content_type="image",
                        stream_id="/camera/front",
                    )
                ],
            )
            repository.save(dataset, sample, stale_metadata, stale_plan)

            handle.seek(0)
            handle.write(b"newer-payload")
            handle.truncate()
            handle.flush()

            fresh_metadata = fom.McapMetadata.build_for(
                scene_id="scene-2",
                media_field="filepath",
                media_path=handle.name,
                time_range=fom.McapTimeRange(start_ns=30, end_ns=40),
                streams=[_make_stream("/lidar/top", "pointcloud_stream")],
            )
            fresh_plan = _make_rendering_plan(
                "scene-2",
                "filepath",
                [
                    fopr.McapPanelPlan(
                        panel_id="lidar_top",
                        panel_type="3d",
                        content_type="pointcloud",
                        stream_id="/lidar/top",
                    )
                ],
            )
            adapter = _FakeAdapter(fresh_metadata)
            planner = _FakePlanner(fresh_plan)
            service = fosm.McapSceneService(adapter, planner, repository)

            state = service.ingest_scene(dataset, sample, "filepath")

        assert adapter.catalog_calls == 1
        assert planner.calls == 1
        assert state.metadata.scene_id == "scene-2"
        assert state.rendering_plan.panels[0].stream_id == "/lidar/top"

    def test_overwrite_forces_reingest(self, dataset, sample):
        """Explicit overwrite bypasses fresh persisted scene state."""
        repository = fosm.SampleMcapSceneRepository()

        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()

            metadata = fom.McapMetadata.build_for(
                scene_id="scene-1",
                media_field="filepath",
                media_path=handle.name,
                time_range=fom.McapTimeRange(start_ns=10, end_ns=20),
                streams=[_make_stream("/camera/front", "image_stream")],
            )
            rendering_plan = _make_rendering_plan(
                "scene-1",
                "filepath",
                [
                    fopr.McapPanelPlan(
                        panel_id="camera_front",
                        panel_type="2d",
                        content_type="image",
                        stream_id="/camera/front",
                    )
                ],
            )
            repository.save(dataset, sample, metadata, rendering_plan)

            adapter = _FakeAdapter(metadata)
            planner = _FakePlanner(rendering_plan)
            service = fosm.McapSceneService(adapter, planner, repository)

            service.ingest_scene(
                dataset,
                sample,
                "filepath",
                overwrite=True,
            )

        assert adapter.catalog_calls == 1
        assert planner.calls == 1
