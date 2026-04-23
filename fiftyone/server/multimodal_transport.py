"""
Multimodal ingest, transport, and persistence helpers.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from collections import OrderedDict
import hashlib
import json
import logging
import os
import re
import struct

import fiftyone.constants as foc
import fiftyone.core.metadata as fom
from fiftyone.server.mcap_cdr import (
    McapCdrDecodeError,
    decode_catalog_details,
    decode_sync_timestamp_ns,
)
from fiftyone.server.mcap_foxglove import McapFoxgloveDecodeError
from fiftyone.server.multimodal_codecs import (
    _SCHEMA_CODEC_REGISTRY,
    _get_schema_name,
)
from fiftyone.server.multimodal_common import (
    _CATALOG_VERSION,
    _MULTIMODAL_RAW_BUFFER_BINARY_MAGIC,
    _MULTIMODAL_RAW_BUFFER_BINARY_VERSION,
    _TIMELINE_INDEX_ARTIFACTS_SUBDIR,
    MULTIMODAL_RAW_BUFFER_BINARY_CONTENT_TYPE,
    MultimodalIngestArtifacts,
    MultimodalRouteError,
)
from fiftyone.server.multimodal_rendering import _serialize_rendering_plan

logger = logging.getLogger(__name__)


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
    timestamp_source, fallback = _canonicalize_timeline_index_policy(
        timestamp_source, fallback
    )
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


def _make_stream_window_binary_cache_key(
    metadata,
    stream_ids,
    start_time_ns,
    end_time_ns,
    max_messages_per_stream,
    timestamp_source,
    fallback,
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
        int(start_time_ns),
        int(end_time_ns),
        (
            None
            if max_messages_per_stream is None
            else int(max_messages_per_stream)
        ),
        timestamp_source,
        fallback,
        fingerprint_key,
    )


def _init_timeline_index_accumulators():
    timeline_indexes = OrderedDict()
    for timestamp_source, fallback in _iter_timeline_index_policies():
        policy_key = _build_timeline_index_policy_key(
            timestamp_source, fallback
        )
        timeline_indexes[policy_key] = {
            "timestamp_source": timestamp_source,
            "fallback": fallback,
            "timestamps_ns": set(),
            "streams": OrderedDict(),
        }

    return timeline_indexes


def _accumulate_timeline_index_samples(
    timeline_indexes,
    stream_id,
    schema_name,
    schema,
    payload,
    log_time_ns,
    publish_time_ns,
    codec_registry,
):
    decoded_timestamp_ns = _decode_message_sync_timestamp_ns(
        schema_name=schema_name,
        payload=payload,
        codec_registry=codec_registry,
        schema=schema,
    )
    for timestamp_source, fallback in _iter_timeline_index_policies():
        policy_key = _build_timeline_index_policy_key(
            timestamp_source, fallback
        )
        sync_timestamp_ns = _resolve_message_sync_timestamp_from_components(
            decoded_timestamp_ns=decoded_timestamp_ns,
            log_time_ns=log_time_ns,
            publish_time_ns=publish_time_ns,
            timestamp_source=timestamp_source,
            fallback=fallback,
        )
        policy_index = timeline_indexes[policy_key]
        policy_stream = policy_index["streams"].setdefault(stream_id, [])
        policy_stream.append(
            {
                "timestamp_ns": sync_timestamp_ns,
                "log_time_ns": int(log_time_ns),
                "publish_time_ns": int(publish_time_ns),
            }
        )
        policy_index["timestamps_ns"].add(sync_timestamp_ns)


def _finalize_timeline_index_accumulators(timeline_indexes):
    finalized_indexes = OrderedDict()
    for policy_key, timeline_index in timeline_indexes.items():
        finalized_indexes[policy_key] = {
            "timestamp_source": timeline_index["timestamp_source"],
            "fallback": timeline_index["fallback"],
            "timestamps_ns": sorted(timeline_index["timestamps_ns"]),
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
                for stream_id, stream_timestamps in timeline_index[
                    "streams"
                ].items()
            ),
        }

    return finalized_indexes


def _iter_timeline_index_policies():
    return (
        ("header.stamp", "log_time"),
        ("header.stamp", "publish_time"),
        ("publish_time", "log_time"),
        ("log_time", "log_time"),
    )


def _canonicalize_timeline_index_policy(timestamp_source, fallback):
    timestamp_source = _normalize_timestamp_source(timestamp_source)
    fallback = _normalize_timestamp_fallback(fallback)
    if timestamp_source != "header.stamp":
        fallback = "log_time"

    return timestamp_source, fallback


def _build_timeline_index_policy_key(timestamp_source, fallback):
    timestamp_source, fallback = _canonicalize_timeline_index_policy(
        timestamp_source, fallback
    )
    return "%s|%s" % (timestamp_source, fallback)


def _decode_message_sync_timestamp_ns(
    schema_name, payload, codec_registry=None, schema=None
):
    schema_name = schema_name or _get_schema_name(schema)
    try:
        if codec_registry is None:
            return decode_sync_timestamp_ns(schema_name, payload)

        return codec_registry.decode_sync_timestamp_ns(
            schema or schema_name, payload
        )
    except (McapCdrDecodeError, McapFoxgloveDecodeError):
        logger.debug(
            "Falling back to non-header timestamp for %s",
            schema_name,
            exc_info=True,
        )
        return None


def _resolve_message_sync_timestamp_from_components(
    decoded_timestamp_ns,
    log_time_ns,
    publish_time_ns,
    timestamp_source,
    fallback,
):
    timestamp_source = _normalize_timestamp_source(timestamp_source)
    fallback = _normalize_timestamp_fallback(fallback)

    if timestamp_source == "log_time":
        return int(log_time_ns)

    if timestamp_source == "publish_time":
        if publish_time_ns:
            return int(publish_time_ns)

        return int(log_time_ns)

    if decoded_timestamp_ns:
        return int(decoded_timestamp_ns)

    if fallback == "publish_time" and publish_time_ns:
        return int(publish_time_ns)

    return int(log_time_ns)


def _get_timeline_index_artifacts_dir():
    return os.path.join(
        foc.FIFTYONE_CONFIG_DIR, _TIMELINE_INDEX_ARTIFACTS_SUBDIR
    )


def _get_timeline_index_artifact_prefix(source_path):
    basename = os.path.basename(source_path) or "multimodal"
    safe_basename = re.sub(r"[^A-Za-z0-9._-]+", "_", basename)[:64]
    source_digest = hashlib.sha1(
        os.path.abspath(source_path).encode("utf-8")
    ).hexdigest()[:16]
    return "%s-%s" % (safe_basename, source_digest)


def _get_timeline_index_artifact_path(
    source_path, fingerprint, timestamp_source, fallback
):
    timestamp_source, fallback = _canonicalize_timeline_index_policy(
        timestamp_source, fallback
    )
    fingerprint = fingerprint or fom.MultimodalSourceFingerprint(
        path=source_path,
        size_bytes=0,
        mtime_ns=0,
    )
    policy_suffix = (
        _build_timeline_index_policy_key(timestamp_source, fallback)
        .replace(".", "_")
        .replace("|", "__")
    )
    artifact_prefix = _get_timeline_index_artifact_prefix(source_path)
    filename = "%s.%s.%s.%s.%s.json" % (
        artifact_prefix,
        _CATALOG_VERSION,
        int(fingerprint.size_bytes),
        int(fingerprint.mtime_ns),
        policy_suffix,
    )
    return os.path.join(_get_timeline_index_artifacts_dir(), filename)


def _persist_timeline_index_artifacts(metadata, timeline_indexes):
    artifacts_dir = _get_timeline_index_artifacts_dir()
    os.makedirs(artifacts_dir, exist_ok=True)
    _prune_timeline_index_artifacts(metadata.source_path)
    for timeline_index in timeline_indexes.values():
        artifact_path = _get_timeline_index_artifact_path(
            source_path=metadata.source_path,
            fingerprint=metadata.source_fingerprint,
            timestamp_source=timeline_index["timestamp_source"],
            fallback=timeline_index["fallback"],
        )
        payload = {
            "scene_id": metadata.scene_id,
            "timestamp_source": timeline_index["timestamp_source"],
            "fallback": timeline_index["fallback"],
            "timestamps_ns": timeline_index["timestamps_ns"],
            "streams": timeline_index["streams"],
        }
        temp_path = "%s.tmp" % artifact_path
        with open(temp_path, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, separators=(",", ":"))
        os.replace(temp_path, artifact_path)


def _prune_timeline_index_artifacts(source_path):
    artifacts_dir = _get_timeline_index_artifacts_dir()
    if not os.path.isdir(artifacts_dir):
        return

    artifact_prefix = "%s." % _get_timeline_index_artifact_prefix(source_path)
    for filename in os.listdir(artifacts_dir):
        if not filename.startswith(artifact_prefix):
            continue

        artifact_path = os.path.join(artifacts_dir, filename)
        try:
            os.remove(artifact_path)
        except OSError:
            logger.debug(
                "Failed to remove stale multimodal timeline artifact %s",
                artifact_path,
                exc_info=True,
            )


def _has_persisted_timeline_index_artifacts(metadata):
    fingerprint = metadata.source_fingerprint
    for timestamp_source, fallback in _iter_timeline_index_policies():
        artifact_path = _get_timeline_index_artifact_path(
            source_path=metadata.source_path,
            fingerprint=fingerprint,
            timestamp_source=timestamp_source,
            fallback=fallback,
        )
        if not os.path.exists(artifact_path):
            return False

    return True


def _load_persisted_timeline_index(metadata, timestamp_source, fallback):
    timestamp_source, fallback = _canonicalize_timeline_index_policy(
        timestamp_source, fallback
    )
    artifact_path = _get_timeline_index_artifact_path(
        source_path=metadata.source_path,
        fingerprint=metadata.source_fingerprint,
        timestamp_source=timestamp_source,
        fallback=fallback,
    )
    if not os.path.exists(artifact_path):
        return None

    with open(artifact_path, "r", encoding="utf-8") as stream:
        payload = json.load(stream)

    return {
        "timestamp_source": payload["timestamp_source"],
        "fallback": payload["fallback"],
        "timestamps_ns": payload["timestamps_ns"],
        "streams": payload["streams"],
    }


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


def _ingest_reader(
    reader,
    scene_id,
    media_field,
    source_path,
    source_kind=None,
    codec_registry=None,
):
    resolved_codec_registry = codec_registry or _SCHEMA_CODEC_REGISTRY
    source_kind = source_kind or "mcap"
    summary = reader.get_summary()
    summary_schemas = getattr(summary, "schemas", {}) or {}
    streams = _build_stream_records_from_summary(
        summary, resolved_codec_registry
    )
    overall_range = _get_summary_scene_time_range(summary)
    transform_records = OrderedDict()
    extra_frame_ids = OrderedDict()
    timeline_indexes = _init_timeline_index_accumulators()

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
        publish_time_ns = int(message.publish_time)
        overall_range = _update_overall_range(overall_range, log_time_ns)
        _update_stream_range(stream, log_time_ns)
        if not stream["_message_count_known"]:
            _increment_stream_count(stream)

        _accumulate_timeline_index_samples(
            timeline_indexes=timeline_indexes,
            stream_id=channel.topic,
            schema_name=stream["schema_name"],
            schema=schema,
            payload=message.data,
            log_time_ns=log_time_ns,
            publish_time_ns=publish_time_ns,
            codec_registry=resolved_codec_registry,
        )

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

    metadata = fom.MultimodalMetadata.build_for(
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

    return MultimodalIngestArtifacts(
        metadata=metadata,
        timeline_indexes=_finalize_timeline_index_accumulators(
            timeline_indexes
        ),
    )


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
    decoded_timestamp_ns = None
    if _normalize_timestamp_source(timestamp_source) == "header.stamp":
        decoded_timestamp_ns = _decode_message_sync_timestamp_ns(
            schema_name=schema_name,
            payload=payload,
            codec_registry=codec_registry,
            schema=schema,
        )

    return _resolve_message_sync_timestamp_from_components(
        decoded_timestamp_ns=decoded_timestamp_ns,
        log_time_ns=log_time_ns,
        publish_time_ns=publish_time_ns,
        timestamp_source=timestamp_source,
        fallback=fallback,
    )


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
