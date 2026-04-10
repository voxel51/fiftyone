"""
FiftyOne Server MCAP adapter helpers.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import base64
from collections import OrderedDict
import importlib
import logging
import os
import time


logger = logging.getLogger(__name__)

_SUPPORTED_SCHEMA_ROLES = {
    "sensor_msgs/msg/CompressedImage": "image_stream",
    "sensor_msgs/msg/PointCloud2": "pointcloud_stream",
}

_ROLE_PANEL_CONFIG = {
    "image_stream": {"panel_type": "2d", "content_type": "image"},
    "pointcloud_stream": {"panel_type": "3d", "content_type": "pointcloud"},
}


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


def inspect_sample_mcap_scene(dataset, sample, media_field):
    """Builds scene inventory and playback-plan data for an MCAP sample."""
    media_path = _resolve_media_path(sample, media_field)
    scene_id = _build_scene_id(dataset, sample, media_field)

    started_at = time.perf_counter()
    with open(media_path, "rb") as stream:
        reader = _get_mcap_reader_module().make_reader(stream)
        result = _inspect_reader(
            reader=reader,
            scene_id=scene_id,
            dataset_id=str(dataset._doc.id),
            sample_id=str(sample.id),
            media_field=media_field,
            media_path=media_path,
        )

    logger.debug(
        "Inspected MCAP scene %s in %.3f ms (%d supported streams)",
        media_path,
        (time.perf_counter() - started_at) * 1000,
        len(result["scene"]["streams"]),
    )
    return result


def read_sample_mcap_window(
    dataset, sample, media_field, stream_ids, window, mode="raw"
):
    """Reads a raw message window for the requested MCAP streams."""
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
    media_path = _resolve_media_path(sample, media_field)
    scene_id = _build_scene_id(dataset, sample, media_field)

    started_at = time.perf_counter()
    with open(media_path, "rb") as stream:
        reader = _get_mcap_reader_module().make_reader(stream)
        supported_streams = _collect_supported_stream_metadata(reader)

        unknown_stream_ids = [
            stream_id
            for stream_id in stream_ids
            if stream_id not in supported_streams
        ]
        if unknown_stream_ids:
            raise McapRouteError(
                400,
                "Unknown MCAP stream id(s): %s"
                % ", ".join(sorted(unknown_stream_ids)),
            )

        response_streams = OrderedDict(
            (
                stream_id,
                {
                    "streamId": stream_id,
                    "schemaName": supported_streams[stream_id]["schemaName"],
                    "messageEncoding": supported_streams[stream_id][
                        "messageEncoding"
                    ],
                    "messages": [],
                },
            )
            for stream_id in stream_ids
        )
        message_indexes = {stream_id: 0 for stream_id in stream_ids}

        for schema, channel, message in _iter_reader_messages(
            reader,
            topics=stream_ids,
            start_ns=start_ns,
            end_ns=end_ns,
        ):
            del schema
            stream_id = channel.topic
            message_index = message_indexes[stream_id]
            message_indexes[stream_id] += 1
            response_streams[stream_id]["messages"].append(
                {
                    "messageId": _build_message_id(
                        stream_id, message, message_index
                    ),
                    "logTimeNs": int(message.log_time),
                    "publishTimeNs": int(message.publish_time),
                    "payloadB64": base64.b64encode(message.data).decode(
                        "ascii"
                    ),
                }
            )

    logger.debug(
        "Read MCAP raw window %s [%s, %s] in %.3f ms (%d streams)",
        media_path,
        start_ns,
        end_ns,
        (time.perf_counter() - started_at) * 1000,
        len(response_streams),
    )

    return {
        "mode": "raw",
        "sceneId": scene_id,
        "window": {"startNs": start_ns, "endNs": end_ns},
        "streams": list(response_streams.values()),
    }


def read_sample_mcap_timeline_index(dataset, sample, media_field, stream_ids):
    """Reads a timestamp-only playback index for the requested MCAP streams."""
    stream_ids = _normalize_stream_ids(stream_ids, allow_empty=True)
    media_path = _resolve_media_path(sample, media_field)
    scene_id = _build_scene_id(dataset, sample, media_field)

    if not stream_ids:
        return _build_timeline_response(scene_id, [], [])

    started_at = time.perf_counter()
    with open(media_path, "rb") as stream:
        reader = _get_mcap_reader_module().make_reader(stream)
        supported_streams = _collect_supported_stream_metadata(reader)

        unknown_stream_ids = [
            stream_id
            for stream_id in stream_ids
            if stream_id not in supported_streams
        ]
        if unknown_stream_ids:
            raise McapRouteError(
                400,
                "Unknown MCAP stream id(s): %s"
                % ", ".join(sorted(unknown_stream_ids)),
            )

        timeline_streams = OrderedDict(
            (stream_id, []) for stream_id in stream_ids
        )
        shared_timestamps = set()

        for schema, channel, message in _iter_reader_messages(
            reader, topics=stream_ids
        ):
            del schema
            log_time = int(message.log_time)
            timeline_streams[channel.topic].append(log_time)
            shared_timestamps.add(log_time)

    logger.debug(
        "Read MCAP timeline %s in %.3f ms (%d streams, %d timestamps)",
        media_path,
        (time.perf_counter() - started_at) * 1000,
        len(timeline_streams),
        len(shared_timestamps),
    )

    return _build_timeline_response(
        scene_id=scene_id,
        timestamps_ns=sorted(shared_timestamps),
        streams=[
            {
                "streamId": stream_id,
                "timestampsNs": sorted(stream_timestamps),
            }
            for stream_id, stream_timestamps in timeline_streams.items()
        ],
    )


def _inspect_reader(
    scene_id, dataset_id, sample_id, media_field, media_path, reader
):
    summary = reader.get_summary()
    overall_range = _get_summary_scene_time_range(summary)

    if summary is None:
        return _inspect_reader_without_summary(
            reader=reader,
            scene_id=scene_id,
            dataset_id=dataset_id,
            sample_id=sample_id,
            media_field=media_field,
            media_path=media_path,
        )

    supported_streams = _build_supported_streams_from_summary(summary)

    if supported_streams:
        _populate_stream_ranges_from_messages(reader, supported_streams)

    if overall_range is None:
        overall_range = _scan_overall_time_range(reader)

    streams = _finalize_streams(supported_streams)
    return _build_scene_response(
        scene_id=scene_id,
        dataset_id=dataset_id,
        sample_id=sample_id,
        media_field=media_field,
        media_path=media_path,
        overall_range=overall_range,
        streams=streams,
    )


def _inspect_reader_without_summary(
    reader, scene_id, dataset_id, sample_id, media_field, media_path
):
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

    return _build_scene_response(
        scene_id=scene_id,
        dataset_id=dataset_id,
        sample_id=sample_id,
        media_field=media_field,
        media_path=media_path,
        overall_range=(overall_start, overall_end),
        streams=_finalize_streams(supported_streams),
    )


def _build_scene_response(
    scene_id,
    dataset_id,
    sample_id,
    media_field,
    media_path,
    overall_range,
    streams,
):
    return {
        "scene": {
            "sceneId": scene_id,
            "datasetId": dataset_id,
            "sampleId": sample_id,
            "mediaField": media_field,
            "mediaPath": media_path,
            "timeRange": _make_time_range(*overall_range),
            "streams": streams,
        },
        "playbackPlan": _build_playback_plan(scene_id, streams),
    }


def _build_playback_plan(scene_id, streams):
    panels = []
    for stream in streams:
        panel_config = _ROLE_PANEL_CONFIG.get(stream["role"])
        if panel_config is None:
            continue

        panels.append(
            {
                "panelId": _build_panel_id(stream["streamId"]),
                "panelType": panel_config["panel_type"],
                "contentType": panel_config["content_type"],
                "streamId": stream["streamId"],
            }
        )

    return {
        "sceneId": scene_id,
        "sync": {
            "timestampSource": "header.stamp",
            "fallback": "log_time",
            "mode": "nearest",
        },
        "panels": panels,
        "sidebars": {
            "left": "panel_config",
            "right": "stream_metadata",
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


def _collect_supported_stream_metadata(reader):
    summary = reader.get_summary()
    if summary is not None:
        return _build_supported_streams_from_summary(summary)

    supported_streams = OrderedDict()
    for schema, channel, message in _iter_reader_messages(reader):
        del message
        role = _resolve_stream_role(getattr(schema, "name", None))
        if not role or channel.topic in supported_streams:
            continue

        supported_streams[channel.topic] = _build_stream_descriptor(
            channel=channel,
            schema=schema,
            role=role,
            message_count=None,
            message_count_known=False,
        )

    return supported_streams


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
    for schema, channel, message in _iter_reader_messages(
        reader, topics=topics
    ):
        del schema
        stream = supported_streams[channel.topic]
        _update_stream_range(stream, int(message.log_time))
        if not stream["_messageCountKnown"]:
            _increment_stream_count(stream)


def _scan_overall_time_range(reader):
    start_ns = None
    end_ns = None

    for schema, channel, message in _iter_reader_messages(reader):
        del schema, channel
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
        "streamId": channel.topic,
        "topic": channel.topic,
        "schemaName": schema.name,
        "schemaEncoding": schema.encoding,
        "messageEncoding": channel.message_encoding,
        "role": role,
        "channelId": int(channel.id),
        "schemaId": int(schema.id),
        "timeRange": _make_time_range(None, None),
        "messageCount": message_count,
        "_hasTimeRange": False,
        "_messageCountKnown": bool(message_count_known),
    }


def _finalize_streams(streams):
    finalized = []
    for stream in streams.values():
        finalized.append(
            {
                key: value
                for key, value in stream.items()
                if not key.startswith("_")
            }
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


def _make_time_range(start_ns, end_ns):
    if start_ns is None:
        start_ns = 0

    if end_ns is None:
        end_ns = start_ns

    return {"startNs": int(start_ns), "endNs": int(end_ns)}


def _update_bounds(start_ns, end_ns, value):
    if start_ns is None or value < start_ns:
        start_ns = value

    if end_ns is None or value > end_ns:
        end_ns = value

    return start_ns, end_ns


def _update_stream_range(stream, log_time):
    current_range = stream["timeRange"]
    start_ns = None
    end_ns = None

    if stream["_hasTimeRange"]:
        start_ns = current_range["startNs"]
        end_ns = current_range["endNs"]

    start_ns, end_ns = _update_bounds(start_ns, end_ns, log_time)
    stream["timeRange"] = _make_time_range(start_ns, end_ns)
    stream["_hasTimeRange"] = True


def _merge_stream_message_count(stream, message_count):
    message_count = int(message_count)
    if stream["messageCount"] is None:
        stream["messageCount"] = 0

    stream["messageCount"] += message_count
    stream["_messageCountKnown"] = True


def _increment_stream_count(stream):
    if stream["messageCount"] is None:
        stream["messageCount"] = 0

    stream["messageCount"] += 1


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


def _get_mcap_reader_module():
    try:
        return importlib.import_module("mcap.reader")
    except Exception as exc:
        raise McapDependencyError(
            "MCAP support requires the Python package 'mcap>=1,<2'"
        ) from exc
