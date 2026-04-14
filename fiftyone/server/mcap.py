"""
FiftyOne Server MCAP ingest, persistence, and adapter helpers.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from abc import ABC, abstractmethod
import base64
from collections import OrderedDict
import importlib
import logging
import os
import time

import fiftyone.core.fields as fof
import fiftyone.core.metadata as fom
import fiftyone.core.rendering as fopr


logger = logging.getLogger(__name__)

_CATALOG_VERSION = "mcap-poc-v1"
_SUPPORTED_SCHEMA_ROLES = {
    "sensor_msgs/msg/CompressedImage": "image_stream",
    "sensor_msgs/msg/PointCloud2": "pointcloud_stream",
}

_ROLE_PANEL_CONFIG = {
    "image_stream": {"panel_type": "2d", "content_type": "image"},
    "pointcloud_stream": {
        "panel_type": "3d",
        "content_type": "pointcloud",
    },
}

_MCAP_SERVICE = None


class McapError(Exception):
    """Base class for MCAP adapter exceptions."""


class McapDependencyError(McapError):
    """Raised when the runtime MCAP dependency is unavailable."""


class McapRouteError(McapError):
    """Raised when the request cannot be fulfilled as specified."""

    def __init__(self, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class PersistedMcapSceneState(object):
    """Persisted MCAP scene state loaded from a sample."""

    def __init__(self, metadata=None, rendering_plan=None):
        self.metadata = metadata
        self.rendering_plan = rendering_plan


class MultimodalSourceAdapter(ABC):
    """Abstract adapter for reading multimodal scene data."""

    @abstractmethod
    def get_scene_catalog(self, scene_id, media_field, media_path):
        """Builds a persisted scene catalog for the given MCAP file."""

    @abstractmethod
    def read_stream_window(self, media_path, stream_ids, start_ns, end_ns):
        """Reads raw message payloads for the requested MCAP streams."""

    @abstractmethod
    def read_timeline_index(self, media_path, stream_ids):
        """Reads timestamp indexes for the requested MCAP streams."""


class McapSourceAdapter(MultimodalSourceAdapter):
    """MCAP source adapter backed by ``mcap.reader``."""

    def get_scene_catalog(self, scene_id, media_field, media_path):
        with open(media_path, "rb") as stream:
            reader = _get_mcap_reader_module().make_reader(stream)
            return _catalog_reader(
                reader=reader,
                scene_id=scene_id,
                media_field=media_field,
                media_path=media_path,
            )

    def read_stream_window(self, media_path, stream_ids, start_ns, end_ns):
        response_streams = OrderedDict(
            (stream_id, []) for stream_id in stream_ids
        )
        message_indexes = {stream_id: 0 for stream_id in stream_ids}

        with open(media_path, "rb") as stream:
            reader = _get_mcap_reader_module().make_reader(stream)
            for _schema, channel, message in _iter_reader_messages(
                reader,
                topics=stream_ids,
                start_ns=start_ns,
                end_ns=end_ns,
            ):
                stream_id = channel.topic
                message_index = message_indexes[stream_id]
                message_indexes[stream_id] += 1
                response_streams[stream_id].append(
                    {
                        "message_id": _build_message_id(
                            stream_id, message, message_index
                        ),
                        "log_time_ns": int(message.log_time),
                        "publish_time_ns": int(message.publish_time),
                        "payload_b64": base64.b64encode(message.data).decode(
                            "ascii"
                        ),
                    }
                )

        return response_streams

    def read_timeline_index(self, media_path, stream_ids):
        timeline_streams = OrderedDict(
            (stream_id, []) for stream_id in stream_ids
        )
        shared_timestamps = set()

        with open(media_path, "rb") as stream:
            reader = _get_mcap_reader_module().make_reader(stream)
            for _schema, channel, message in _iter_reader_messages(
                reader, topics=stream_ids
            ):
                log_time = int(message.log_time)
                timeline_streams[channel.topic].append(log_time)
                shared_timestamps.add(log_time)

        return {
            "timestamps_ns": sorted(shared_timestamps),
            "streams": OrderedDict(
                (
                    stream_id,
                    sorted(stream_timestamps),
                )
                for stream_id, stream_timestamps in timeline_streams.items()
            ),
        }


class RenderingPlanner(ABC):
    """Abstract builder for persisted rendering plans."""

    @abstractmethod
    def build_rendering_plan(self, metadata):
        """Builds a rendering plan for the given scene catalog."""


class HeuristicMcapRenderingPlanner(RenderingPlanner):
    """Heuristic rendering planner for the experimental MCAP slice."""

    def build_rendering_plan(self, metadata):
        panels = []
        for stream in metadata.streams:
            panel_config = _ROLE_PANEL_CONFIG.get(stream.role)
            if panel_config is None:
                continue

            panels.append(
                fopr.McapPanelPlan(
                    panel_id=_build_panel_id(stream.stream_id),
                    panel_type=panel_config["panel_type"],
                    content_type=panel_config["content_type"],
                    stream_id=stream.stream_id,
                )
            )

        return fopr.McapRenderingPlan(
            media_field=metadata.media_field,
            scene_id=metadata.scene_id,
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


class SceneStateRepository(ABC):
    """Abstract repository for persisted MCAP scene state."""

    @abstractmethod
    def ensure_schema(self, dataset):
        """Ensures the dataset can persist MCAP rendering plans."""

    @abstractmethod
    def load(self, sample):
        """Loads persisted MCAP scene state from the sample."""

    @abstractmethod
    def save(self, dataset, sample, metadata, rendering_plan):
        """Persists MCAP scene state on the sample."""


class SampleMcapSceneRepository(SceneStateRepository):
    """Sample-backed repository for MCAP scene state."""

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
        if not isinstance(metadata, fom.McapMetadata):
            metadata = None

        rendering_plan = None
        if sample.has_field("rendering_plan"):
            rendering_plan = sample["rendering_plan"]

        if not isinstance(rendering_plan, fopr.McapRenderingPlan):
            rendering_plan = None

        return PersistedMcapSceneState(
            metadata=metadata,
            rendering_plan=rendering_plan,
        )

    def save(self, dataset, sample, metadata, rendering_plan):
        self.ensure_schema(dataset)
        sample.metadata = metadata
        sample["rendering_plan"] = rendering_plan
        sample.save()
        return PersistedMcapSceneState(
            metadata=sample.metadata,
            rendering_plan=sample["rendering_plan"],
        )


class McapSceneService(object):
    """Service that owns MCAP ingest and sample-backed reads."""

    def __init__(self, adapter, planner, repository):
        self._adapter = adapter
        self._planner = planner
        self._repository = repository

    def ingest_scene(self, dataset, sample, media_field, overwrite=False):
        media_path = _resolve_media_path(sample, media_field)
        scene_id = _build_scene_id(dataset, sample, media_field)
        state = self._repository.load(sample)

        if not overwrite and not _requires_ingest(
            state.metadata,
            state.rendering_plan,
            media_field,
            media_path,
        ):
            return state

        started_at = time.perf_counter()
        metadata = self._adapter.get_scene_catalog(
            scene_id=scene_id,
            media_field=media_field,
            media_path=media_path,
        )
        rendering_plan = self._planner.build_rendering_plan(metadata)
        persisted_state = self._repository.save(
            dataset=dataset,
            sample=sample,
            metadata=metadata,
            rendering_plan=rendering_plan,
        )
        logger.debug(
            "Ingested MCAP scene %s in %.3f ms (%d supported streams)",
            media_path,
            (time.perf_counter() - started_at) * 1000,
            len(metadata.streams),
        )
        return persisted_state

    def inspect_scene(self, dataset, sample, media_field):
        state = self.ingest_scene(
            dataset=dataset,
            sample=sample,
            media_field=media_field,
            overwrite=False,
        )
        return _build_scene_response(
            dataset=dataset,
            sample=sample,
            metadata=state.metadata,
            rendering_plan=state.rendering_plan,
        )

    def read_window(
        self, dataset, sample, media_field, stream_ids, window, mode="raw"
    ):
        if mode is None:
            mode = "raw"

        if mode == "decoded":
            raise McapRouteError(
                501, "Decoded MCAP buffers are not implemented yet"
            )

        if mode != "raw":
            raise McapRouteError(400, f"Unsupported MCAP buffer mode '{mode}'")

        stream_ids = _normalize_stream_ids(stream_ids)
        start_ns, end_ns = _normalize_window(window)
        state = self.ingest_scene(
            dataset=dataset,
            sample=sample,
            media_field=media_field,
            overwrite=False,
        )
        stream_lookup = _build_stream_lookup(state.metadata)
        _validate_known_stream_ids(stream_ids, stream_lookup)

        started_at = time.perf_counter()
        raw_messages = self._adapter.read_stream_window(
            media_path=state.metadata.source_path,
            stream_ids=stream_ids,
            start_ns=start_ns,
            end_ns=end_ns,
        )
        logger.debug(
            "Read MCAP raw window %s [%s, %s] in %.3f ms (%d streams)",
            state.metadata.source_path,
            start_ns,
            end_ns,
            (time.perf_counter() - started_at) * 1000,
            len(raw_messages),
        )

        return {
            "mode": "raw",
            "sceneId": state.metadata.scene_id,
            "window": _serialize_time_range(
                _make_time_range_document(start_ns, end_ns)
            ),
            "streams": [
                {
                    "streamId": stream_id,
                    "schemaName": stream_lookup[stream_id].schema_name,
                    "messageEncoding": stream_lookup[
                        stream_id
                    ].message_encoding,
                    "messages": [
                        {
                            "messageId": message["message_id"],
                            "logTimeNs": message["log_time_ns"],
                            "publishTimeNs": message["publish_time_ns"],
                            "payloadB64": message["payload_b64"],
                        }
                        for message in raw_messages[stream_id]
                    ],
                }
                for stream_id in stream_ids
            ],
        }

    def read_timeline_index(self, dataset, sample, media_field, stream_ids):
        stream_ids = _normalize_stream_ids(stream_ids, allow_empty=True)
        state = self.ingest_scene(
            dataset=dataset,
            sample=sample,
            media_field=media_field,
            overwrite=False,
        )

        if not stream_ids:
            return _build_timeline_response(state.metadata.scene_id, [], [])

        stream_lookup = _build_stream_lookup(state.metadata)
        _validate_known_stream_ids(stream_ids, stream_lookup)

        started_at = time.perf_counter()
        timeline_index = self._adapter.read_timeline_index(
            media_path=state.metadata.source_path,
            stream_ids=stream_ids,
        )
        logger.debug(
            "Read MCAP timeline %s in %.3f ms (%d streams, %d timestamps)",
            state.metadata.source_path,
            (time.perf_counter() - started_at) * 1000,
            len(stream_ids),
            len(timeline_index["timestamps_ns"]),
        )

        return _build_timeline_response(
            scene_id=state.metadata.scene_id,
            timestamps_ns=timeline_index["timestamps_ns"],
            streams=[
                {
                    "streamId": stream_id,
                    "timestampsNs": timeline_index["streams"][stream_id],
                }
                for stream_id in stream_ids
            ],
        )


def ingest_sample_mcap_scene(dataset, sample, media_field, overwrite=False):
    """Persists the scene catalog and rendering plan for an MCAP sample."""
    service = _get_mcap_service()
    state = service.ingest_scene(
        dataset=dataset,
        sample=sample,
        media_field=media_field,
        overwrite=overwrite,
    )
    return _build_scene_response(
        dataset=dataset,
        sample=sample,
        metadata=state.metadata,
        rendering_plan=state.rendering_plan,
    )


def inspect_sample_mcap_scene(dataset, sample, media_field):
    """Builds scene inventory and playback-plan data for an MCAP sample."""
    return _get_mcap_service().inspect_scene(
        dataset=dataset,
        sample=sample,
        media_field=media_field,
    )


def read_sample_mcap_window(
    dataset, sample, media_field, stream_ids, window, mode="raw"
):
    """Reads a raw message window for the requested MCAP streams."""
    return _get_mcap_service().read_window(
        dataset=dataset,
        sample=sample,
        media_field=media_field,
        stream_ids=stream_ids,
        window=window,
        mode=mode,
    )


def read_sample_mcap_timeline_index(dataset, sample, media_field, stream_ids):
    """Reads a timestamp-only playback index for the requested streams."""
    return _get_mcap_service().read_timeline_index(
        dataset=dataset,
        sample=sample,
        media_field=media_field,
        stream_ids=stream_ids,
    )


def _get_mcap_service():
    global _MCAP_SERVICE

    if _MCAP_SERVICE is None:
        _MCAP_SERVICE = McapSceneService(
            adapter=McapSourceAdapter(),
            planner=HeuristicMcapRenderingPlanner(),
            repository=SampleMcapSceneRepository(),
        )

    return _MCAP_SERVICE


def _catalog_reader(reader, scene_id, media_field, media_path):
    summary = reader.get_summary()
    overall_range = _get_summary_scene_time_range(summary)

    if summary is None:
        return _catalog_reader_without_summary(
            reader=reader,
            scene_id=scene_id,
            media_field=media_field,
            media_path=media_path,
        )

    supported_streams = _build_supported_streams_from_summary(summary)

    if supported_streams:
        _populate_stream_ranges_from_messages(reader, supported_streams)

    if overall_range is None:
        overall_range = _scan_overall_time_range(reader)

    return fom.McapMetadata.build_for(
        scene_id=scene_id,
        media_field=media_field,
        media_path=media_path,
        time_range=_make_time_range_document(*overall_range),
        streams=_finalize_streams(supported_streams),
        catalog_version=_CATALOG_VERSION,
    )


def _catalog_reader_without_summary(reader, scene_id, media_field, media_path):
    supported_streams = OrderedDict()
    overall_start = None
    overall_end = None

    for schema, channel, message in _iter_reader_messages(reader):
        log_time = int(message.log_time)
        overall_start, overall_end = _update_bounds(
            overall_start, overall_end, log_time
        )

        role = _resolve_stream_role(getattr(schema, "name", None))
        if not role:
            continue

        stream = supported_streams.get(channel.topic)
        if stream is None:
            stream = _build_stream_descriptor(
                channel=channel,
                schema=schema,
                role=role,
                message_count=0,
                message_count_known=True,
            )
            supported_streams[channel.topic] = stream

        _increment_stream_count(stream)
        _update_stream_range(stream, log_time)

    return fom.McapMetadata.build_for(
        scene_id=scene_id,
        media_field=media_field,
        media_path=media_path,
        time_range=_make_time_range_document(overall_start, overall_end),
        streams=_finalize_streams(supported_streams),
        catalog_version=_CATALOG_VERSION,
    )


def _build_scene_response(dataset, sample, metadata, rendering_plan):
    return {
        "scene": {
            "sceneId": metadata.scene_id,
            "datasetId": str(dataset._doc.id),
            "sampleId": str(sample.id),
            "mediaField": metadata.media_field,
            "mediaPath": metadata.source_path,
            "timeRange": _serialize_time_range(metadata.time_range),
            "streams": [
                _serialize_stream(stream) for stream in metadata.streams
            ],
        },
        "playbackPlan": _serialize_rendering_plan(rendering_plan),
    }


def _serialize_stream(stream):
    return {
        "streamId": stream.stream_id,
        "topic": stream.topic,
        "schemaName": stream.schema_name,
        "schemaEncoding": stream.schema_encoding,
        "messageEncoding": stream.message_encoding,
        "role": stream.role,
        "channelId": stream.channel_id,
        "schemaId": stream.schema_id,
        "timeRange": _serialize_time_range(stream.time_range),
        "messageCount": stream.message_count,
    }


def _serialize_rendering_plan(rendering_plan):
    return {
        "sceneId": rendering_plan.scene_id,
        "sync": {
            "timestampSource": rendering_plan.sync.timestamp_source,
            "fallback": rendering_plan.sync.fallback,
            "mode": rendering_plan.sync.mode,
        },
        "panels": [
            {
                "panelId": panel.panel_id,
                "panelType": panel.panel_type,
                "contentType": panel.content_type,
                "streamId": panel.stream_id,
            }
            for panel in rendering_plan.panels
        ],
        "sidebars": {
            "left": rendering_plan.sidebars.left,
            "right": rendering_plan.sidebars.right,
        },
    }


def _build_timeline_response(scene_id, timestamps_ns, streams):
    return {
        "sceneId": scene_id,
        "timeline": {
            "timestampSource": "log_time",
            "timestampsNs": timestamps_ns,
            "streams": streams,
        },
    }


def _build_supported_streams_from_summary(summary):
    supported_streams = OrderedDict()
    channels = getattr(summary, "channels", {}) or {}
    schemas = getattr(summary, "schemas", {}) or {}
    statistics = getattr(summary, "statistics", None)
    count_lookup = (
        getattr(statistics, "channel_message_counts", {}) if statistics else {}
    )

    for channel in channels.values():
        schema = schemas.get(channel.schema_id)
        role = _resolve_stream_role(getattr(schema, "name", None))
        if not role:
            continue

        message_count = count_lookup.get(channel.id)
        if channel.topic in supported_streams:
            if message_count is not None:
                _merge_stream_message_count(
                    supported_streams[channel.topic], message_count
                )
            continue

        supported_streams[channel.topic] = _build_stream_descriptor(
            channel=channel,
            schema=schema,
            role=role,
            message_count=message_count,
            message_count_known=message_count is not None,
        )

    return supported_streams


def _populate_stream_ranges_from_messages(reader, supported_streams):
    if not supported_streams:
        return

    topics = list(supported_streams.keys())
    for _schema, channel, message in _iter_reader_messages(
        reader, topics=topics
    ):
        stream = supported_streams[channel.topic]
        _update_stream_range(stream, int(message.log_time))
        if not stream["_message_count_known"]:
            _increment_stream_count(stream)


def _scan_overall_time_range(reader):
    start_ns = None
    end_ns = None

    for _schema, _channel, message in _iter_reader_messages(reader):
        start_ns, end_ns = _update_bounds(
            start_ns, end_ns, int(message.log_time)
        )

    return start_ns, end_ns


def _iter_reader_messages(reader, topics=None, start_ns=None, end_ns=None):
    end_time = None if end_ns is None else int(end_ns) + 1
    return reader.iter_messages(
        topics=topics,
        start_time=start_ns,
        end_time=end_time,
        log_time_order=False,
    )


def _build_stream_descriptor(
    channel, schema, role, message_count, message_count_known
):
    if message_count is not None:
        message_count = int(message_count)

    return {
        "stream_id": channel.topic,
        "topic": channel.topic,
        "schema_name": schema.name,
        "schema_encoding": schema.encoding,
        "message_encoding": channel.message_encoding,
        "role": role,
        "channel_id": int(channel.id),
        "schema_id": int(schema.id),
        "time_range": _make_time_range_document(None, None),
        "message_count": message_count,
        "_has_time_range": False,
        "_message_count_known": bool(message_count_known),
    }


def _finalize_streams(streams):
    finalized = []
    for stream in streams.values():
        finalized.append(
            fom.McapStreamMetadata(
                stream_id=stream["stream_id"],
                topic=stream["topic"],
                schema_name=stream["schema_name"],
                schema_encoding=stream["schema_encoding"],
                message_encoding=stream["message_encoding"],
                role=stream["role"],
                channel_id=stream["channel_id"],
                schema_id=stream["schema_id"],
                time_range=stream["time_range"],
                message_count=stream["message_count"],
            )
        )

    return finalized


def _build_scene_id(dataset, sample, media_field):
    return "%s:%s:%s" % (dataset._doc.id, sample.id, media_field)


def _build_panel_id(stream_id):
    panel_id = stream_id.lstrip("/").replace("/", "_")
    return panel_id or "stream"


def _build_message_id(stream_id, message, message_index):
    return "%s:%s:%s:%s" % (
        stream_id,
        int(message.log_time),
        int(message.publish_time),
        message_index,
    )


def _resolve_stream_role(schema_name):
    return _SUPPORTED_SCHEMA_ROLES.get(schema_name)


def _resolve_media_path(sample, media_field):
    if not isinstance(media_field, str) or not media_field:
        raise McapRouteError(400, "Missing required media_field")

    media_path = _resolve_sample_field(sample, media_field)
    if not isinstance(media_path, str) or not media_path:
        raise McapRouteError(400, "Unknown media field '%s'" % media_field)

    if not media_path.lower().endswith(".mcap"):
        raise McapRouteError(
            400, "Resolved media field '%s' is not an MCAP file" % media_field
        )

    if not os.path.exists(media_path):  # pylint: disable=no-member
        raise McapRouteError(404, "MCAP file '%s' not found" % media_path)

    return media_path


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


def _normalize_stream_ids(stream_ids, allow_empty=False):
    if not isinstance(stream_ids, list):
        raise McapRouteError(400, "streamIds must be a non-empty list")

    if not stream_ids:
        if allow_empty:
            return []

        raise McapRouteError(400, "streamIds must be a non-empty list")

    normalized_ids = []
    for stream_id in stream_ids:
        if not isinstance(stream_id, str) or not stream_id:
            raise McapRouteError(
                400, "streamIds must contain non-empty strings"
            )
        normalized_ids.append(stream_id)

    return normalized_ids


def _normalize_window(window):
    if not isinstance(window, dict):
        raise McapRouteError(400, "window must be an object")

    if "startNs" not in window or "endNs" not in window:
        raise McapRouteError(400, "window must include startNs and endNs")

    try:
        start_ns = int(window["startNs"])
        end_ns = int(window["endNs"])
    except Exception as exc:
        raise McapRouteError(
            400, "window startNs and endNs must be integers"
        ) from exc

    if start_ns > end_ns:
        raise McapRouteError(400, "window startNs must be <= endNs")

    return start_ns, end_ns


def _make_time_range_document(start_ns, end_ns):
    if start_ns is None:
        start_ns = 0

    if end_ns is None:
        end_ns = start_ns

    return fom.McapTimeRange(
        start_ns=int(start_ns),
        end_ns=int(end_ns),
    )


def _serialize_time_range(time_range):
    return {
        "startNs": int(time_range.start_ns),
        "endNs": int(time_range.end_ns),
    }


def _update_bounds(start_ns, end_ns, value):
    if start_ns is None or value < start_ns:
        start_ns = value

    if end_ns is None or value > end_ns:
        end_ns = value

    return start_ns, end_ns


def _update_stream_range(stream, log_time):
    start_ns = None
    end_ns = None

    if stream["_has_time_range"]:
        start_ns = stream["time_range"].start_ns
        end_ns = stream["time_range"].end_ns

    start_ns, end_ns = _update_bounds(start_ns, end_ns, log_time)
    stream["time_range"] = _make_time_range_document(start_ns, end_ns)
    stream["_has_time_range"] = True


def _merge_stream_message_count(stream, message_count):
    message_count = int(message_count)
    if stream["message_count"] is None:
        stream["message_count"] = 0

    stream["message_count"] += message_count
    stream["_message_count_known"] = True


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


def _build_stream_lookup(metadata):
    return {stream.stream_id: stream for stream in metadata.streams}


def _validate_known_stream_ids(stream_ids, stream_lookup):
    unknown_stream_ids = [
        stream_id for stream_id in stream_ids if stream_id not in stream_lookup
    ]
    if unknown_stream_ids:
        raise McapRouteError(
            400,
            "Unknown MCAP stream id(s): %s"
            % ", ".join(sorted(unknown_stream_ids)),
        )


def _requires_ingest(metadata, rendering_plan, media_field, media_path):
    if metadata is None or rendering_plan is None:
        return True

    if metadata.media_field != media_field:
        return True

    if rendering_plan.media_field != media_field:
        return True

    fingerprint = metadata.source_fingerprint
    if fingerprint is None:
        return True

    stat = os.stat(media_path)
    return any(
        (
            fingerprint.path != media_path,
            int(fingerprint.size_bytes) != int(stat.st_size),
            int(fingerprint.mtime_ns) != int(stat.st_mtime_ns),
        )
    )


def _get_mcap_reader_module():
    try:
        return importlib.import_module("mcap.reader")
    except Exception as exc:
        raise McapDependencyError(
            "MCAP support requires the Python package 'mcap>=1,<2'"
        ) from exc
