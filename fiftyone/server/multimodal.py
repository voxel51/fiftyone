"""
FiftyOne Server multimodal ingest and workspace helpers.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from abc import ABC, abstractmethod
from collections import OrderedDict, deque
import importlib
import json
import logging
import os
import re
import struct
import time

import cachetools
import fiftyone.core.fields as fof
import fiftyone.core.metadata as fom
import fiftyone.core.rendering as fopr
from fiftyone.server.mcap_cdr import (
    McapCdrDecodeError,
    decode_catalog_details,
    decode_sync_timestamp_ns,
)
from fiftyone.server.mcap_foxglove import (
    McapFoxgloveDecodeError,
    decode_catalog_details as decode_foxglove_catalog_details,
    decode_sync_timestamp_ns as decode_foxglove_sync_timestamp_ns,
)

logger = logging.getLogger(__name__)

_CATALOG_VERSION = "multimodal-workspace-v4"
_DEFAULT_SIDEBAR_WIDTH = 208
_MIN_SIDEBAR_WIDTH = 176
_MAX_SIDEBAR_WIDTH = 420
_DEFAULT_SOURCE_KIND = "mcap"
_DEFAULT_STREAM = {
    "kind": "other",
    "affordances": [],
    "compatible_panels": [],
    "location_mode": None,
}
_DEFAULT_IMAGE_PANEL_LIMIT = 3
_PREFERRED_IMAGE_PANEL_TOKENS = ("front", "left", "right")
_PREFERRED_GLOBAL_FRAME_IDS = ("odom", "map", "world")
_PREFERRED_EGO_FRAME_IDS = (
    "base_link",
    "ego_vehicle",
    "ego",
    "vehicle",
)

_MULTIMODAL_SERVICE = None
_DEFAULT_BOOTSTRAP_TRANSFORM_WINDOW_NS = 1_000_000_000
_DEFAULT_BOOTSTRAP_RENDER_MESSAGE_COUNT = 2
_TIMELINE_INDEX_CACHE_MAX_ENTRIES = 4
_TIMELINE_INDEX_CACHE_TTL_SECONDS = 300
MULTIMODAL_RAW_BUFFER_BINARY_CONTENT_TYPE = (
    "application/x-fiftyone-multimodal-raw-buffer"
)
_MULTIMODAL_RAW_BUFFER_BINARY_MAGIC = b"MMRB"
_MULTIMODAL_RAW_BUFFER_BINARY_VERSION = 1


class MultimodalError(Exception):
    """Base class for multimodal service exceptions."""


class MultimodalDependencyError(MultimodalError):
    """Raised when a multimodal runtime dependency is unavailable."""


class MultimodalRouteError(MultimodalError):
    """Raised when the request cannot be fulfilled as specified."""

    def __init__(self, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class PersistedMultimodalWorkspaceState:
    """Persisted multimodal workspace state loaded from a sample."""

    def __init__(self, metadata=None, rendering_plan=None):
        self.metadata = metadata
        self.rendering_plan = rendering_plan


class MultimodalSourceAdapter(ABC):
    """Abstract adapter for reading multimodal source data."""

    @abstractmethod
    def build_catalog(self, source_path, media_field, scene_id):
        """Builds a persisted catalog for the given source."""

    @abstractmethod
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
        """Reads raw message payloads for the requested streams."""

    @abstractmethod
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
        """Reads a boot-oriented raw window for first paint."""

    @abstractmethod
    def read_timeline_index(
        self,
        source_path,
        stream_ids=None,
        timestamp_source="log_time",
        fallback="log_time",
    ):
        """Reads timestamp indexes for the requested streams."""

    @abstractmethod
    def get_source_fingerprint(self, source_path):
        """Builds a cheap fingerprint for the source file."""


class SchemaCodec(ABC):
    """Interface for schema-aware multimodal stream inspection."""

    def __init__(
        self,
        schema_name,
        kind,
        affordances=None,
        compatible_panels=None,
        location_mode=None,
    ):
        self.schema_name = schema_name
        self.kind = kind
        self.affordances = list(affordances or [])
        self.compatible_panels = list(compatible_panels or [])
        self.location_mode = location_mode

    def describe_stream(self):
        """Returns the static stream classification for this codec."""
        return {
            "kind": self.kind,
            "affordances": list(self.affordances),
            "compatible_panels": list(self.compatible_panels),
            "location_mode": self.location_mode,
        }

    @abstractmethod
    def decode_catalog_details(self, schema, payload):
        """Decodes stream inventory details from one raw payload."""

    @abstractmethod
    def decode_sync_timestamp_ns(self, schema, payload):
        """Decodes the preferred sync timestamp from one raw payload."""


class RosSchemaCodec(SchemaCodec):
    """ROS2 CDR-backed codec for one multimodal message schema."""

    def decode_catalog_details(self, schema, payload):
        del schema
        return decode_catalog_details(self.schema_name, payload)

    def decode_sync_timestamp_ns(self, schema, payload):
        del schema
        return decode_sync_timestamp_ns(self.schema_name, payload)


class FoxgloveSchemaCodec(SchemaCodec):
    """Foxglove protobuf-backed codec for one multimodal message schema."""

    def decode_catalog_details(self, schema, payload):
        return decode_foxglove_catalog_details(schema, payload)

    def decode_sync_timestamp_ns(self, schema, payload):
        return decode_foxglove_sync_timestamp_ns(schema, payload)


class SchemaCodecRegistry:
    """Registry of schema-aware multimodal codecs."""

    def __init__(self, codecs=None):
        self._codecs = {}
        for codec in codecs or []:
            self.register(codec)

    def register(self, codec):
        self._codecs[codec.schema_name] = codec

    def get(self, schema_name):
        if not schema_name:
            return None

        return self._codecs.get(schema_name)

    def _get_codec(self, schema):
        return self.get(_get_schema_name(schema))

    def classify_stream(self, schema_name):
        codec = self.get(schema_name)
        if codec is None:
            return dict(_DEFAULT_STREAM)

        return codec.describe_stream()

    def decode_catalog_details(self, schema, payload):
        codec = self._get_codec(schema)
        if codec is None:
            return {}

        return codec.decode_catalog_details(schema, payload)

    def decode_sync_timestamp_ns(self, schema, payload):
        codec = self._get_codec(schema)
        if codec is None:
            return None

        return codec.decode_sync_timestamp_ns(schema, payload)


class SourceAdapterRegistry:
    """Registry of built-in multimodal source adapters."""

    def __init__(self):
        self._adapter_entries = {}
        self._extension_map = {}

    def register(self, source_kind, adapter, extensions=None):
        self._adapter_entries[source_kind] = adapter
        for extension in extensions or ():
            self._extension_map[extension.lower()] = source_kind

    def get(self, source_kind):
        try:
            return self._adapter_entries[source_kind]
        except KeyError as error:
            raise MultimodalRouteError(
                400, "Unsupported multimodal source kind '%s'" % source_kind
            ) from error

    def infer(self, source_path):
        extension = os.path.splitext(source_path)[1].lower()
        source_kind = self._extension_map.get(extension)
        if source_kind is None:
            raise MultimodalRouteError(
                400,
                "Unable to infer a multimodal source adapter for '%s'"
                % source_path,
            )

        return source_kind


def _get_schema_name(schema):
    if isinstance(schema, str):
        return schema

    return getattr(schema, "name", None)


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


def _build_builtin_schema_codec_registry():
    registry = SchemaCodecRegistry()
    for codec in (
        RosSchemaCodec(
            "sensor_msgs/msg/CompressedImage",
            kind="image",
            affordances=["image"],
            compatible_panels=["image"],
        ),
        RosSchemaCodec(
            "sensor_msgs/msg/PointCloud2",
            kind="3d",
            affordances=["pointcloud", "3d"],
            compatible_panels=["3d"],
        ),
        RosSchemaCodec(
            "sensor_msgs/msg/LaserScan",
            kind="3d",
            affordances=["laserscan", "3d"],
            compatible_panels=["3d"],
        ),
        RosSchemaCodec(
            "visualization_msgs/msg/MarkerArray",
            kind="3d",
            affordances=["markerarray", "3d"],
            compatible_panels=["3d"],
        ),
        RosSchemaCodec(
            "tf2_msgs/msg/TFMessage",
            kind="transform",
            affordances=["transforms"],
        ),
        RosSchemaCodec(
            "nav_msgs/msg/Odometry",
            kind="location",
            affordances=["location", "position", "pose"],
            location_mode="pose",
        ),
        RosSchemaCodec(
            "geometry_msgs/msg/PoseStamped",
            kind="location",
            affordances=["location", "position", "pose"],
            location_mode="pose",
        ),
        RosSchemaCodec(
            "geometry_msgs/msg/PoseWithCovarianceStamped",
            kind="location",
            affordances=["location", "position", "pose"],
            location_mode="pose",
        ),
        RosSchemaCodec(
            "sensor_msgs/msg/NavSatFix",
            kind="location",
            affordances=["location", "position", "navsat"],
            location_mode="navsat",
        ),
        FoxgloveSchemaCodec(
            "foxglove.CompressedImage",
            kind="image",
            affordances=["image"],
            compatible_panels=["image"],
        ),
        FoxgloveSchemaCodec(
            "foxglove.PointCloud",
            kind="3d",
            affordances=["pointcloud", "3d"],
            compatible_panels=["3d"],
        ),
        FoxgloveSchemaCodec(
            "foxglove.SceneUpdate",
            kind="3d",
            affordances=["sceneupdate", "overlay", "3d"],
            compatible_panels=["3d", "image"],
        ),
        FoxgloveSchemaCodec(
            "foxglove.ImageAnnotations",
            kind="other",
            affordances=["image-annotations", "overlay"],
            compatible_panels=["image"],
        ),
        FoxgloveSchemaCodec(
            "foxglove.CameraCalibration",
            kind="other",
            affordances=["camera", "calibration"],
            compatible_panels=["image"],
        ),
        FoxgloveSchemaCodec(
            "foxglove.FrameTransform",
            kind="transform",
            affordances=["transforms"],
        ),
    ):
        registry.register(codec)

    return registry


_SCHEMA_CODEC_REGISTRY = _build_builtin_schema_codec_registry()


class McapSourceAdapter(MultimodalSourceAdapter):
    """MCAP source adapter backed by ``mcap.reader``."""

    def __init__(self, codec_registry=None):
        self._codec_registry = codec_registry or _SCHEMA_CODEC_REGISTRY

    def build_catalog(self, source_path, media_field, scene_id):
        with open(source_path, "rb") as stream:
            reader = _get_mcap_reader_module().make_reader(stream)
            return _catalog_reader(
                reader=reader,
                scene_id=scene_id,
                media_field=media_field,
                source_path=source_path,
                source_kind="mcap",
                codec_registry=self._codec_registry,
            )

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
        response_streams = OrderedDict(
            (stream_id, []) for stream_id in stream_ids
        )
        message_indexes = {stream_id: 0 for stream_id in stream_ids}

        with open(source_path, "rb") as stream:
            reader = _get_mcap_reader_module().make_reader(stream)
            for schema, channel, message in _iter_reader_messages(
                reader,
                topics=stream_ids,
                start_ns=start_time_ns,
                end_ns=end_time_ns,
            ):
                stream_id = channel.topic
                if (
                    max_messages_per_stream is not None
                    and message_indexes[stream_id] >= max_messages_per_stream
                ):
                    continue

                message_index = message_indexes[stream_id]
                message_indexes[stream_id] += 1
                response_streams[stream_id].append(
                    _build_raw_message_record(
                        schema=schema,
                        stream_id=stream_id,
                        message=message,
                        message_index=message_index,
                        codec_registry=self._codec_registry,
                        timestamp_source=timestamp_source,
                        fallback=fallback,
                    )
                )

        return response_streams

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
        render_stream_ids = list(render_stream_ids or [])
        transform_stream_ids = list(transform_stream_ids or [])
        location_stream_ids = list(location_stream_ids or [])
        auxiliary_stream_ids = transform_stream_ids + location_stream_ids
        render_message_count = int(
            render_message_count or _DEFAULT_BOOTSTRAP_RENDER_MESSAGE_COUNT
        )
        transform_window_ns = int(
            transform_window_ns or _DEFAULT_BOOTSTRAP_TRANSFORM_WINDOW_NS
        )
        response_streams = OrderedDict()
        message_indexes = {}

        for stream_id in render_stream_ids + auxiliary_stream_ids:
            if stream_id in response_streams:
                continue
            response_streams[stream_id] = []
            message_indexes[stream_id] = 0

        with open(source_path, "rb") as stream:
            reader = _get_mcap_reader_module().make_reader(stream)
            unresolved_render_stream_ids = set(render_stream_ids)

            for schema, channel, message in _iter_reader_messages(
                reader, topics=render_stream_ids or None
            ):
                stream_id = channel.topic
                if stream_id not in unresolved_render_stream_ids:
                    continue

                sync_timestamp_ns = _resolve_message_sync_timestamp_ns(
                    codec_registry=self._codec_registry,
                    schema_name=(schema.name if schema is not None else None),
                    schema=schema,
                    payload=message.data,
                    log_time_ns=int(message.log_time),
                    publish_time_ns=int(message.publish_time),
                    timestamp_source=timestamp_source,
                    fallback=fallback,
                )
                if sync_timestamp_ns < anchor_time_ns:
                    continue

                message_index = message_indexes[stream_id]
                message_indexes[stream_id] += 1
                response_streams[stream_id].append(
                    _build_raw_message_record(
                        schema=schema,
                        stream_id=stream_id,
                        message=message,
                        message_index=message_index,
                        codec_registry=self._codec_registry,
                        timestamp_source=timestamp_source,
                        fallback=fallback,
                        sync_timestamp_ns=sync_timestamp_ns,
                    )
                )
                if len(response_streams[stream_id]) >= render_message_count:
                    unresolved_render_stream_ids.discard(stream_id)
                    if not unresolved_render_stream_ids:
                        break

        if auxiliary_stream_ids:
            auxiliary_start_time_ns = max(
                0, anchor_time_ns - transform_window_ns
            )
            auxiliary_end_time_ns = anchor_time_ns + transform_window_ns

            with open(source_path, "rb") as stream:
                reader = _get_mcap_reader_module().make_reader(stream)
                for schema, channel, message in _iter_reader_messages(
                    reader,
                    topics=auxiliary_stream_ids,
                    start_ns=auxiliary_start_time_ns,
                    end_ns=auxiliary_end_time_ns,
                ):
                    stream_id = channel.topic
                    message_index = message_indexes[stream_id]
                    message_indexes[stream_id] += 1
                    response_streams[stream_id].append(
                        _build_raw_message_record(
                            schema=schema,
                            stream_id=stream_id,
                            message=message,
                            message_index=message_index,
                            codec_registry=self._codec_registry,
                            timestamp_source=timestamp_source,
                            fallback=fallback,
                        )
                    )

        return response_streams

    def read_timeline_index(
        self,
        source_path,
        stream_ids=None,
        timestamp_source="log_time",
        fallback="log_time",
    ):
        topics = list(stream_ids) if stream_ids else None
        timeline_streams = OrderedDict()
        shared_timestamps = set()

        with open(source_path, "rb") as stream:
            reader = _get_mcap_reader_module().make_reader(stream)
            for _schema, channel, message in _iter_reader_messages(
                reader, topics=topics
            ):
                stream_id = channel.topic
                log_time_ns = int(message.log_time)
                publish_time_ns = int(message.publish_time)
                sync_timestamp_ns = _resolve_message_sync_timestamp_ns(
                    codec_registry=self._codec_registry,
                    schema_name=(
                        _schema.name if _schema is not None else None
                    ),
                    schema=_schema,
                    payload=message.data,
                    log_time_ns=log_time_ns,
                    publish_time_ns=publish_time_ns,
                    timestamp_source=timestamp_source,
                    fallback=fallback,
                )
                if stream_id not in timeline_streams:
                    timeline_streams[stream_id] = []

                timeline_streams[stream_id].append(
                    {
                        "timestamp_ns": sync_timestamp_ns,
                        "log_time_ns": log_time_ns,
                        "publish_time_ns": publish_time_ns,
                    }
                )
                shared_timestamps.add(sync_timestamp_ns)

        return {
            "timestamps_ns": sorted(shared_timestamps),
            "streams": OrderedDict(
                (
                    stream_id,
                    sorted(
                        stream_timestamps,
                        key=lambda sample: (
                            sample["timestamp_ns"],
                            sample["log_time_ns"],
                        ),
                    ),
                )
                for stream_id, stream_timestamps in timeline_streams.items()
            ),
        }

    def get_source_fingerprint(self, source_path):
        stat = os.stat(source_path)
        return fom.MultimodalSourceFingerprint(
            path=source_path,
            size_bytes=int(stat.st_size),
            mtime_ns=int(stat.st_mtime_ns),
        )


class MultimodalRenderingPlanner(ABC):
    """Abstract builder for persisted multimodal rendering plans."""

    @abstractmethod
    def build_rendering_plan(self, metadata):
        """Builds a rendering plan for the given catalog."""


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
            sidebar_width=_DEFAULT_SIDEBAR_WIDTH,
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

    for token in _PREFERRED_IMAGE_PANEL_TOKENS:
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

    for token in _PREFERRED_IMAGE_PANEL_TOKENS:
        for stream in image_streams:
            if len(selected_streams) >= _DEFAULT_IMAGE_PANEL_LIMIT:
                return selected_streams

            if stream.stream_id in selected_stream_ids:
                continue

            if preferred_slots[stream.stream_id] != token:
                continue

            selected_streams.append(stream)
            selected_stream_ids.add(stream.stream_id)
            break

    for stream in image_streams:
        if len(selected_streams) >= _DEFAULT_IMAGE_PANEL_LIMIT:
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


class SceneStateRepository(ABC):
    """Abstract repository for persisted multimodal workspace state."""

    @abstractmethod
    def ensure_schema(self, dataset):
        """Ensures the dataset can persist rendering plans."""

    @abstractmethod
    def load(self, sample):
        """Loads persisted workspace state from the sample."""

    @abstractmethod
    def save(self, dataset, sample, metadata, rendering_plan):
        """Persists workspace state on the sample."""


class SampleMultimodalSceneRepository(SceneStateRepository):
    """Sample-backed repository for multimodal workspace state."""

    def ensure_schema(self, dataset):
        if dataset.has_sample_field("rendering_plan"):
            return

        dataset.add_sample_field(
            "rendering_plan",
            fof.EmbeddedDocumentField,
            embedded_doc_type=fopr.RenderingPlan,
        )

    def load(self, sample):
        metadata = sample.metadata
        if not isinstance(metadata, fom.MultimodalMetadata):
            metadata = None

        rendering_plan = None
        if sample.has_field("rendering_plan"):
            rendering_plan = sample["rendering_plan"]

        if not isinstance(rendering_plan, fopr.MultimodalRenderingPlan):
            rendering_plan = None

        return PersistedMultimodalWorkspaceState(
            metadata=metadata,
            rendering_plan=rendering_plan,
        )

    def save(self, dataset, sample, metadata, rendering_plan):
        self.ensure_schema(dataset)
        sample.metadata = metadata
        sample["rendering_plan"] = rendering_plan
        sample.save()
        return PersistedMultimodalWorkspaceState(
            metadata=sample.metadata,
            rendering_plan=sample["rendering_plan"],
        )


class MultimodalWorkspaceService:
    """Service that owns multimodal ingest and sample-backed workspace reads."""

    def __init__(
        self,
        adapter_registry=None,
        planner=None,
        repository=None,
        adapter=None,
    ):
        if adapter_registry is None:
            adapter_registry = SourceAdapterRegistry()

        if adapter is not None:
            adapter_registry.register(
                _DEFAULT_SOURCE_KIND,
                adapter,
                extensions=[".mcap"],
            )

        self._adapter_registry = adapter_registry
        self._planner = planner or DefaultMultimodalRenderingPlanner()
        self._repository = repository or SampleMultimodalSceneRepository()
        self._timeline_index_cache = cachetools.TTLCache(
            maxsize=_TIMELINE_INDEX_CACHE_MAX_ENTRIES,
            ttl=_TIMELINE_INDEX_CACHE_TTL_SECONDS,
        )

    def ingest_workspace(
        self,
        dataset,
        sample,
        media_field,
        overwrite=False,
        source_kind=None,
    ):
        source_path = _resolve_media_path(sample, media_field)
        scene_id = _build_scene_id(dataset, sample, media_field)
        state = self._repository.load(sample)
        if state.metadata is not None:
            source_kind = source_kind or state.metadata.source_kind

        if source_kind is None:
            source_kind = self._adapter_registry.infer(source_path)

        adapter = self._adapter_registry.get(source_kind)
        source_fingerprint = adapter.get_source_fingerprint(source_path)

        if not overwrite and not _requires_ingest(
            metadata=state.metadata,
            rendering_plan=state.rendering_plan,
            media_field=media_field,
            source_fingerprint=source_fingerprint,
            source_kind=source_kind,
        ):
            return state

        started_at = time.perf_counter()
        metadata = adapter.build_catalog(
            scene_id=scene_id,
            media_field=media_field,
            source_path=source_path,
        )
        rendering_plan = self._planner.build_rendering_plan(metadata)
        persisted_state = self._repository.save(
            dataset=dataset,
            sample=sample,
            metadata=metadata,
            rendering_plan=rendering_plan,
        )
        logger.debug(
            "Ingested multimodal workspace %s in %.3f ms (%d streams)",
            source_path,
            (time.perf_counter() - started_at) * 1000,
            len(metadata.streams),
        )
        return persisted_state

    def get_workspace(self, dataset, sample, media_field, source_kind=None):
        return self.ingest_workspace(
            dataset=dataset,
            sample=sample,
            media_field=media_field,
            overwrite=False,
            source_kind=source_kind,
        )

    def update_workspace(self, dataset, sample, rendering_plan):
        if not isinstance(rendering_plan, dict):
            raise MultimodalRouteError(
                400, "Workspace request body must be a rendering plan object"
            )

        media_field = rendering_plan.get("mediaField")
        state = self.get_workspace(
            dataset=dataset,
            sample=sample,
            media_field=media_field,
            source_kind=rendering_plan.get("sourceKind"),
        )
        normalized_rendering_plan = _normalize_rendering_plan_payload(
            rendering_plan,
            metadata=state.metadata,
            current_rendering_plan=state.rendering_plan,
        )
        return self._repository.save(
            dataset=dataset,
            sample=sample,
            metadata=state.metadata,
            rendering_plan=normalized_rendering_plan,
        )

    def read_stream_window_binary(
        self,
        dataset,
        sample,
        media_field,
        stream_ids,
        start_time_ns,
        end_time_ns,
        max_messages_per_stream=None,
        source_kind=None,
    ):
        window_data = self._read_stream_window_data(
            dataset=dataset,
            sample=sample,
            media_field=media_field,
            stream_ids=stream_ids,
            start_time_ns=start_time_ns,
            end_time_ns=end_time_ns,
            max_messages_per_stream=max_messages_per_stream,
            source_kind=source_kind,
        )
        return _build_stream_window_binary_response(**window_data)

    def _read_stream_window_data(
        self,
        dataset,
        sample,
        media_field,
        stream_ids,
        start_time_ns,
        end_time_ns,
        max_messages_per_stream=None,
        source_kind=None,
    ):
        state = self.get_workspace(
            dataset, sample, media_field, source_kind=source_kind
        )
        stream_lookup = _build_stream_lookup(state.metadata)
        _validate_known_stream_ids(stream_ids, stream_lookup)
        scene_start_ns = _get_scene_start_ns(state.metadata)
        absolute_start_time_ns = _to_absolute_ns(start_time_ns, scene_start_ns)
        absolute_end_time_ns = _to_absolute_ns(end_time_ns, scene_start_ns)
        timestamp_source = _normalize_timestamp_source(
            state.rendering_plan.sync.timestamp_source
        )
        fallback = _normalize_timestamp_fallback(
            state.rendering_plan.sync.fallback
        )
        adapter = self._adapter_registry.get(state.metadata.source_kind)

        started_at = time.perf_counter()
        raw_messages = adapter.read_stream_window(
            source_path=state.metadata.source_path,
            stream_ids=stream_ids,
            start_time_ns=absolute_start_time_ns,
            end_time_ns=absolute_end_time_ns,
            max_messages_per_stream=max_messages_per_stream,
            timestamp_source=timestamp_source,
            fallback=fallback,
        )
        logger.debug(
            "Read multimodal stream window %s [%s, %s] in %.3f ms (%d streams)",
            state.metadata.source_path,
            absolute_start_time_ns,
            absolute_end_time_ns,
            (time.perf_counter() - started_at) * 1000,
            len(raw_messages),
        )
        return {
            "scene_id": state.metadata.scene_id,
            "start_time_ns": absolute_start_time_ns,
            "end_time_ns": absolute_end_time_ns,
            "stream_lookup": stream_lookup,
            "stream_ids": stream_ids,
            "raw_messages": raw_messages,
            "scene_start_ns": scene_start_ns,
        }

    def read_bootstrap_window_binary(
        self,
        dataset,
        sample,
        media_field,
        anchor_time_ns,
        render_stream_ids,
        transform_stream_ids,
        location_stream_ids,
        transform_window_ns=None,
        source_kind=None,
    ):
        window_data = self._read_bootstrap_window_data(
            dataset=dataset,
            sample=sample,
            media_field=media_field,
            anchor_time_ns=anchor_time_ns,
            render_stream_ids=render_stream_ids,
            transform_stream_ids=transform_stream_ids,
            location_stream_ids=location_stream_ids,
            transform_window_ns=transform_window_ns,
            source_kind=source_kind,
        )
        return _build_stream_window_binary_response(**window_data)

    def _read_bootstrap_window_data(
        self,
        dataset,
        sample,
        media_field,
        anchor_time_ns,
        render_stream_ids,
        transform_stream_ids,
        location_stream_ids,
        transform_window_ns=None,
        source_kind=None,
    ):
        state = self.get_workspace(
            dataset, sample, media_field, source_kind=source_kind
        )
        stream_lookup = _build_stream_lookup(state.metadata)
        scene_start_ns = _get_scene_start_ns(state.metadata)
        requested_stream_ids = []
        for stream_id in (
            list(render_stream_ids)
            + list(transform_stream_ids)
            + list(location_stream_ids)
        ):
            if stream_id not in requested_stream_ids:
                requested_stream_ids.append(stream_id)

        _validate_known_stream_ids(requested_stream_ids, stream_lookup)
        absolute_anchor_time_ns = _to_absolute_ns(
            anchor_time_ns, scene_start_ns
        )
        timestamp_source = _normalize_timestamp_source(
            state.rendering_plan.sync.timestamp_source
        )
        fallback = _normalize_timestamp_fallback(
            state.rendering_plan.sync.fallback
        )
        absolute_transform_window_ns = int(
            transform_window_ns or _DEFAULT_BOOTSTRAP_TRANSFORM_WINDOW_NS
        )
        adapter = self._adapter_registry.get(state.metadata.source_kind)

        started_at = time.perf_counter()
        raw_messages = adapter.read_bootstrap_window(
            source_path=state.metadata.source_path,
            anchor_time_ns=absolute_anchor_time_ns,
            render_stream_ids=render_stream_ids,
            transform_stream_ids=transform_stream_ids,
            location_stream_ids=location_stream_ids,
            transform_window_ns=absolute_transform_window_ns,
            render_message_count=_DEFAULT_BOOTSTRAP_RENDER_MESSAGE_COUNT,
            timestamp_source=timestamp_source,
            fallback=fallback,
        )
        logger.debug(
            "Read multimodal bootstrap window %s around %s in %.3f ms (%d streams)",
            state.metadata.source_path,
            absolute_anchor_time_ns,
            (time.perf_counter() - started_at) * 1000,
            len(requested_stream_ids),
        )
        absolute_start_time_ns = max(
            scene_start_ns,
            absolute_anchor_time_ns - absolute_transform_window_ns,
        )
        absolute_end_time_ns = (
            absolute_anchor_time_ns + absolute_transform_window_ns
        )
        return {
            "scene_id": state.metadata.scene_id,
            "start_time_ns": absolute_start_time_ns,
            "end_time_ns": absolute_end_time_ns,
            "stream_lookup": stream_lookup,
            "stream_ids": requested_stream_ids,
            "raw_messages": raw_messages,
            "scene_start_ns": scene_start_ns,
        }

    def read_timeline_index(
        self,
        dataset,
        sample,
        media_field,
        stream_ids=None,
        timestamp_source=None,
        fallback=None,
        source_kind=None,
    ):
        state = self.get_workspace(
            dataset, sample, media_field, source_kind=source_kind
        )
        stream_lookup = _build_stream_lookup(state.metadata)
        scene_start_ns = _get_scene_start_ns(state.metadata)
        if stream_ids is None:
            stream_ids = list(stream_lookup.keys())

        _validate_known_stream_ids(stream_ids, stream_lookup)
        timestamp_source = _normalize_timestamp_source(
            timestamp_source or state.rendering_plan.sync.timestamp_source
        )
        fallback = _normalize_timestamp_fallback(
            fallback or state.rendering_plan.sync.fallback
        )
        cache_key = _make_timeline_index_cache_key(
            metadata=state.metadata,
            stream_ids=stream_ids,
            timestamp_source=timestamp_source,
            fallback=fallback,
        )
        cached_response = self._timeline_index_cache.get(cache_key)
        if cached_response is not None:
            logger.debug(
                "Timeline cache hit for %s (%d streams)",
                state.metadata.source_path,
                len(stream_ids),
            )
            return cached_response

        adapter = self._adapter_registry.get(state.metadata.source_kind)

        started_at = time.perf_counter()
        timeline_index = adapter.read_timeline_index(
            source_path=state.metadata.source_path,
            stream_ids=stream_ids,
            timestamp_source=timestamp_source,
            fallback=fallback,
        )
        logger.debug(
            "Read multimodal timeline index %s in %.3f ms (%d streams, %d timestamps)",
            state.metadata.source_path,
            (time.perf_counter() - started_at) * 1000,
            len(stream_ids),
            len(timeline_index["timestamps_ns"]),
        )
        response = _build_timeline_index_response(
            scene_id=state.metadata.scene_id,
            timestamp_source=timestamp_source,
            timestamps_ns=timeline_index["timestamps_ns"],
            streams=[
                {
                    "streamId": stream_id,
                    "samples": timeline_index["streams"].get(stream_id, []),
                }
                for stream_id in stream_ids
            ],
            scene_start_ns=scene_start_ns,
        )
        self._timeline_index_cache[cache_key] = response
        return response


def ingest_sample_multimodal_workspace(
    dataset, sample, media_field, overwrite=False, source_kind=None
):
    """Persists the catalog and rendering plan for a multimodal sample."""
    service = _get_multimodal_service()
    state = service.ingest_workspace(
        dataset=dataset,
        sample=sample,
        media_field=media_field,
        overwrite=overwrite,
        source_kind=source_kind,
    )
    return _build_workspace_response(
        dataset=dataset,
        sample=sample,
        metadata=state.metadata,
        rendering_plan=state.rendering_plan,
    )


def inspect_sample_multimodal_workspace(
    dataset, sample, media_field, source_kind=None
):
    """Builds workspace inventory and rendering defaults for a sample."""
    state = _get_multimodal_service().get_workspace(
        dataset=dataset,
        sample=sample,
        media_field=media_field,
        source_kind=source_kind,
    )
    return _build_workspace_response(
        dataset=dataset,
        sample=sample,
        metadata=state.metadata,
        rendering_plan=state.rendering_plan,
    )


def update_sample_multimodal_workspace(dataset, sample, rendering_plan):
    """Persists the updated rendering plan for a multimodal sample."""
    state = _get_multimodal_service().update_workspace(
        dataset=dataset,
        sample=sample,
        rendering_plan=rendering_plan,
    )
    return _serialize_rendering_plan(state.rendering_plan)


def read_sample_multimodal_stream_window_binary(
    dataset,
    sample,
    media_field,
    stream_ids,
    start_time_ns,
    end_time_ns,
    max_messages_per_stream=None,
    source_kind=None,
):
    """Reads a binary raw message window for the requested multimodal streams."""
    return _get_multimodal_service().read_stream_window_binary(
        dataset=dataset,
        sample=sample,
        media_field=media_field,
        stream_ids=stream_ids,
        start_time_ns=start_time_ns,
        end_time_ns=end_time_ns,
        max_messages_per_stream=max_messages_per_stream,
        source_kind=source_kind,
    )


def read_sample_multimodal_timeline_index(
    dataset,
    sample,
    media_field,
    stream_ids,
    timestamp_source=None,
    fallback=None,
    source_kind=None,
):
    """Reads a timestamp playback index for the requested streams."""
    return _get_multimodal_service().read_timeline_index(
        dataset=dataset,
        sample=sample,
        media_field=media_field,
        stream_ids=stream_ids,
        timestamp_source=timestamp_source,
        fallback=fallback,
        source_kind=source_kind,
    )


def read_sample_multimodal_bootstrap_window_binary(
    dataset,
    sample,
    media_field,
    anchor_time_ns,
    render_stream_ids,
    transform_stream_ids,
    location_stream_ids,
    transform_window_ns=None,
    source_kind=None,
):
    """Reads a binary first-paint bootstrap raw window."""
    return _get_multimodal_service().read_bootstrap_window_binary(
        dataset=dataset,
        sample=sample,
        media_field=media_field,
        anchor_time_ns=anchor_time_ns,
        render_stream_ids=render_stream_ids,
        transform_stream_ids=transform_stream_ids,
        location_stream_ids=location_stream_ids,
        transform_window_ns=transform_window_ns,
        source_kind=source_kind,
    )


def _get_multimodal_service():
    global _MULTIMODAL_SERVICE

    if _MULTIMODAL_SERVICE is None:
        adapter_registry = SourceAdapterRegistry()
        adapter_registry.register(
            "mcap",
            McapSourceAdapter(_SCHEMA_CODEC_REGISTRY),
            extensions=[".mcap"],
        )
        _MULTIMODAL_SERVICE = MultimodalWorkspaceService(
            adapter_registry=adapter_registry,
            planner=DefaultMultimodalRenderingPlanner(),
            repository=SampleMultimodalSceneRepository(),
        )

    return _MULTIMODAL_SERVICE


def _classify_stream(schema_name, codec_registry=None):
    resolved_codec_registry = codec_registry or _SCHEMA_CODEC_REGISTRY
    return resolved_codec_registry.classify_stream(schema_name)


def _catalog_reader(
    reader,
    scene_id,
    media_field,
    source_path,
    source_kind=None,
    codec_registry=None,
):
    resolved_codec_registry = codec_registry or _SCHEMA_CODEC_REGISTRY
    source_kind = source_kind or _DEFAULT_SOURCE_KIND
    summary = reader.get_summary()
    summary_schemas = getattr(summary, "schemas", {}) or {}
    streams = _build_stream_records_from_summary(
        summary, resolved_codec_registry
    )
    overall_range = _get_summary_scene_time_range(summary)
    transform_records = OrderedDict()
    extra_frame_ids = OrderedDict()

    for schema, channel, message in _iter_reader_messages(reader):
        if schema is None:
            schema = summary_schemas.get(channel.schema_id)

        stream = streams.get(channel.topic)
        if stream is None:
            stream = _build_stream_record(
                channel=channel,
                schema=schema,
                message_count=None,
                message_count_known=False,
                codec_registry=resolved_codec_registry,
            )
            streams[channel.topic] = stream

        log_time_ns = int(message.log_time)
        overall_range = _update_overall_range(overall_range, log_time_ns)
        _update_stream_range(stream, log_time_ns)
        if not stream["_message_count_known"]:
            _increment_stream_count(stream)

        try:
            details = _decode_catalog_details(
                schema_name=stream["schema_name"],
                schema=schema,
                payload=message.data,
                codec_registry=resolved_codec_registry,
            )
        except (McapCdrDecodeError, McapFoxgloveDecodeError):
            logger.debug(
                "Skipping multimodal catalog decode for %s (%s)",
                stream["topic"],
                stream["schema_name"],
                exc_info=True,
            )
            continue

        frame_id = details.get("frame_id")
        if frame_id and not stream["frame_id"]:
            stream["frame_id"] = frame_id
            extra_frame_ids[frame_id] = True

        for discovered_frame_id in details.get("frame_ids", []):
            if discovered_frame_id:
                extra_frame_ids[discovered_frame_id] = True

        child_frame_id = details.get("child_frame_id")
        if child_frame_id:
            extra_frame_ids[child_frame_id] = True

        for parent_frame_id, child_frame_id in details.get(
            "transform_edges", []
        ):
            if not parent_frame_id or not child_frame_id:
                continue

            key = (
                channel.topic,
                parent_frame_id,
                child_frame_id,
                channel.topic.endswith("/tf_static")
                or channel.topic == "/tf_static",
            )
            transform_records[key] = fom.MultimodalTransformEdge(
                topic=channel.topic,
                parent_frame_id=parent_frame_id,
                child_frame_id=child_frame_id,
                is_static=key[3],
            )
            extra_frame_ids[parent_frame_id] = True
            extra_frame_ids[child_frame_id] = True

    if overall_range is None:
        overall_range = (0, 0)

    finalized_streams = _finalize_streams(streams)
    frame_ids = OrderedDict()
    for stream in finalized_streams:
        if stream.frame_id:
            frame_ids[stream.frame_id] = True

    for frame_id in extra_frame_ids.keys():
        frame_ids[frame_id] = True

    frames = [
        fom.MultimodalFrameDescriptor(frame_id=frame_id)
        for frame_id in frame_ids.keys()
    ]
    location_topics = _finalize_location_topics(
        finalized_streams, resolved_codec_registry
    )

    return fom.MultimodalMetadata.build_for(
        scene_id=scene_id,
        media_field=media_field,
        media_path=source_path,
        source_kind=source_kind,
        time_range=_make_time_range_document(*overall_range),
        streams=finalized_streams,
        frames=frames,
        transforms=list(transform_records.values()),
        location_topics=location_topics,
        catalog_version=_CATALOG_VERSION,
    )


def _build_workspace_response(dataset, sample, metadata, rendering_plan):
    scene_start_ns = _get_scene_start_ns(metadata)
    return {
        "catalog": {
            "sceneId": metadata.scene_id,
            "datasetId": str(dataset._doc.id),
            "sampleId": str(sample.id),
            "mediaField": metadata.media_field,
            "mediaPath": metadata.source_path,
            "sourceKind": metadata.source_kind,
            "catalogVersion": metadata.catalog_version,
            "timeRange": _serialize_time_range(
                metadata.time_range, origin_ns=scene_start_ns
            ),
            "streams": [
                _serialize_stream(stream, scene_start_ns)
                for stream in metadata.streams
            ],
            "frames": [_serialize_frame(frame) for frame in metadata.frames],
            "transforms": [
                _serialize_transform(transform)
                for transform in metadata.transforms
            ],
            "locationTopics": [
                _serialize_location_topic(location_topic)
                for location_topic in metadata.location_topics
            ],
        },
        "renderingPlan": _serialize_rendering_plan(rendering_plan),
    }


def _build_stream_window_binary_response(
    scene_id,
    start_time_ns,
    end_time_ns,
    stream_lookup,
    stream_ids,
    raw_messages,
    scene_start_ns,
):
    payload_chunks = []
    payload_offset = 0
    manifest = {
        "sceneId": scene_id,
        "window": _serialize_window_range(
            start_time_ns, end_time_ns, scene_start_ns
        ),
        "streams": [],
    }

    for stream_id in stream_ids:
        manifest_messages = []

        for message in raw_messages.get(stream_id, []):
            payload_bytes = _get_raw_message_payload_bytes(message)
            payload_length = len(payload_bytes)
            manifest_messages.append(
                {
                    "messageId": message["message_id"],
                    "syncTimestampNs": _to_relative_ns(
                        message["sync_timestamp_ns"], scene_start_ns
                    ),
                    "logTimeNs": _to_relative_ns(
                        message["log_time_ns"], scene_start_ns
                    ),
                    "publishTimeNs": _to_relative_ns(
                        message["publish_time_ns"], scene_start_ns
                    ),
                    "payloadOffset": payload_offset,
                    "payloadLength": payload_length,
                }
            )
            payload_offset += payload_length
            if payload_length:
                payload_chunks.append(payload_bytes)

        manifest["streams"].append(
            {
                "streamId": stream_id,
                "schemaName": stream_lookup[stream_id].schema_name,
                "messageEncoding": stream_lookup[stream_id].message_encoding,
                "messages": manifest_messages,
            }
        )

    manifest_bytes = json.dumps(
        manifest, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")

    return b"".join(
        (
            _MULTIMODAL_RAW_BUFFER_BINARY_MAGIC,
            bytes([_MULTIMODAL_RAW_BUFFER_BINARY_VERSION]),
            struct.pack("<I", len(manifest_bytes)),
            manifest_bytes,
            b"".join(payload_chunks),
        )
    )


def _build_timeline_index_response(
    scene_id, timestamp_source, timestamps_ns, streams, scene_start_ns
):
    return {
        "sceneId": scene_id,
        "timestampSource": timestamp_source,
        "timestampsNs": [
            _to_relative_ns(timestamp_ns, scene_start_ns)
            for timestamp_ns in timestamps_ns
        ],
        "streams": [
            {
                **stream,
                "samples": [
                    {
                        "timestampNs": _to_relative_ns(
                            sample["timestamp_ns"], scene_start_ns
                        ),
                        "logTimeNs": _to_relative_ns(
                            sample["log_time_ns"], scene_start_ns
                        ),
                        "publishTimeNs": _to_relative_ns(
                            sample["publish_time_ns"], scene_start_ns
                        ),
                    }
                    for sample in stream["samples"]
                ],
            }
            for stream in streams
        ],
    }


def _make_timeline_index_cache_key(
    metadata, stream_ids, timestamp_source, fallback
):
    fingerprint = metadata.source_fingerprint
    if fingerprint is None:
        fingerprint_key = None
    else:
        fingerprint_key = (
            fingerprint.path,
            int(fingerprint.size_bytes),
            int(fingerprint.mtime_ns),
        )

    return (
        _CATALOG_VERSION,
        metadata.scene_id,
        metadata.media_field,
        metadata.source_kind,
        tuple(stream_ids or ()),
        timestamp_source,
        fallback,
        fingerprint_key,
    )


def _serialize_stream(stream, scene_start_ns):
    return {
        "streamId": stream.stream_id,
        "topic": stream.topic,
        "schemaName": stream.schema_name,
        "schemaEncoding": stream.schema_encoding,
        "messageEncoding": stream.message_encoding,
        "kind": stream.kind,
        "frameId": stream.frame_id,
        "affordances": list(stream.affordances or []),
        "compatiblePanels": list(stream.compatible_panels or []),
        "channelId": stream.channel_id,
        "schemaId": stream.schema_id,
        "timeRange": _serialize_time_range(
            stream.time_range, origin_ns=scene_start_ns
        ),
        "messageCount": stream.message_count,
    }


def _serialize_frame(frame):
    return {"frameId": frame.frame_id}


def _serialize_transform(transform):
    return {
        "topic": transform.topic,
        "parentFrameId": transform.parent_frame_id,
        "childFrameId": transform.child_frame_id,
        "isStatic": bool(transform.is_static),
    }


def _serialize_location_topic(location_topic):
    return {
        "streamId": location_topic.stream_id,
        "topic": location_topic.topic,
        "mode": location_topic.mode,
        "frameId": location_topic.frame_id,
    }


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
            getattr(rendering_plan, "sidebar_width", _DEFAULT_SIDEBAR_WIDTH)
            or _DEFAULT_SIDEBAR_WIDTH
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
        return _DEFAULT_SIDEBAR_WIDTH

    width = _normalize_time_value(value, "sidebarWidth")
    if width < _MIN_SIDEBAR_WIDTH or width > _MAX_SIDEBAR_WIDTH:
        raise MultimodalRouteError(
            400,
            "sidebarWidth must be between %d and %d"
            % (_MIN_SIDEBAR_WIDTH, _MAX_SIDEBAR_WIDTH),
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
    visible_stream_ids = _normalize_stream_ids(
        panel_data.get("visibleStreamIds", []),
        allow_empty=True,
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
    sync = fopr.SyncConfig(
        timestamp_source=_normalize_timestamp_source(
            sync_data.get(
                "timestampSource",
                (
                    current_sync.timestamp_source
                    if current_sync is not None
                    else "header.stamp"
                ),
            )
        ),
        fallback=_normalize_timestamp_fallback(
            sync_data.get(
                "fallback",
                (
                    current_sync.fallback
                    if current_sync is not None
                    else "log_time"
                ),
            )
        ),
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

    stream_lookup = _build_stream_lookup(metadata)
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
                        _DEFAULT_SIDEBAR_WIDTH,
                    )
                    if current_rendering_plan is not None
                    else _DEFAULT_SIDEBAR_WIDTH
                ),
            )
        ),
        layout_tree=_validate_layout_tree(
            rendering_plan.get("layoutTree"), panels
        ),
    )


def _build_stream_records_from_summary(summary, codec_registry):
    streams = OrderedDict()
    if summary is None:
        return streams

    channels = getattr(summary, "channels", {}) or {}
    schemas = getattr(summary, "schemas", {}) or {}
    statistics = getattr(summary, "statistics", None)
    count_lookup = (
        getattr(statistics, "channel_message_counts", {}) if statistics else {}
    )

    for channel in channels.values():
        schema = schemas.get(channel.schema_id)
        message_count = count_lookup.get(channel.id)
        streams[channel.topic] = _build_stream_record(
            channel=channel,
            schema=schema,
            message_count=message_count,
            message_count_known=message_count is not None,
            codec_registry=codec_registry,
        )

    return streams


def _build_stream_record(
    channel,
    schema,
    message_count,
    message_count_known,
    codec_registry,
):
    classification = codec_registry.classify_stream(
        getattr(schema, "name", None)
    )
    if message_count is not None:
        message_count = int(message_count)

    return {
        "stream_id": channel.topic,
        "topic": channel.topic,
        "schema_name": getattr(schema, "name", None) or "",
        "schema_encoding": getattr(schema, "encoding", None) or "",
        "message_encoding": channel.message_encoding,
        "kind": classification["kind"],
        "frame_id": None,
        "affordances": list(classification["affordances"]),
        "compatible_panels": list(classification["compatible_panels"]),
        "_location_mode": classification["location_mode"],
        "channel_id": int(channel.id),
        "schema_id": int(getattr(schema, "id", channel.schema_id)),
        "time_range": _make_time_range_document(None, None),
        "message_count": message_count,
        "_has_time_range": False,
        "_message_count_known": bool(message_count_known),
    }


def _finalize_streams(streams):
    finalized = []
    for stream in streams.values():
        finalized.append(
            fom.MultimodalStreamDescriptor(
                stream_id=stream["stream_id"],
                topic=stream["topic"],
                schema_name=stream["schema_name"],
                schema_encoding=stream["schema_encoding"],
                message_encoding=stream["message_encoding"],
                kind=stream["kind"],
                frame_id=stream["frame_id"],
                affordances=stream["affordances"],
                compatible_panels=stream["compatible_panels"],
                channel_id=stream["channel_id"],
                schema_id=stream["schema_id"],
                time_range=stream["time_range"],
                message_count=stream["message_count"],
            )
        )

    return finalized


def _finalize_location_topics(streams, codec_registry):
    location_topics = []
    for stream in streams:
        classification = codec_registry.classify_stream(stream.schema_name)
        mode = classification["location_mode"]
        if not mode:
            continue

        location_topics.append(
            fom.MultimodalLocationTopicDescriptor(
                stream_id=stream.stream_id,
                topic=stream.topic,
                mode=mode,
                frame_id=stream.frame_id,
            )
        )

    return location_topics


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
    for preferred_frame_id in _PREFERRED_GLOBAL_FRAME_IDS:
        if preferred_frame_id in normalized_candidates:
            return normalized_candidates[preferred_frame_id]

    for preferred_frame_id in _PREFERRED_EGO_FRAME_IDS:
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

    for preferred_frame_id in _PREFERRED_EGO_FRAME_IDS:
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


def _build_scene_id(dataset, sample, media_field):
    return "%s:%s:%s" % (dataset._doc.id, sample.id, media_field)


def _build_message_id(stream_id, message, message_index):
    return "%s:%s:%s:%s" % (
        stream_id,
        int(message.log_time),
        int(message.publish_time),
        message_index,
    )


def _build_raw_message_record(
    schema,
    stream_id,
    message,
    message_index,
    codec_registry,
    timestamp_source,
    fallback,
    sync_timestamp_ns=None,
):
    if sync_timestamp_ns is None:
        sync_timestamp_ns = _resolve_message_sync_timestamp_ns(
            codec_registry=codec_registry,
            schema_name=(schema.name if schema is not None else None),
            schema=schema,
            payload=message.data,
            log_time_ns=int(message.log_time),
            publish_time_ns=int(message.publish_time),
            timestamp_source=timestamp_source,
            fallback=fallback,
        )

    return {
        "message_id": _build_message_id(stream_id, message, message_index),
        "sync_timestamp_ns": int(sync_timestamp_ns),
        "log_time_ns": int(message.log_time),
        "publish_time_ns": int(message.publish_time),
        "payload_bytes": bytes(message.data),
    }


def _serialize_window_range(start_time_ns, end_time_ns, scene_start_ns):
    return {
        "startTimeNs": _to_relative_ns(start_time_ns, scene_start_ns),
        "endTimeNs": _to_relative_ns(end_time_ns, scene_start_ns),
    }


def _get_raw_message_payload_bytes(message):
    payload_bytes = message.get("payload_bytes")
    if payload_bytes is not None:
        if isinstance(payload_bytes, memoryview):
            return payload_bytes.tobytes()

        return bytes(payload_bytes)

    raise KeyError("Missing raw message payload bytes")


def _resolve_media_path(sample, media_field):
    if not isinstance(media_field, str) or not media_field:
        raise MultimodalRouteError(400, "Missing required mediaField")

    source_path = _resolve_sample_field(sample, media_field)
    if not isinstance(source_path, str) or not source_path:
        raise MultimodalRouteError(
            400, "Unknown media field '%s'" % media_field
        )

    if not os.path.exists(source_path):
        raise MultimodalRouteError(
            404, "Source file '%s' not found" % source_path
        )

    return source_path


def _resolve_sample_field(sample, field_path):
    current_value = sample
    for part in field_path.split("."):
        try:
            index = int(part)
        except ValueError:
            index = part

        try:
            current_value = current_value[index]
        except Exception:
            try:
                current_value = current_value.get_field(part)
            except Exception:
                return None

    return current_value


def _normalize_stream_ids(stream_ids, allow_none=False, allow_empty=False):
    if stream_ids is None:
        if allow_none:
            return None
        raise MultimodalRouteError(400, "streamIds must be a list")

    if not isinstance(stream_ids, list):
        raise MultimodalRouteError(400, "streamIds must be a list")

    if not stream_ids and not allow_empty:
        raise MultimodalRouteError(400, "streamIds must be a non-empty list")

    normalized = []
    for stream_id in stream_ids:
        if not isinstance(stream_id, str) or not stream_id:
            raise MultimodalRouteError(
                400, "streamIds must contain non-empty strings"
            )
        normalized.append(stream_id)

    return normalized


def _normalize_time_value(value, name):
    try:
        return int(value)
    except Exception as error:
        raise MultimodalRouteError(
            400, "%s must be an integer" % name
        ) from error


def _normalize_max_messages_per_stream(value):
    if value is None:
        return None

    value = _normalize_time_value(value, "maxMessagesPerStream")
    if value <= 0:
        raise MultimodalRouteError(
            400, "maxMessagesPerStream must be positive"
        )

    return value


def _normalize_timestamp_source(value):
    if value not in ("header.stamp", "publish_time", "log_time"):
        raise MultimodalRouteError(
            400,
            "timestampSource must be one of "
            "'header.stamp', 'publish_time', or 'log_time'",
        )

    return value


def _normalize_timestamp_fallback(value):
    if value not in ("publish_time", "log_time"):
        raise MultimodalRouteError(
            400,
            "fallback must be one of 'publish_time' or 'log_time'",
        )

    return value


def _decode_catalog_details(
    schema_name, payload, codec_registry=None, schema=None
):
    schema_name = schema_name or _get_schema_name(schema)
    if codec_registry is None:
        return decode_catalog_details(schema_name, payload)

    return codec_registry.decode_catalog_details(
        schema or schema_name, payload
    )


def _resolve_message_sync_timestamp_ns(
    schema_name,
    payload,
    log_time_ns,
    publish_time_ns,
    timestamp_source,
    fallback,
    codec_registry=None,
    schema=None,
):
    schema_name = schema_name or _get_schema_name(schema)
    timestamp_source = _normalize_timestamp_source(timestamp_source)
    fallback = _normalize_timestamp_fallback(fallback)

    if timestamp_source == "log_time":
        return int(log_time_ns)

    if timestamp_source == "publish_time":
        if publish_time_ns:
            return int(publish_time_ns)

        return int(log_time_ns)

    try:
        if codec_registry is None:
            decoded_timestamp_ns = decode_sync_timestamp_ns(
                schema_name, payload
            )
        else:
            decoded_timestamp_ns = codec_registry.decode_sync_timestamp_ns(
                schema or schema_name, payload
            )
    except (McapCdrDecodeError, McapFoxgloveDecodeError):
        logger.debug(
            "Falling back to %s timestamp for %s",
            fallback,
            schema_name,
            exc_info=True,
        )
        decoded_timestamp_ns = None

    if decoded_timestamp_ns:
        return int(decoded_timestamp_ns)

    if fallback == "publish_time" and publish_time_ns:
        return int(publish_time_ns)

    return int(log_time_ns)


def _make_time_range_document(start_ns, end_ns):
    if start_ns is None:
        start_ns = 0

    if end_ns is None:
        end_ns = start_ns

    return fom.MultimodalTimeRange(
        start_ns=int(start_ns),
        end_ns=int(end_ns),
    )


def _get_scene_start_ns(metadata):
    return int(metadata.time_range.start_ns)


def _to_relative_ns(timestamp_ns, origin_ns):
    return int(timestamp_ns) - int(origin_ns)


def _to_absolute_ns(timestamp_ns, origin_ns):
    return int(timestamp_ns) + int(origin_ns)


def _serialize_time_range(time_range, origin_ns=0):
    return {
        "startNs": _to_relative_ns(time_range.start_ns, origin_ns),
        "endNs": _to_relative_ns(time_range.end_ns, origin_ns),
    }


def _update_bounds(start_ns, end_ns, value):
    if start_ns is None or value < start_ns:
        start_ns = value

    if end_ns is None or value > end_ns:
        end_ns = value

    return start_ns, end_ns


def _update_overall_range(overall_range, log_time_ns):
    if overall_range is None:
        return (log_time_ns, log_time_ns)

    return _update_bounds(overall_range[0], overall_range[1], log_time_ns)


def _update_stream_range(stream, log_time_ns):
    start_ns = None
    end_ns = None
    if stream["_has_time_range"]:
        start_ns = stream["time_range"].start_ns
        end_ns = stream["time_range"].end_ns

    start_ns, end_ns = _update_bounds(start_ns, end_ns, log_time_ns)
    stream["time_range"] = _make_time_range_document(start_ns, end_ns)
    stream["_has_time_range"] = True


def _increment_stream_count(stream):
    if stream["message_count"] is None:
        stream["message_count"] = 0

    stream["message_count"] += 1


def _get_summary_scene_time_range(summary):
    if summary is None:
        return None

    statistics = getattr(summary, "statistics", None)
    if statistics is not None:
        return statistics.message_start_time, statistics.message_end_time

    chunk_indexes = getattr(summary, "chunk_indexes", None) or []
    if isinstance(chunk_indexes, dict):
        chunk_indexes = chunk_indexes.values()

    start_ns = None
    end_ns = None
    for chunk_index in chunk_indexes:
        start_ns, end_ns = _update_bounds(
            start_ns, end_ns, int(chunk_index.message_start_time)
        )
        start_ns, end_ns = _update_bounds(
            start_ns, end_ns, int(chunk_index.message_end_time)
        )

    if start_ns is None or end_ns is None:
        return None

    return start_ns, end_ns


def _iter_reader_messages(reader, topics=None, start_ns=None, end_ns=None):
    end_time = None if end_ns is None else int(end_ns) + 1
    return reader.iter_messages(
        topics=topics,
        start_time=start_ns,
        end_time=end_time,
        log_time_order=False,
    )


def _build_stream_lookup(metadata):
    return {stream.stream_id: stream for stream in metadata.streams}


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


def _requires_ingest(
    metadata, rendering_plan, media_field, source_fingerprint, source_kind
):
    if metadata is None or rendering_plan is None:
        return True

    if metadata.catalog_version != _CATALOG_VERSION:
        return True

    if metadata.source_kind != source_kind:
        return True

    if metadata.media_field != media_field:
        return True

    if rendering_plan.media_field != media_field:
        return True

    if rendering_plan.source_kind != source_kind:
        return True

    try:
        _validate_layout_tree(
            rendering_plan.layout_tree,
            rendering_plan.panels or [],
        )
    except MultimodalRouteError:
        return True

    fingerprint = metadata.source_fingerprint
    if fingerprint is None:
        return True

    return any(
        (
            fingerprint.path != source_fingerprint.path,
            int(fingerprint.size_bytes) != int(source_fingerprint.size_bytes),
            int(fingerprint.mtime_ns) != int(source_fingerprint.mtime_ns),
        )
    )


def _get_mcap_reader_module():
    try:
        return importlib.import_module("mcap.reader")
    except Exception as exc:
        raise MultimodalDependencyError(
            "The 'mcap>=1,<2' package is required for built-in mcap support"
        ) from exc
