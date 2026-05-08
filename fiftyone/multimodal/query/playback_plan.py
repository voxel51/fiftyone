"""
Playback plan query helpers for multimodal workflows.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.multimodal.schemas import v1 as foms


def resolve_playback_plan(inventory_id: str) -> foms.PlaybackPlan:
    """Resolves the playback plan for a scene inventory.

    TODO:
    THIS IS A SMOKE-TEST MOCK IMPLEMENTATION.
    """

    time_track_ids = ["sample.index", "capture.time"]

    return foms.PlaybackPlan(
        plan_id=f"mock-playback-plan:{inventory_id}",
        scene_id=_resolve_mock_scene_id(inventory_id),
        source_inventory_id=inventory_id,
        plan_version="v1",
        clock=foms.PlaybackClock(
            time_track_ids=time_track_ids,
            default_time_track_id="sample.index",
            value_range=foms.TimeValueRange(start=0, end=24),
            start_value=0,
            playback_rate=1.0,
            sync_mode=foms.PlaybackSyncMode.PLAYBACK_SYNC_MODE_NEAREST,
            loop=True,
        ),
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
            foms.StreamPlaybackSpec(
                stream_id="camera.front",
                decoder_id="mock.image",
                time_track_ids=time_track_ids,
                default_time_track_id="sample.index",
                metadata={"kind": "image", "field": "camera.front"},
            ),
            foms.StreamPlaybackSpec(
                stream_id="camera.rear",
                decoder_id="mock.image",
                time_track_ids=time_track_ids,
                default_time_track_id="sample.index",
                metadata={"kind": "image", "field": "camera.rear"},
            ),
            foms.StreamPlaybackSpec(
                stream_id="lidar.top",
                decoder_id="mock.point-cloud",
                time_track_ids=time_track_ids,
                default_time_track_id="sample.index",
                metadata={"kind": "point-cloud", "field": "lidar.top"},
            ),
        ],
        panels=[
            foms.PanelSpec(
                panel_id="front-camera",
                kind=foms.PanelKind.PANEL_KIND_IMAGE,
                title="Front camera",
                streams=[
                    foms.PanelStreamBinding(
                        stream_id="camera.front",
                        role=foms.PanelStreamRole.PANEL_STREAM_ROLE_PRIMARY,
                        coordinate_frame_id="camera_front",
                    )
                ],
                settings=foms.PanelSettings(
                    image=foms.ImagePanelSettings(fit_mode="contain")
                ),
            ),
            foms.PanelSpec(
                panel_id="rear-camera",
                kind=foms.PanelKind.PANEL_KIND_IMAGE,
                title="Rear camera",
                streams=[
                    foms.PanelStreamBinding(
                        stream_id="camera.rear",
                        role=foms.PanelStreamRole.PANEL_STREAM_ROLE_PRIMARY,
                        coordinate_frame_id="camera_rear",
                    )
                ],
                settings=foms.PanelSettings(
                    image=foms.ImagePanelSettings(fit_mode="contain")
                ),
            ),
            foms.PanelSpec(
                panel_id="top-lidar",
                kind=foms.PanelKind.PANEL_KIND_THREE_D,
                title="Top lidar",
                streams=[
                    foms.PanelStreamBinding(
                        stream_id="lidar.top",
                        role=foms.PanelStreamRole.PANEL_STREAM_ROLE_PRIMARY,
                        coordinate_frame_id="lidar_top",
                    )
                ],
                settings=foms.PanelSettings(
                    three_d=foms.ThreeDPanelSettings(
                        camera_preset="ego", color_by_field="intensity"
                    )
                ),
            ),
        ],
        root_layout=foms.LayoutNode(
            node_id="root",
            visible=True,
            container=foms.ContainerLayout(
                kind=foms.LayoutContainerKind.LAYOUT_CONTAINER_KIND_GRID,
                children=[
                    _panel_node("front-camera"),
                    _panel_node("rear-camera"),
                    _panel_node("top-lidar"),
                ],
                child_weights=[1.0, 1.0, 1.0],
            ),
        ),
        produced_at="2026-01-01T00:00:00Z",
        produced_by="fiftyone.multimodal.mock",
    )


def _resolve_mock_scene_id(inventory_id: str) -> str:
    parts = inventory_id.split(":")

    if len(parts) == 3 and parts[0] == "mock-inventory":
        return f"mock-scene:{parts[2]}"

    return f"mock-scene:{inventory_id}"


def _panel_node(panel_id: str) -> foms.LayoutNode:
    return foms.LayoutNode(
        node_id=f"{panel_id}-node",
        panel=foms.PanelLayout(panel_id=panel_id),
    )
