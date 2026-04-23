"""
Multimodal rendering-plan defaults and normalization.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from abc import ABC, abstractmethod
from collections import OrderedDict, deque
import re

import fiftyone.core.rendering as fopr
from fiftyone.server.multimodal_common import (
    DEFAULT_IMAGE_PANEL_LIMIT,
    DEFAULT_SIDEBAR_WIDTH,
    MAX_SIDEBAR_WIDTH,
    MIN_SIDEBAR_WIDTH,
    PREFERRED_EGO_FRAME_IDS,
    PREFERRED_GLOBAL_FRAME_IDS,
    PREFERRED_IMAGE_PANEL_TOKENS,
    MultimodalRouteError,
)


class MultimodalRenderingPlanner(ABC):
    """Abstract builder for persisted multimodal rendering plans."""

    @abstractmethod
    def build_rendering_plan(self, metadata):
        """Builds a rendering plan for the given catalog."""


def _get_first_topic_segment(topic):
    if not topic:
        return None

    for segment in str(topic).split("/"):
        segment = segment.strip()
        if segment:
            return segment

    return None


def _build_unique_panel_title(base_title, used_titles):
    normalized_base_title = (base_title or "panel").strip() or "panel"
    if normalized_base_title not in used_titles:
        used_titles.add(normalized_base_title)
        return normalized_base_title

    suffix = 2
    while "%s %d" % (normalized_base_title, suffix) in used_titles:
        suffix += 1

    title = "%s %d" % (normalized_base_title, suffix)
    used_titles.add(title)
    return title


class DefaultMultimodalRenderingPlanner(MultimodalRenderingPlanner):
    """Default rendering planner for built-in multimodal catalogs."""

    def build_rendering_plan(self, metadata):
        panels = []
        used_titles = set()
        image_streams = _select_default_image_streams(
            [stream for stream in metadata.streams if stream.kind == "image"]
        )
        three_d_streams = [
            stream
            for stream in metadata.streams
            if "3d" in (stream.compatible_panels or [])
        ]

        if three_d_streams:
            fixed_frame_id = _choose_default_fixed_frame(
                metadata, three_d_streams
            )
            follow_frame_id = _choose_default_follow_frame(
                metadata, fixed_frame_id
            )
            panels.append(
                fopr.PanelPlan(
                    panel_id="panel_3d_1",
                    archetype="3d",
                    title=_build_unique_panel_title(
                        _get_first_topic_segment(
                            getattr(three_d_streams[0], "topic", None)
                        )
                        or "3d",
                        used_titles,
                    ),
                    render_stream_id=None,
                    visible_stream_ids=[
                        stream.stream_id for stream in three_d_streams
                    ],
                    frame_config=fopr.PanelFrameConfig(
                        fixed_frame_id=fixed_frame_id,
                        display_frame_id=fixed_frame_id,
                        follow_mode=(
                            "pose" if follow_frame_id is not None else "off"
                        ),
                    ),
                    scene_config=fopr.PanelSceneConfig(
                        up_axis="z",
                        background_color="#10151d",
                        show_grid=True,
                    ),
                )
            )

        for index, image_stream in enumerate(image_streams, 1):
            image_support_stream_ids = _get_default_image_support_stream_ids(
                metadata, image_stream
            )
            panels.append(
                fopr.PanelPlan(
                    panel_id="image_panel_%d" % index,
                    archetype="image",
                    title=_build_unique_panel_title(
                        _get_first_topic_segment(
                            getattr(image_stream, "topic", None)
                        )
                        or "image",
                        used_titles,
                    ),
                    render_stream_id=image_stream.stream_id,
                    visible_stream_ids=image_support_stream_ids,
                    frame_config=fopr.PanelFrameConfig(),
                    scene_config=fopr.PanelSceneConfig(),
                )
            )

        return fopr.MultimodalRenderingPlan(
            source_kind=metadata.source_kind,
            media_field=metadata.media_field,
            scene_id=metadata.scene_id,
            sync=fopr.SyncConfig(
                timestamp_source="header.stamp",
                fallback="log_time",
                mode="nearest",
            ),
            panels=panels,
            sidebar_width=DEFAULT_SIDEBAR_WIDTH,
            layout_tree=_build_default_rendering_plan_layout_tree(
                [panel.panel_id for panel in panels],
                has_three_d_panel=bool(three_d_streams),
            ),
        )


def _get_topic_tokens(topic):
    return [
        token for token in re.split(r"[/_-]+", (topic or "").lower()) if token
    ]


def _get_preferred_image_panel_slot(stream):
    topic_tokens = _get_topic_tokens(getattr(stream, "topic", None))

    for token in PREFERRED_IMAGE_PANEL_TOKENS:
        if token in topic_tokens:
            return token

    return None


def _select_default_image_streams(image_streams):
    image_streams = list(image_streams or [])
    preferred_slots = {
        stream.stream_id: _get_preferred_image_panel_slot(stream)
        for stream in image_streams
    }
    selected_streams = []
    selected_stream_ids = set()

    for token in PREFERRED_IMAGE_PANEL_TOKENS:
        for stream in image_streams:
            if len(selected_streams) >= DEFAULT_IMAGE_PANEL_LIMIT:
                return selected_streams

            if stream.stream_id in selected_stream_ids:
                continue

            if preferred_slots[stream.stream_id] != token:
                continue

            selected_streams.append(stream)
            selected_stream_ids.add(stream.stream_id)
            break

    for stream in image_streams:
        if len(selected_streams) >= DEFAULT_IMAGE_PANEL_LIMIT:
            break

        if stream.stream_id in selected_stream_ids:
            continue

        selected_streams.append(stream)
        selected_stream_ids.add(stream.stream_id)

    return selected_streams


def _build_layout_leaf(panel_id):
    return {"type": "leaf", "panelId": panel_id}


def _normalize_split_percentage(value):
    try:
        normalized = float(value)
    except Exception as error:
        raise MultimodalRouteError(
            400, "layoutTree splitPercentage must be a number"
        ) from error

    if normalized <= 0 or normalized >= 100:
        raise MultimodalRouteError(
            400, "layoutTree splitPercentage must be between 0 and 100"
        )

    normalized = round(normalized, 3)
    if normalized.is_integer():
        return int(normalized)

    return normalized


def _count_layout_leaves(layout_tree):
    if layout_tree is None:
        return 0

    if layout_tree.get("type") == "leaf":
        return 1

    return _count_layout_leaves(
        layout_tree.get("first")
    ) + _count_layout_leaves(layout_tree.get("second"))


def _build_layout_split(direction, first, second):
    split_percentage = (100.0 * _count_layout_leaves(first)) / (
        _count_layout_leaves(first) + _count_layout_leaves(second)
    )
    return {
        "type": "split",
        "direction": direction,
        "splitPercentage": int(round(split_percentage)),
        "first": first,
        "second": second,
    }


def _build_default_layout_tree(panel_ids, depth=0):
    panel_ids = list(panel_ids or [])
    panel_count = len(panel_ids)
    if panel_count == 0:
        return None

    if depth == 0:
        if panel_count == 1:
            return _build_layout_leaf(panel_ids[0])

        if panel_count == 2:
            return {
                "type": "split",
                "direction": "row",
                "splitPercentage": 50,
                "first": _build_layout_leaf(panel_ids[0]),
                "second": _build_layout_leaf(panel_ids[1]),
            }

        if panel_count == 3:
            return {
                "type": "split",
                "direction": "row",
                "splitPercentage": 33,
                "first": _build_layout_leaf(panel_ids[0]),
                "second": {
                    "type": "split",
                    "direction": "column",
                    "splitPercentage": 50,
                    "first": _build_layout_leaf(panel_ids[1]),
                    "second": _build_layout_leaf(panel_ids[2]),
                },
            }

        if panel_count == 4:
            return {
                "type": "split",
                "direction": "column",
                "splitPercentage": 50,
                "first": {
                    "type": "split",
                    "direction": "row",
                    "splitPercentage": 50,
                    "first": _build_layout_leaf(panel_ids[0]),
                    "second": _build_layout_leaf(panel_ids[1]),
                },
                "second": {
                    "type": "split",
                    "direction": "row",
                    "splitPercentage": 50,
                    "first": _build_layout_leaf(panel_ids[2]),
                    "second": _build_layout_leaf(panel_ids[3]),
                },
            }

    if panel_count == 1:
        return _build_layout_leaf(panel_ids[0])

    split_index = panel_count // 2
    direction = "row" if depth % 2 == 0 else "column"
    return _build_layout_split(
        direction,
        _build_default_layout_tree(panel_ids[:split_index], depth + 1),
        _build_default_layout_tree(panel_ids[split_index:], depth + 1),
    )


def _build_default_rendering_plan_layout_tree(
    panel_ids, has_three_d_panel=False
):
    panel_ids = list(panel_ids or [])
    panel_count = len(panel_ids)
    if not has_three_d_panel or panel_count == 0:
        return _build_default_layout_tree(panel_ids)

    if panel_count == 1:
        return _build_layout_leaf(panel_ids[0])

    if panel_count == 2:
        return {
            "type": "split",
            "direction": "column",
            "splitPercentage": 60,
            "first": _build_layout_leaf(panel_ids[0]),
            "second": _build_layout_leaf(panel_ids[1]),
        }

    if panel_count == 3:
        return {
            "type": "split",
            "direction": "column",
            "splitPercentage": 60,
            "first": _build_layout_leaf(panel_ids[0]),
            "second": {
                "type": "split",
                "direction": "row",
                "splitPercentage": 50,
                "first": _build_layout_leaf(panel_ids[1]),
                "second": _build_layout_leaf(panel_ids[2]),
            },
        }

    if panel_count == 4:
        return {
            "type": "split",
            "direction": "column",
            "splitPercentage": 60,
            "first": _build_layout_leaf(panel_ids[0]),
            "second": {
                "type": "split",
                "direction": "row",
                "splitPercentage": 33,
                "first": _build_layout_leaf(panel_ids[1]),
                "second": {
                    "type": "split",
                    "direction": "row",
                    "splitPercentage": 50,
                    "first": _build_layout_leaf(panel_ids[2]),
                    "second": _build_layout_leaf(panel_ids[3]),
                },
            },
        }

    return _build_default_layout_tree(panel_ids)


def _normalize_layout_tree(layout_tree):
    if layout_tree is None:
        return None

    if not isinstance(layout_tree, dict):
        raise MultimodalRouteError(
            400, "layoutTree must be a layout node object"
        )

    node_type = layout_tree.get("type")
    if node_type == "leaf":
        panel_id = layout_tree.get("panelId")
        if not isinstance(panel_id, str) or not panel_id:
            raise MultimodalRouteError(
                400, "layoutTree leaf panelId must be a non-empty string"
            )

        return {"type": "leaf", "panelId": panel_id}

    if node_type != "split":
        raise MultimodalRouteError(
            400, "layoutTree nodes must be leaf or split nodes"
        )

    direction = layout_tree.get("direction")
    if direction not in ("row", "column"):
        raise MultimodalRouteError(
            400, "layoutTree split direction must be row or column"
        )

    return {
        "type": "split",
        "direction": direction,
        "splitPercentage": _normalize_split_percentage(
            layout_tree.get("splitPercentage")
        ),
        "first": _normalize_layout_tree(layout_tree.get("first")),
        "second": _normalize_layout_tree(layout_tree.get("second")),
    }


def _collect_layout_leaf_panel_ids(layout_tree):
    if layout_tree is None:
        return []

    if layout_tree.get("type") == "leaf":
        return [layout_tree["panelId"]]

    return _collect_layout_leaf_panel_ids(
        layout_tree["first"]
    ) + _collect_layout_leaf_panel_ids(layout_tree["second"])


def _validate_layout_tree(layout_tree, panels):
    panel_ids = [panel.panel_id for panel in panels]
    if not panel_ids:
        if layout_tree is not None:
            raise MultimodalRouteError(
                400, "layoutTree must be null when there are no panels"
            )

        return None

    if layout_tree is None:
        raise MultimodalRouteError(
            400, "layoutTree is required when panels are present"
        )

    normalized_layout_tree = _normalize_layout_tree(layout_tree)
    leaf_panel_ids = _collect_layout_leaf_panel_ids(normalized_layout_tree)
    panel_id_counts = OrderedDict()
    for panel_id in leaf_panel_ids:
        panel_id_counts[panel_id] = panel_id_counts.get(panel_id, 0) + 1

    duplicate_panel_ids = [
        panel_id for panel_id, count in panel_id_counts.items() if count > 1
    ]
    if duplicate_panel_ids:
        raise MultimodalRouteError(
            400,
            "layoutTree contains duplicate panel ids: %s"
            % ", ".join(duplicate_panel_ids),
        )

    unknown_panel_ids = [
        panel_id for panel_id in leaf_panel_ids if panel_id not in panel_ids
    ]
    if unknown_panel_ids:
        raise MultimodalRouteError(
            400,
            "layoutTree references unknown panel ids: %s"
            % ", ".join(sorted(set(unknown_panel_ids))),
        )

    missing_panel_ids = [
        panel_id for panel_id in panel_ids if panel_id not in leaf_panel_ids
    ]
    if missing_panel_ids:
        raise MultimodalRouteError(
            400,
            "layoutTree is missing panel ids: %s"
            % ", ".join(missing_panel_ids),
        )

    return normalized_layout_tree


def _validate_known_stream_ids(stream_ids, stream_lookup):
    unknown_stream_ids = [
        stream_id for stream_id in stream_ids if stream_id not in stream_lookup
    ]
    if unknown_stream_ids:
        raise MultimodalRouteError(
            400,
            "Unknown multimodal stream id(s): %s"
            % ", ".join(sorted(unknown_stream_ids)),
        )


def _serialize_rendering_plan(rendering_plan):
    return {
        "sceneId": rendering_plan.scene_id,
        "mediaField": rendering_plan.media_field,
        "sourceKind": rendering_plan.source_kind,
        "sync": {
            "timestampSource": rendering_plan.sync.timestamp_source,
            "fallback": rendering_plan.sync.fallback,
            "mode": rendering_plan.sync.mode,
        },
        "panels": [
            {
                "panelId": panel.panel_id,
                "archetype": panel.archetype,
                "title": panel.title,
                "renderStreamId": panel.render_stream_id,
                "visibleStreamIds": list(panel.visible_stream_ids or []),
                "frameConfig": {
                    "fixedFrameId": panel.frame_config.fixed_frame_id,
                    "displayFrameId": panel.frame_config.display_frame_id,
                    "followMode": panel.frame_config.follow_mode,
                    "locationStreamId": panel.frame_config.location_stream_id,
                    "enuFrameId": panel.frame_config.enu_frame_id,
                },
                "sceneConfig": {
                    "upAxis": panel.scene_config.up_axis,
                    "backgroundColor": panel.scene_config.background_color,
                    "showGrid": bool(panel.scene_config.show_grid),
                },
            }
            for panel in rendering_plan.panels
        ],
        "sidebarWidth": int(
            getattr(rendering_plan, "sidebar_width", DEFAULT_SIDEBAR_WIDTH)
            or DEFAULT_SIDEBAR_WIDTH
        ),
        "layoutTree": _normalize_layout_tree(rendering_plan.layout_tree),
    }


def _normalize_required_string(value, field_name):
    if not isinstance(value, str) or not value:
        raise MultimodalRouteError(
            400, "%s must be a non-empty string" % field_name
        )

    return value


def _normalize_optional_string(value, field_name):
    if value is None or value == "":
        return None

    if not isinstance(value, str):
        raise MultimodalRouteError(
            400, "%s must be a string or null" % field_name
        )

    return value


def _normalize_sidebar_width(value):
    if value is None:
        return DEFAULT_SIDEBAR_WIDTH

    try:
        width = int(value)
    except Exception as error:
        raise MultimodalRouteError(
            400, "sidebarWidth must be an integer"
        ) from error

    if width < MIN_SIDEBAR_WIDTH or width > MAX_SIDEBAR_WIDTH:
        raise MultimodalRouteError(
            400,
            "sidebarWidth must be between %d and %d"
            % (MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH),
        )

    return width


def _normalize_boolean(value, field_name, default):
    if value is None:
        return default

    if not isinstance(value, bool):
        raise MultimodalRouteError(
            400, "%s must be true or false" % field_name
        )

    return value


def _normalize_frame_config(data, frame_ids, location_stream_ids):
    if data is None:
        data = {}

    if not isinstance(data, dict):
        raise MultimodalRouteError(400, "frameConfig must be an object")

    fixed_frame_id = _normalize_optional_string(
        data.get("fixedFrameId"), "frameConfig.fixedFrameId"
    )
    display_frame_id = _normalize_optional_string(
        data.get("displayFrameId"), "frameConfig.displayFrameId"
    )
    enu_frame_id = _normalize_optional_string(
        data.get("enuFrameId"), "frameConfig.enuFrameId"
    )
    location_stream_id = _normalize_optional_string(
        data.get("locationStreamId"), "frameConfig.locationStreamId"
    )
    follow_mode = data.get("followMode") or "off"
    if follow_mode not in ("off", "position", "pose"):
        raise MultimodalRouteError(
            400,
            "frameConfig.followMode must be one of off, position, or pose",
        )

    for field_name, frame_id in (
        ("frameConfig.fixedFrameId", fixed_frame_id),
        ("frameConfig.displayFrameId", display_frame_id),
        ("frameConfig.enuFrameId", enu_frame_id),
    ):
        if frame_id and frame_id not in frame_ids:
            raise MultimodalRouteError(
                400, "Unknown frame id for %s: %s" % (field_name, frame_id)
            )

    if (
        location_stream_id is not None
        and location_stream_id not in location_stream_ids
    ):
        raise MultimodalRouteError(
            400,
            "Unknown location stream id for frameConfig.locationStreamId: %s"
            % location_stream_id,
        )

    return fopr.PanelFrameConfig(
        fixed_frame_id=fixed_frame_id,
        display_frame_id=display_frame_id,
        follow_mode=follow_mode,
        location_stream_id=location_stream_id,
        enu_frame_id=enu_frame_id,
    )


def _normalize_scene_config(data):
    if data is None:
        data = {}

    if not isinstance(data, dict):
        raise MultimodalRouteError(400, "sceneConfig must be an object")

    up_axis = data.get("upAxis") or "z"
    if up_axis not in ("x", "y", "z"):
        raise MultimodalRouteError(
            400, "sceneConfig.upAxis must be x, y, or z"
        )

    background_color = (
        data.get("backgroundColor")
        if data.get("backgroundColor") is not None
        else "#10151d"
    )
    if not isinstance(background_color, str) or not background_color:
        raise MultimodalRouteError(
            400, "sceneConfig.backgroundColor must be a non-empty string"
        )

    return fopr.PanelSceneConfig(
        up_axis=up_axis,
        background_color=background_color,
        show_grid=_normalize_boolean(
            data.get("showGrid"), "sceneConfig.showGrid", True
        ),
    )


def _validate_panel_stream_ids(
    panel_id, archetype, render_stream_id, visible_stream_ids, stream_lookup
):
    stream_ids = []
    if render_stream_id is not None:
        stream_ids.append(render_stream_id)

    stream_ids.extend(visible_stream_ids)
    _validate_known_stream_ids(stream_ids, stream_lookup)

    incompatible_stream_ids = [
        stream_id
        for stream_id in stream_ids
        if archetype not in (stream_lookup[stream_id].compatible_panels or [])
    ]
    if incompatible_stream_ids:
        raise MultimodalRouteError(
            400,
            "Panel %s contains streams incompatible with %s: %s"
            % (
                panel_id,
                archetype,
                ", ".join(sorted(incompatible_stream_ids)),
            ),
        )


def _normalize_panel_plan_payload(
    panel_data, stream_lookup, frame_ids, location_stream_ids
):
    if not isinstance(panel_data, dict):
        raise MultimodalRouteError(400, "Each panel must be an object")

    panel_id = _normalize_required_string(panel_data.get("panelId"), "panelId")
    archetype = panel_data.get("archetype")
    if archetype not in ("image", "3d"):
        raise MultimodalRouteError(400, "panel archetype must be image or 3d")

    title = _normalize_required_string(panel_data.get("title"), "title")
    render_stream_id = _normalize_optional_string(
        panel_data.get("renderStreamId"), "renderStreamId"
    )
    visible_stream_ids = panel_data.get("visibleStreamIds", [])
    if visible_stream_ids is None:
        raise MultimodalRouteError(
            400, "visibleStreamIds must be a list or omitted"
        )
    if not isinstance(visible_stream_ids, list):
        raise MultimodalRouteError(400, "visibleStreamIds must be a list")
    if any(
        not isinstance(stream_id, str) or not stream_id
        for stream_id in visible_stream_ids
    ):
        raise MultimodalRouteError(
            400, "visibleStreamIds must contain non-empty strings"
        )

    _validate_panel_stream_ids(
        panel_id,
        archetype,
        render_stream_id,
        visible_stream_ids,
        stream_lookup,
    )

    return fopr.PanelPlan(
        panel_id=panel_id,
        archetype=archetype,
        title=title,
        render_stream_id=render_stream_id,
        visible_stream_ids=visible_stream_ids,
        frame_config=_normalize_frame_config(
            panel_data.get("frameConfig"),
            frame_ids=frame_ids,
            location_stream_ids=location_stream_ids,
        ),
        scene_config=_normalize_scene_config(panel_data.get("sceneConfig")),
    )


def _normalize_rendering_plan_payload(
    rendering_plan, metadata, current_rendering_plan=None
):
    scene_id = _normalize_required_string(
        rendering_plan.get("sceneId"), "sceneId"
    )
    media_field = _normalize_required_string(
        rendering_plan.get("mediaField"), "mediaField"
    )
    source_kind = _normalize_required_string(
        rendering_plan.get("sourceKind") or metadata.source_kind,
        "sourceKind",
    )
    if scene_id != metadata.scene_id:
        raise MultimodalRouteError(
            400, "sceneId does not match the current sample workspace"
        )

    if media_field != metadata.media_field:
        raise MultimodalRouteError(
            400, "mediaField does not match the current sample workspace"
        )

    if source_kind != metadata.source_kind:
        raise MultimodalRouteError(
            400, "sourceKind does not match the current sample workspace"
        )

    sync_data = rendering_plan.get("sync") or {}
    if not isinstance(sync_data, dict):
        raise MultimodalRouteError(400, "sync must be an object")

    current_sync = (
        current_rendering_plan.sync
        if current_rendering_plan is not None
        else None
    )
    timestamp_source = sync_data.get(
        "timestampSource",
        (
            current_sync.timestamp_source
            if current_sync is not None
            else "header.stamp"
        ),
    )
    fallback = sync_data.get(
        "fallback",
        current_sync.fallback if current_sync is not None else "log_time",
    )
    if timestamp_source not in ("header.stamp", "publish_time", "log_time"):
        raise MultimodalRouteError(
            400,
            "timestampSource must be one of "
            "'header.stamp', 'publish_time', or 'log_time'",
        )
    if fallback not in ("publish_time", "log_time"):
        raise MultimodalRouteError(
            400,
            "fallback must be one of 'publish_time' or 'log_time'",
        )

    sync = fopr.SyncConfig(
        timestamp_source=timestamp_source,
        fallback=fallback,
        mode=sync_data.get(
            "mode",
            current_sync.mode if current_sync is not None else "nearest",
        ),
    )
    if sync.mode not in ("nearest", "strict", "latest"):
        raise MultimodalRouteError(
            400, "sync.mode must be one of nearest, strict, or latest"
        )

    panels_data = rendering_plan.get("panels")
    if not isinstance(panels_data, list):
        raise MultimodalRouteError(400, "panels must be a list")

    stream_lookup = {stream.stream_id: stream for stream in metadata.streams}
    frame_ids = {frame.frame_id for frame in metadata.frames}
    location_stream_ids = {
        topic.stream_id for topic in metadata.location_topics
    }
    panels = [
        _normalize_panel_plan_payload(
            panel_data,
            stream_lookup=stream_lookup,
            frame_ids=frame_ids,
            location_stream_ids=location_stream_ids,
        )
        for panel_data in panels_data
    ]
    panel_ids = [panel.panel_id for panel in panels]
    duplicate_panel_ids = [
        panel_id for panel_id in panel_ids if panel_ids.count(panel_id) > 1
    ]
    if duplicate_panel_ids:
        raise MultimodalRouteError(
            400,
            "panels contains duplicate panel ids: %s"
            % ", ".join(sorted(set(duplicate_panel_ids))),
        )

    return fopr.MultimodalRenderingPlan(
        source_kind=source_kind,
        media_field=media_field,
        scene_id=scene_id,
        sync=sync,
        panels=panels,
        sidebar_width=_normalize_sidebar_width(
            rendering_plan.get(
                "sidebarWidth",
                (
                    getattr(
                        current_rendering_plan,
                        "sidebar_width",
                        DEFAULT_SIDEBAR_WIDTH,
                    )
                    if current_rendering_plan is not None
                    else DEFAULT_SIDEBAR_WIDTH
                ),
            )
        ),
        layout_tree=_validate_layout_tree(
            rendering_plan.get("layoutTree"), panels
        ),
    )


def _choose_default_fixed_frame(metadata, streams):
    frame_ids = [stream.frame_id for stream in streams if stream.frame_id]
    if not frame_ids:
        return None

    candidate_frame_ids = [frame.frame_id for frame in metadata.frames]
    if not candidate_frame_ids:
        return frame_ids[0]

    connected_candidate_frame_ids = [
        candidate_frame_id
        for candidate_frame_id in candidate_frame_ids
        if all(
            _frames_are_connected(
                metadata.transforms,
                stream_frame_id,
                candidate_frame_id,
            )
            for stream_frame_id in frame_ids
        )
    ]
    if not connected_candidate_frame_ids:
        return frame_ids[0]

    normalized_candidates = {
        candidate_frame_id.lower(): candidate_frame_id
        for candidate_frame_id in connected_candidate_frame_ids
    }
    for preferred_frame_id in PREFERRED_GLOBAL_FRAME_IDS:
        if preferred_frame_id in normalized_candidates:
            return normalized_candidates[preferred_frame_id]

    for preferred_frame_id in PREFERRED_EGO_FRAME_IDS:
        if preferred_frame_id in normalized_candidates:
            return normalized_candidates[preferred_frame_id]

    extra_candidate_frame_ids = [
        candidate_frame_id
        for candidate_frame_id in connected_candidate_frame_ids
        if candidate_frame_id not in frame_ids
    ]
    if extra_candidate_frame_ids:
        return extra_candidate_frame_ids[0]

    return connected_candidate_frame_ids[0]


def _choose_default_follow_frame(metadata, fixed_frame_id):
    if not fixed_frame_id:
        return None

    normalized_candidates = {
        frame.frame_id.lower(): frame.frame_id
        for frame in metadata.frames
        if frame.frame_id
        and frame.frame_id != fixed_frame_id
        and _frames_are_connected(
            metadata.transforms,
            frame.frame_id,
            fixed_frame_id,
        )
    }

    for preferred_frame_id in PREFERRED_EGO_FRAME_IDS:
        if preferred_frame_id in normalized_candidates:
            return normalized_candidates[preferred_frame_id]

    return None


def _get_stream_topic_prefix(topic):
    if not topic:
        return None

    if "/" not in topic:
        return topic

    prefix, _separator, _suffix = topic.rpartition("/")
    return prefix or topic


def _get_default_image_support_stream_ids(metadata, image_stream):
    image_topic = getattr(image_stream, "topic", "")
    image_topic_prefix = _get_stream_topic_prefix(image_topic)
    if not image_topic and not image_topic_prefix:
        return []

    support_stream_ids = []
    for stream in metadata.streams:
        if stream.stream_id == image_stream.stream_id:
            continue

        if stream.schema_name not in (
            "foxglove.ImageAnnotations",
            "foxglove.CameraCalibration",
        ):
            continue

        stream_topic_prefix = _get_stream_topic_prefix(stream.topic)
        if not (
            (image_topic and stream.topic.startswith(image_topic + "/"))
            or (
                image_topic_prefix
                and stream_topic_prefix == image_topic_prefix
            )
        ):
            continue

        support_stream_ids.append(stream.stream_id)

    return support_stream_ids


def _frames_are_connected(transforms, source_frame_id, target_frame_id):
    if source_frame_id == target_frame_id:
        return True

    neighbors = {}
    for transform in transforms:
        neighbors.setdefault(transform.parent_frame_id, set()).add(
            transform.child_frame_id
        )
        neighbors.setdefault(transform.child_frame_id, set()).add(
            transform.parent_frame_id
        )

    queue = deque([source_frame_id])
    visited = {source_frame_id}
    while queue:
        current = queue.popleft()
        for neighbor in neighbors.get(current, ()):
            if neighbor == target_frame_id:
                return True
            if neighbor in visited:
                continue
            visited.add(neighbor)
            queue.append(neighbor)

    return False
