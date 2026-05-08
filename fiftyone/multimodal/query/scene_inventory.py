"""
Scene inventory query helpers for multimodal workflows.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.multimodal.schemas import v1 as foms


def resolve_scene_inventory(
    dataset_id: str, sample_id: str
) -> foms.SceneInventory:
    """Resolves the scene inventory for a dataset sample.

    TODO:
    THIS IS A SMOKE-TEST MOCK IMPLEMENTATION.
    """

    return foms.SceneInventory(
        inventory_id=f"mock-inventory:{dataset_id}:{sample_id}",
        scene_id=f"mock-scene:{sample_id}",
        source_format="mock",
        source_fingerprint=foms.SourceFingerprint(size_bytes=0),
        inventory_version="v1",
        time_tracks=[
            foms.TimeTrack(
                time_track_id="sample.index",
                type=foms.TimeTrackType.TIME_TRACK_TYPE_SEQUENCE,
                role=foms.TimeTrackRole.TIME_TRACK_ROLE_SAMPLE_INDEX,
                display_name="Sample index",
                source_path="sample.index",
                value_range=foms.TimeValueRange(start=0, end=24),
                sort_order=foms.TimeSortOrder.TIME_SORT_ORDER_MONOTONIC,
                sort_scope=foms.TimeSortScope.TIME_SORT_SCOPE_SCENE,
            ),
            foms.TimeTrack(
                time_track_id="capture.time",
                type=foms.TimeTrackType.TIME_TRACK_TYPE_TIMESTAMP_NS,
                role=foms.TimeTrackRole.TIME_TRACK_ROLE_CAPTURE_TIME,
                display_name="Capture time",
                source_path="capture_time",
                value_range=foms.TimeValueRange(
                    start=1710000000000000000,
                    end=1710000002400000000,
                ),
                sort_order=foms.TimeSortOrder.TIME_SORT_ORDER_MONOTONIC,
                sort_scope=foms.TimeSortScope.TIME_SORT_SCOPE_SCENE,
            ),
        ],
        streams=[
            foms.StreamInventory(
                stream_id="camera.front",
                payload=foms.PayloadDescriptor(encoding="image/jpeg"),
                record_count=24,
                display_name="Front camera",
                coordinate_frame_id="camera_front",
                metadata={"kind": "image", "field": "camera.front"},
            ),
            foms.StreamInventory(
                stream_id="camera.rear",
                payload=foms.PayloadDescriptor(encoding="image/jpeg"),
                record_count=24,
                display_name="Rear camera",
                coordinate_frame_id="camera_rear",
                metadata={"kind": "image", "field": "camera.rear"},
            ),
            foms.StreamInventory(
                stream_id="lidar.top",
                payload=foms.PayloadDescriptor(encoding="point-cloud/xyz"),
                record_count=12,
                display_name="Top lidar",
                coordinate_frame_id="lidar_top",
                metadata={"kind": "point-cloud", "field": "lidar.top"},
            ),
        ],
        static_coordinate_frame_edges=[
            foms.StaticCoordinateFrameEdge(
                parent_frame_id="ego",
                child_frame_id="camera_front",
                source_stream_id="camera.front",
            ),
            foms.StaticCoordinateFrameEdge(
                parent_frame_id="ego",
                child_frame_id="camera_rear",
                source_stream_id="camera.rear",
            ),
            foms.StaticCoordinateFrameEdge(
                parent_frame_id="ego",
                child_frame_id="lidar_top",
                source_stream_id="lidar.top",
            ),
        ],
        metadata={
            "dataset_id": dataset_id,
            "sample_id": sample_id,
            "resolver": "mock",
        },
        produced_at="2026-01-01T00:00:00Z",
        produced_by="fiftyone.multimodal.mock",
    )
