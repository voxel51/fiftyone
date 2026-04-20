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
import fiftyone.server.multimodal as fosm


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
            if topics is not None and channel.topic not in set(topics):
                continue

            if start_time is not None and message.log_time < start_time:
                continue

            if end_time is not None and message.log_time >= end_time:
                continue

            yield schema, channel, message


class _FakeAdapter(fosm.MultimodalSourceAdapter):
    def __init__(
        self,
        metadata,
        fingerprint,
        window_response=None,
        bootstrap_response=None,
        timeline_response=None,
    ):
        self.metadata = metadata
        self.fingerprint = fingerprint
        self.window_response = window_response or {}
        self.bootstrap_response = bootstrap_response or {}
        self.timeline_response = timeline_response or {
            "timestamps_ns": [],
            "streams": {},
        }
        self.catalog_calls = 0
        self.timeline_calls = 0

    def build_catalog(self, source_path, media_field, scene_id):
        del source_path, media_field, scene_id
        self.catalog_calls += 1
        return self.metadata

    def read_stream_window(
        self,
        source_path,
        stream_ids,
        start_time_ns,
        end_time_ns,
        max_messages_per_stream=None,
        timestamp_source="header.stamp",
        fallback="log_time",
    ):
        del source_path, stream_ids, start_time_ns, end_time_ns
        del max_messages_per_stream, timestamp_source, fallback
        return {
            stream_id: [
                {
                    **message,
                    "sync_timestamp_ns": message.get(
                        "sync_timestamp_ns", message["log_time_ns"]
                    ),
                }
                for message in messages
            ]
            for stream_id, messages in self.window_response.items()
        }

    def read_bootstrap_window(
        self,
        source_path,
        anchor_time_ns,
        render_stream_ids,
        transform_stream_ids,
        location_stream_ids,
        transform_window_ns=None,
        render_message_count=None,
        timestamp_source="header.stamp",
        fallback="log_time",
    ):
        del source_path, anchor_time_ns, render_stream_ids
        del transform_stream_ids, location_stream_ids
        del transform_window_ns, render_message_count
        del timestamp_source, fallback
        return {
            stream_id: [
                {
                    **message,
                    "sync_timestamp_ns": message.get(
                        "sync_timestamp_ns", message["log_time_ns"]
                    ),
                }
                for message in messages
            ]
            for stream_id, messages in self.bootstrap_response.items()
        }

    def read_timeline_index(
        self,
        source_path,
        stream_ids=None,
        timestamp_source="log_time",
        fallback="log_time",
    ):
        del source_path, stream_ids, timestamp_source, fallback
        self.timeline_calls += 1
        return self.timeline_response

    def get_source_fingerprint(self, source_path):
        del source_path
        return self.fingerprint


def _make_schema(schema_id, name, encoding="ros2msg"):
    return SimpleNamespace(id=schema_id, name=name, encoding=encoding)


def _make_channel(channel_id, topic, schema_id, message_encoding="cdr"):
    return SimpleNamespace(
        id=channel_id,
        topic=topic,
        schema_id=schema_id,
        message_encoding=message_encoding,
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
    kind,
    schema_name,
    channel_id,
    schema_id,
    frame_id=None,
    affordances=None,
    compatible_panels=None,
    start_ns=10,
    end_ns=20,
    message_count=2,
):
    return fom.MultimodalStreamDescriptor(
        stream_id=stream_id,
        topic=stream_id,
        schema_name=schema_name,
        schema_encoding="ros2msg",
        message_encoding="cdr",
        kind=kind,
        frame_id=frame_id,
        affordances=affordances or [],
        compatible_panels=compatible_panels or [],
        channel_id=channel_id,
        schema_id=schema_id,
        time_range=fom.McapTimeRange(start_ns=start_ns, end_ns=end_ns),
        message_count=message_count,
    )


def _make_metadata(media_path, media_field="filepath"):
    return fom.MultimodalMetadata.build_for(
        scene_id="scene-1",
        media_field=media_field,
        media_path=media_path,
        time_range=fom.McapTimeRange(start_ns=10, end_ns=20),
        streams=[
            _make_stream(
                "/camera/front",
                "image",
                "sensor_msgs/msg/CompressedImage",
                channel_id=1,
                schema_id=1,
                frame_id="camera_front",
                affordances=["image"],
                compatible_panels=["image"],
            ),
            _make_stream(
                "/lidar/top",
                "3d",
                "sensor_msgs/msg/PointCloud2",
                channel_id=2,
                schema_id=2,
                frame_id="lidar_top",
                affordances=["pointcloud", "3d"],
                compatible_panels=["3d"],
            ),
            _make_stream(
                "/tf",
                "transform",
                "tf2_msgs/msg/TFMessage",
                channel_id=3,
                schema_id=3,
                affordances=["transforms"],
            ),
            _make_stream(
                "/odom",
                "location",
                "nav_msgs/msg/Odometry",
                channel_id=4,
                schema_id=4,
                frame_id="odom",
                affordances=["location", "position", "pose"],
            ),
        ],
        frames=[
            fom.MultimodalFrameDescriptor(frame_id="camera_front"),
            fom.MultimodalFrameDescriptor(frame_id="lidar_top"),
            fom.MultimodalFrameDescriptor(frame_id="base_link"),
            fom.MultimodalFrameDescriptor(frame_id="odom"),
        ],
        transforms=[
            fom.MultimodalTransformEdge(
                topic="/tf",
                parent_frame_id="base_link",
                child_frame_id="lidar_top",
                is_static=False,
            )
        ],
        location_topics=[
            fom.MultimodalLocationTopicDescriptor(
                stream_id="/odom",
                topic="/odom",
                mode="pose",
                frame_id="odom",
            )
        ],
        catalog_version="multimodal-workspace-v1",
    )


@pytest.fixture(name="dataset")
def fixture_dataset():
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
    return dataset.first()


class TestMcapModule:
    def test_catalog_reader_inventories_summary_streams(self, monkeypatch):
        image_schema = _make_schema(
            1, "sensor_msgs/msg/CompressedImage", "ros2msg"
        )
        tf_schema = _make_schema(2, "tf2_msgs/msg/TFMessage", "ros2msg")
        odom_schema = _make_schema(3, "nav_msgs/msg/Odometry", "ros2msg")
        other_schema = _make_schema(4, "std_msgs/msg/String", "ros2msg")
        image_channel = _make_channel(1, "/camera/front", 1)
        tf_channel = _make_channel(2, "/tf", 2)
        odom_channel = _make_channel(3, "/odom", 3)
        other_channel = _make_channel(4, "/status", 4)
        summary = SimpleNamespace(
            channels={
                1: image_channel,
                2: tf_channel,
                3: odom_channel,
                4: other_channel,
            },
            schemas={
                1: image_schema,
                2: tf_schema,
                3: odom_schema,
                4: other_schema,
            },
            statistics=SimpleNamespace(
                channel_message_counts={1: 2, 2: 3, 3: 1, 4: 5},
                message_start_time=10,
                message_end_time=50,
            ),
            chunk_indexes=[],
        )
        reader = _FakeReader(
            summary=summary,
            messages=[
                (image_schema, image_channel, _make_message(10, 10, b"img")),
                (tf_schema, tf_channel, _make_message(15, 15, b"tf")),
                (odom_schema, odom_channel, _make_message(20, 20, b"odom")),
                (other_schema, other_channel, _make_message(25, 25, b"txt")),
            ],
        )

        monkeypatch.setattr(
            fosm,
            "decode_catalog_details",
            lambda schema_name, _payload: {
                "sensor_msgs/msg/CompressedImage": {"frame_id": "camera"},
                "tf2_msgs/msg/TFMessage": {
                    "transform_edges": [("base_link", "camera")]
                },
                "nav_msgs/msg/Odometry": {
                    "frame_id": "odom",
                    "child_frame_id": "base_link",
                },
            }.get(schema_name, {}),
        )

        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            metadata = fosm._catalog_reader(
                reader=reader,
                scene_id="scene-1",
                media_field="filepath",
                source_path=handle.name,
            )

        assert metadata.catalog_version == "multimodal-workspace-v1"
        assert [stream.stream_id for stream in metadata.streams] == [
            "/camera/front",
            "/tf",
            "/odom",
            "/status",
        ]
        assert metadata.streams[0].kind == "image"
        assert metadata.streams[1].kind == "transform"
        assert metadata.streams[2].kind == "location"
        assert metadata.streams[3].kind == "other"
        assert {frame.frame_id for frame in metadata.frames} == {
            "camera",
            "base_link",
            "odom",
        }
        assert len(metadata.transforms) == 1
        assert metadata.transforms[0].parent_frame_id == "base_link"
        assert metadata.location_topics[0].stream_id == "/odom"
        assert metadata.location_topics[0].mode == "pose"

    def test_catalog_reader_without_summary_counts_messages(self, monkeypatch):
        image_schema = _make_schema(
            1, "sensor_msgs/msg/CompressedImage", "ros2msg"
        )
        image_channel = _make_channel(1, "/camera/front", 1)
        other_schema = _make_schema(2, "std_msgs/msg/String", "ros2msg")
        other_channel = _make_channel(2, "/status", 2)
        reader = _FakeReader(
            summary=None,
            messages=[
                (image_schema, image_channel, _make_message(5, 5, b"one")),
                (image_schema, image_channel, _make_message(15, 15, b"two")),
                (other_schema, other_channel, _make_message(20, 20, b"x")),
            ],
        )
        monkeypatch.setattr(
            fosm,
            "decode_catalog_details",
            lambda schema_name, _payload: (
                {"frame_id": "camera"}
                if "CompressedImage" in schema_name
                else {}
            ),
        )

        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            metadata = fosm._catalog_reader(
                reader=reader,
                scene_id="scene-1",
                media_field="filepath",
                source_path=handle.name,
            )

        assert metadata.time_range.start_ns == 5
        assert metadata.time_range.end_ns == 20
        assert metadata.streams[0].message_count == 2
        assert metadata.streams[0].frame_id == "camera"

    def test_build_rendering_plan(self):
        metadata = fom.MultimodalMetadata(
            scene_id="scene-1",
            media_field="filepath",
            streams=[
                _make_stream(
                    "/lidar/top",
                    "3d",
                    "sensor_msgs/msg/PointCloud2",
                    channel_id=2,
                    schema_id=2,
                    frame_id="lidar_top",
                    affordances=["pointcloud", "3d"],
                    compatible_panels=["3d"],
                ),
                _make_stream(
                    "/camera/front",
                    "image",
                    "sensor_msgs/msg/CompressedImage",
                    channel_id=1,
                    schema_id=1,
                    frame_id="camera_front",
                    affordances=["image"],
                    compatible_panels=["image"],
                ),
                _make_stream(
                    "/camera/left",
                    "image",
                    "sensor_msgs/msg/CompressedImage",
                    channel_id=3,
                    schema_id=3,
                    frame_id="camera_left",
                    affordances=["image"],
                    compatible_panels=["image"],
                ),
                _make_stream(
                    "/camera/right",
                    "image",
                    "sensor_msgs/msg/CompressedImage",
                    channel_id=4,
                    schema_id=4,
                    frame_id="camera_right",
                    affordances=["image"],
                    compatible_panels=["image"],
                ),
                _make_stream(
                    "/camera/rear",
                    "image",
                    "sensor_msgs/msg/CompressedImage",
                    channel_id=5,
                    schema_id=5,
                    frame_id="camera_rear",
                    affordances=["image"],
                    compatible_panels=["image"],
                ),
            ],
            frames=[
                fom.MultimodalFrameDescriptor(frame_id="lidar_top"),
                fom.MultimodalFrameDescriptor(frame_id="camera_front"),
                fom.MultimodalFrameDescriptor(frame_id="camera_left"),
                fom.MultimodalFrameDescriptor(frame_id="camera_right"),
                fom.MultimodalFrameDescriptor(frame_id="camera_rear"),
            ],
            transforms=[],
            location_topics=[],
        )

        plan = fosm.DefaultMultimodalRenderingPlanner().build_rendering_plan(
            metadata
        )

        assert [panel.panel_id for panel in plan.panels] == [
            "panel_3d_1",
            "image_panel_1",
            "image_panel_2",
            "image_panel_3",
        ]
        assert plan.panels[0].visible_stream_ids == ["/lidar/top"]
        assert plan.panels[0].frame_config.display_frame_id == "lidar_top"
        assert plan.panels[0].layout.x == 0
        assert plan.panels[0].layout.y == 0
        assert plan.panels[0].layout.w == 12
        assert plan.panels[0].layout.h == 2
        assert [panel.render_stream_id for panel in plan.panels[1:]] == [
            "/camera/front",
            "/camera/left",
            "/camera/right",
        ]
        assert [
            (panel.layout.x, panel.layout.y) for panel in plan.panels[1:]
        ] == [
            (0, 2),
            (4, 2),
            (8, 2),
        ]

    def test_classify_stream_supports_additional_3d_schemas(self):
        laser_scan = fosm._classify_stream("sensor_msgs/msg/LaserScan")
        marker_array = fosm._classify_stream(
            "visualization_msgs/msg/MarkerArray"
        )

        assert laser_scan["kind"] == "3d"
        assert laser_scan["compatible_panels"] == ["3d"]
        assert "laserscan" in laser_scan["affordances"]

        assert marker_array["kind"] == "3d"
        assert marker_array["compatible_panels"] == ["3d"]
        assert "markerarray" in marker_array["affordances"]

    def test_repository_round_trip(self, dataset, sample):
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()
            metadata = _make_metadata(handle.name)
            rendering_plan = (
                fosm.DefaultMultimodalRenderingPlanner().build_rendering_plan(
                    metadata
                )
            )
            repository = fosm.SampleMultimodalSceneRepository()

            repository.save(dataset, sample, metadata, rendering_plan)
            loaded = repository.load(dataset.first())

        assert dataset.has_sample_field("rendering_plan")
        assert isinstance(loaded.metadata, fom.MultimodalMetadata)
        assert isinstance(loaded.rendering_plan, fopr.MultimodalRenderingPlan)
        assert loaded.rendering_plan.panels[0].archetype == "3d"

    def test_workspace_service_uses_cached_state(self, dataset, sample):
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()
            metadata = _make_metadata(handle.name)
            rendering_plan = (
                fosm.DefaultMultimodalRenderingPlanner().build_rendering_plan(
                    metadata
                )
            )
            repository = fosm.SampleMultimodalSceneRepository()
            repository.save(dataset, sample, metadata, rendering_plan)
            adapter = _FakeAdapter(
                metadata=metadata,
                fingerprint=metadata.source_fingerprint,
            )
            service = fosm.MultimodalWorkspaceService(
                adapter=adapter,
                planner=fosm.DefaultMultimodalRenderingPlanner(),
                repository=repository,
            )

            state = service.get_workspace(dataset, sample, "filepath")

        assert state.metadata.scene_id == "scene-1"
        assert adapter.catalog_calls == 0

    def test_workspace_service_ingests_and_reads_stream_window(
        self, dataset, sample
    ):
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()
            metadata = _make_metadata(handle.name)
            adapter = _FakeAdapter(
                metadata=metadata,
                fingerprint=metadata.source_fingerprint,
                window_response={
                    "/camera/front": [
                        {
                            "message_id": "frame-1",
                            "sync_timestamp_ns": 10,
                            "log_time_ns": 10,
                            "publish_time_ns": 11,
                            "payload_b64": "AQID",
                        }
                    ]
                },
            )
            service = fosm.MultimodalWorkspaceService(
                adapter=adapter,
                planner=fosm.DefaultMultimodalRenderingPlanner(),
                repository=fosm.SampleMultimodalSceneRepository(),
            )

            response = service.read_stream_window(
                dataset=dataset,
                sample=sample,
                media_field="filepath",
                stream_ids=["/camera/front"],
                start_time_ns=10,
                end_time_ns=20,
            )

        assert adapter.catalog_calls == 1
        assert response["streams"][0]["streamId"] == "/camera/front"
        assert response["streams"][0]["messages"][0]["payloadB64"] == "AQID"
        assert response["streams"][0]["messages"][0]["syncTimestampNs"] == 0

    def test_workspace_service_reads_bootstrap_window(self, dataset, sample):
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()
            metadata = _make_metadata(handle.name)
            adapter = _FakeAdapter(
                metadata=metadata,
                fingerprint=metadata.source_fingerprint,
                bootstrap_response={
                    "/lidar/top": [
                        {
                            "message_id": "cloud-1",
                            "sync_timestamp_ns": 10,
                            "log_time_ns": 10,
                            "publish_time_ns": 12,
                            "payload_b64": "AQID",
                        }
                    ],
                    "/tf": [
                        {
                            "message_id": "tf-1",
                            "sync_timestamp_ns": 11,
                            "log_time_ns": 11,
                            "publish_time_ns": 11,
                            "payload_b64": "BAUG",
                        }
                    ],
                },
            )
            service = fosm.MultimodalWorkspaceService(
                adapter=adapter,
                planner=fosm.DefaultMultimodalRenderingPlanner(),
                repository=fosm.SampleMultimodalSceneRepository(),
            )

            response = service.read_bootstrap_window(
                dataset=dataset,
                sample=sample,
                media_field="filepath",
                anchor_time_ns=0,
                render_stream_ids=["/lidar/top"],
                transform_stream_ids=["/tf"],
                location_stream_ids=[],
                transform_window_ns=100,
            )

        assert response["window"] == {"startTimeNs": 0, "endTimeNs": 100}
        assert [stream["streamId"] for stream in response["streams"]] == [
            "/lidar/top",
            "/tf",
        ]
        assert response["streams"][0]["messages"][0]["syncTimestampNs"] == 0

    def test_workspace_service_reingests_when_fingerprint_changes(
        self, dataset, sample
    ):
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()
            metadata = _make_metadata(handle.name)
            rendering_plan = (
                fosm.DefaultMultimodalRenderingPlanner().build_rendering_plan(
                    metadata
                )
            )
            repository = fosm.SampleMultimodalSceneRepository()
            repository.save(dataset, sample, metadata, rendering_plan)
            stale_fingerprint = fom.MultimodalSourceFingerprint(
                path=handle.name,
                size_bytes=metadata.size_bytes,
                mtime_ns=metadata.source_fingerprint.mtime_ns + 1,
            )
            adapter = _FakeAdapter(
                metadata=metadata,
                fingerprint=stale_fingerprint,
            )
            service = fosm.MultimodalWorkspaceService(
                adapter=adapter,
                planner=fosm.DefaultMultimodalRenderingPlanner(),
                repository=repository,
            )

            service.get_workspace(dataset, sample, "filepath")

        assert adapter.catalog_calls == 1

    def test_workspace_service_reingests_legacy_persisted_workspace_state(
        self, dataset, sample
    ):
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()

            legacy_metadata = _make_metadata(handle.name)
            legacy_metadata.catalog_version = "mcap-poc-v1"

            dataset._sample_collection.update_one(
                {"_id": sample._doc.id},
                {
                    "$set": {
                        "metadata": legacy_metadata.to_mongo(),
                        "rendering_plan": {
                            "_cls": "MultimodalRenderingPlan",
                            "scene_id": legacy_metadata.scene_id,
                            "media_field": "filepath",
                            "sync": {
                                "_cls": "SyncConfig",
                                "timestamp_source": "header.stamp",
                                "fallback": "log_time",
                                "mode": "nearest",
                            },
                            "panels": [
                                {
                                    "_cls": "PanelPlan",
                                    "panel_id": "legacy_image_panel",
                                    "panel_type": "2d",
                                    "content_type": "image",
                                    "stream_id": "/camera/front",
                                }
                            ],
                            "sidebars": {
                                "_cls": "McapSidebarConfig",
                                "left": "panel_config",
                                "right": "stream_metadata",
                            },
                        },
                    }
                },
            )

            adapter = _FakeAdapter(
                metadata=_make_metadata(handle.name),
                fingerprint=legacy_metadata.source_fingerprint,
            )
            service = fosm.MultimodalWorkspaceService(
                adapter=adapter,
                planner=fosm.DefaultMultimodalRenderingPlanner(),
                repository=fosm.SampleMultimodalSceneRepository(),
            )

            state = service.get_workspace(dataset, dataset.first(), "filepath")

        assert adapter.catalog_calls == 1
        assert state.metadata.catalog_version == "multimodal-workspace-v1"
        assert state.rendering_plan.panels[0].archetype == "3d"

    def test_workspace_service_serializes_scene_relative_timestamps(
        self, dataset, sample
    ):
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()
            metadata = fom.MultimodalMetadata.build_for(
                scene_id="scene-1",
                media_field="filepath",
                media_path=handle.name,
                time_range=fom.McapTimeRange(start_ns=1_000, end_ns=2_000),
                streams=[
                    _make_stream(
                        "/camera/front",
                        "image",
                        "sensor_msgs/msg/CompressedImage",
                        channel_id=1,
                        schema_id=1,
                        start_ns=1_100,
                        end_ns=1_900,
                        affordances=["image"],
                        compatible_panels=["image"],
                    )
                ],
                catalog_version="multimodal-workspace-v1",
            )
            adapter = _FakeAdapter(
                metadata=metadata,
                fingerprint=metadata.source_fingerprint,
                window_response={
                    "/camera/front": [
                        {
                            "message_id": "frame-1",
                            "sync_timestamp_ns": 1_100,
                            "log_time_ns": 1_100,
                            "publish_time_ns": 1_150,
                            "payload_b64": "AQID",
                        }
                    ]
                },
                timeline_response={
                    "timestamps_ns": [1_100, 1_300],
                    "streams": {
                        "/camera/front": [
                            {
                                "timestamp_ns": 1_100,
                                "log_time_ns": 1_100,
                                "publish_time_ns": 1_150,
                            },
                            {
                                "timestamp_ns": 1_300,
                                "log_time_ns": 1_300,
                                "publish_time_ns": 1_350,
                            },
                        ]
                    },
                },
            )
            service = fosm.MultimodalWorkspaceService(
                adapter=adapter,
                planner=fosm.DefaultMultimodalRenderingPlanner(),
                repository=fosm.SampleMultimodalSceneRepository(),
            )

            workspace = service.get_workspace(dataset, sample, "filepath")
            window = service.read_stream_window(
                dataset=dataset,
                sample=sample,
                media_field="filepath",
                stream_ids=["/camera/front"],
                start_time_ns=0,
                end_time_ns=200,
            )
            timeline = service.read_timeline_index(
                dataset=dataset,
                sample=sample,
                media_field="filepath",
                stream_ids=["/camera/front"],
            )

        assert workspace.metadata.time_range.start_ns == 1_000
        assert window["window"] == {"startTimeNs": 0, "endTimeNs": 200}
        assert window["streams"][0]["messages"][0]["syncTimestampNs"] == 100
        assert window["streams"][0]["messages"][0]["logTimeNs"] == 100
        assert window["streams"][0]["messages"][0]["publishTimeNs"] == 150
        assert timeline["timestampsNs"] == [100, 300]
        assert "timestampsNs" not in timeline["streams"][0]
        assert timeline["streams"][0]["samples"] == [
            {
                "timestampNs": 100,
                "logTimeNs": 100,
                "publishTimeNs": 150,
            },
            {
                "timestampNs": 300,
                "logTimeNs": 300,
                "publishTimeNs": 350,
            },
        ]

    def test_workspace_service_caches_timeline_indexes(self, dataset, sample):
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()
            metadata = _make_metadata(handle.name)
            adapter = _FakeAdapter(
                metadata=metadata,
                fingerprint=metadata.source_fingerprint,
                timeline_response={
                    "timestamps_ns": [10, 20],
                    "streams": {
                        "/camera/front": [
                            {
                                "timestamp_ns": 10,
                                "log_time_ns": 10,
                                "publish_time_ns": 11,
                            },
                            {
                                "timestamp_ns": 20,
                                "log_time_ns": 20,
                                "publish_time_ns": 21,
                            },
                        ]
                    },
                },
            )
            service = fosm.MultimodalWorkspaceService(
                adapter=adapter,
                planner=fosm.DefaultMultimodalRenderingPlanner(),
                repository=fosm.SampleMultimodalSceneRepository(),
            )

            first = service.read_timeline_index(
                dataset=dataset,
                sample=sample,
                media_field="filepath",
                stream_ids=["/camera/front"],
                timestamp_source="header.stamp",
                fallback="log_time",
            )
            second = service.read_timeline_index(
                dataset=dataset,
                sample=sample,
                media_field="filepath",
                stream_ids=["/camera/front"],
                timestamp_source="header.stamp",
                fallback="log_time",
            )

        assert first["timestampsNs"] == [0, 10]
        assert second["timestampsNs"] == [0, 10]
        assert adapter.catalog_calls == 1
        assert adapter.timeline_calls == 1

    def test_resolve_message_sync_timestamp_uses_header_stamp_fallbacks(self):
        with pytest.MonkeyPatch.context() as monkeypatch:
            monkeypatch.setattr(
                fosm,
                "decode_sync_timestamp_ns",
                lambda schema_name, payload: 123 if schema_name else None,
            )

            assert (
                fosm._resolve_message_sync_timestamp_ns(
                    schema_name="sensor_msgs/msg/CompressedImage",
                    payload=b"payload",
                    log_time_ns=500,
                    publish_time_ns=450,
                    timestamp_source="header.stamp",
                    fallback="log_time",
                )
                == 123
            )
            assert (
                fosm._resolve_message_sync_timestamp_ns(
                    schema_name="sensor_msgs/msg/CompressedImage",
                    payload=b"payload",
                    log_time_ns=500,
                    publish_time_ns=450,
                    timestamp_source="publish_time",
                    fallback="log_time",
                )
                == 450
            )

        with pytest.MonkeyPatch.context() as monkeypatch:
            monkeypatch.setattr(
                fosm,
                "decode_sync_timestamp_ns",
                lambda schema_name, payload: None,
            )

            assert (
                fosm._resolve_message_sync_timestamp_ns(
                    schema_name="sensor_msgs/msg/CompressedImage",
                    payload=b"payload",
                    log_time_ns=500,
                    publish_time_ns=450,
                    timestamp_source="header.stamp",
                    fallback="publish_time",
                )
                == 450
            )
            assert (
                fosm._resolve_message_sync_timestamp_ns(
                    schema_name="sensor_msgs/msg/CompressedImage",
                    payload=b"payload",
                    log_time_ns=500,
                    publish_time_ns=0,
                    timestamp_source="header.stamp",
                    fallback="publish_time",
                )
                == 500
            )
