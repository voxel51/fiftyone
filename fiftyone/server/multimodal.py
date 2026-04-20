"""
FiftyOne Server multimodal ingest and workspace helpers.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from abc import ABC, abstractmethod
import base64
from collections import OrderedDict, deque
import importlib
import logging
import os
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


logger = logging.getLogger(__name__)

_CATALOG_VERSION = "multimodal-workspace-v1"
_DEFAULT_SOURCE_KIND = "mcap"
_DEFAULT_STREAM = {
    "kind": "other",
    "affordances": [],
    "compatible_panels": [],
    "location_mode": None,
}

_MULTIMODAL_SERVICE = None
_DEFAULT_BOOTSTRAP_TRANSFORM_WINDOW_NS = 1_000_000_000
_DEFAULT_BOOTSTRAP_RENDER_MESSAGE_COUNT = 2
_TIMELINE_INDEX_CACHE_MAX_ENTRIES = 4
_TIMELINE_INDEX_CACHE_TTL_SECONDS = 300


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
    def decode_catalog_details(self, payload):
        """Decodes stream inventory details from one raw payload."""

    @abstractmethod
    def decode_sync_timestamp_ns(self, payload):
        """Decodes the preferred sync timestamp from one raw payload."""


class RosSchemaCodec(SchemaCodec):
    """ROS2 CDR-backed codec for one multimodal message schema."""

    def decode_catalog_details(self, payload):
        return decode_catalog_details(self.schema_name, payload)

    def decode_sync_timestamp_ns(self, payload):
        return decode_sync_timestamp_ns(self.schema_name, payload)


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

    def classify_stream(self, schema_name):
        codec = self.get(schema_name)
        if codec is None:
            return dict(_DEFAULT_STREAM)

        return codec.describe_stream()

    def decode_catalog_details(self, schema_name, payload):
        codec = self.get(schema_name)
        if codec is None:
            return {}

        return codec.decode_catalog_details(payload)

    def decode_sync_timestamp_ns(self, schema_name, payload):
        codec = self.get(schema_name)
        if codec is None:
            return None

        return codec.decode_sync_timestamp_ns(payload)


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


def _build_builtin_ros_codec_registry():
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
    ):
        registry.register(codec)

    return registry


_SCHEMA_CODEC_REGISTRY = _build_builtin_ros_codec_registry()


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
        image_streams = [
            stream
            for stream in metadata.streams
            if "image" in (stream.compatible_panels or [])
        ]
        three_d_streams = [
            stream
            for stream in metadata.streams
            if "3d" in (stream.compatible_panels or [])
        ]

        if three_d_streams:
            fixed_frame_id = _choose_default_fixed_frame(
                metadata, three_d_streams
            )
            panels.append(
                fopr.PanelPlan(
                    panel_id="panel_3d_1",
                    archetype="3d",
                    title="3D panel",
                    render_stream_id=None,
                    visible_stream_ids=[
                        stream.stream_id for stream in three_d_streams
                    ],
                    frame_config=fopr.PanelFrameConfig(
                        fixed_frame_id=fixed_frame_id,
                        display_frame_id=fixed_frame_id,
                        follow_mode="off",
                    ),
                    scene_config=fopr.PanelSceneConfig(
                        up_axis="z",
                        background_color="#10151d",
                    ),
                    layout=fopr.PanelLayout(x=0, y=0, w=12, h=2),
                )
            )

        for index, image_stream in enumerate(image_streams[:3], 1):
            panels.append(
                fopr.PanelPlan(
                    panel_id="image_panel_%d" % index,
                    archetype="image",
                    title="Image panel %d" % index,
                    render_stream_id=image_stream.stream_id,
                    visible_stream_ids=[],
                    frame_config=fopr.PanelFrameConfig(),
                    scene_config=fopr.PanelSceneConfig(),
                    layout=fopr.PanelLayout(
                        x=(index - 1) * 4,
                        y=2 if three_d_streams else 0,
                        w=4,
                        h=1,
                    ),
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
        )


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

    def read_stream_window(
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
        return _build_stream_window_response(
            scene_id=state.metadata.scene_id,
            start_time_ns=absolute_start_time_ns,
            end_time_ns=absolute_end_time_ns,
            stream_lookup=stream_lookup,
            stream_ids=stream_ids,
            raw_messages=raw_messages,
            scene_start_ns=scene_start_ns,
        )

    def read_bootstrap_window(
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
        return _build_stream_window_response(
            scene_id=state.metadata.scene_id,
            start_time_ns=absolute_start_time_ns,
            end_time_ns=absolute_end_time_ns,
            stream_lookup=stream_lookup,
            stream_ids=requested_stream_ids,
            raw_messages=raw_messages,
            scene_start_ns=scene_start_ns,
        )

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


def read_sample_multimodal_stream_window(
    dataset,
    sample,
    media_field,
    stream_ids,
    start_time_ns,
    end_time_ns,
    max_messages_per_stream=None,
    source_kind=None,
):
    """Reads a raw message window for the requested multimodal streams."""
    return _get_multimodal_service().read_stream_window(
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


def read_sample_multimodal_bootstrap_window(
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
    """Reads a first-paint bootstrap raw window for the requested streams."""
    return _get_multimodal_service().read_bootstrap_window(
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
    streams = _build_stream_records_from_summary(
        summary, resolved_codec_registry
    )
    overall_range = _get_summary_scene_time_range(summary)
    transform_records = OrderedDict()
    extra_frame_ids = OrderedDict()

    for schema, channel, message in _iter_reader_messages(reader):
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
                payload=message.data,
                codec_registry=codec_registry,
            )
        except McapCdrDecodeError:
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


def _build_stream_window_response(
    scene_id,
    start_time_ns,
    end_time_ns,
    stream_lookup,
    stream_ids,
    raw_messages,
    scene_start_ns,
):
    return {
        "sceneId": scene_id,
        "window": {
            "startTimeNs": _to_relative_ns(start_time_ns, scene_start_ns),
            "endTimeNs": _to_relative_ns(end_time_ns, scene_start_ns),
        },
        "streams": [
            {
                "streamId": stream_id,
                "schemaName": stream_lookup[stream_id].schema_name,
                "messageEncoding": stream_lookup[stream_id].message_encoding,
                "messages": [
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
                        "payloadB64": message["payload_b64"],
                    }
                    for message in raw_messages.get(stream_id, [])
                ],
            }
            for stream_id in stream_ids
        ],
    }


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
                },
                "layout": {
                    "x": int(panel.layout.x),
                    "y": int(panel.layout.y),
                    "w": int(panel.layout.w),
                    "h": int(panel.layout.h),
                },
            }
            for panel in rendering_plan.panels
        ],
    }


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

    for candidate_frame_id in candidate_frame_ids:
        if all(
            _frames_are_connected(
                metadata.transforms,
                stream_frame_id,
                candidate_frame_id,
            )
            for stream_frame_id in frame_ids
        ):
            return candidate_frame_id

    return frame_ids[0]


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
        "payload_b64": base64.b64encode(message.data).decode("ascii"),
    }


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


def _decode_catalog_details(schema_name, payload, codec_registry=None):
    if codec_registry is None:
        return decode_catalog_details(schema_name, payload)

    return codec_registry.decode_catalog_details(schema_name, payload)


def _resolve_message_sync_timestamp_ns(
    schema_name,
    payload,
    log_time_ns,
    publish_time_ns,
    timestamp_source,
    fallback,
    codec_registry=None,
):
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
                schema_name, payload
            )
    except McapCdrDecodeError:
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

    if any(panel.layout is None for panel in rendering_plan.panels or []):
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
