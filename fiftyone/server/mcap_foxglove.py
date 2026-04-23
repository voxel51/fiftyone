"""
Minimal Foxglove protobuf decoders for MCAP ingest inventory.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

# pylint: disable=no-member

from google.protobuf import descriptor_pb2
from google.protobuf import descriptor_pool
from google.protobuf import message_factory


class McapFoxgloveDecodeError(ValueError):
    """Raised when a Foxglove protobuf payload cannot be decoded."""


_MESSAGE_DESCRIPTOR_POOL = descriptor_pool.DescriptorPool()
_MESSAGE_CLASS_CACHE = {}


def _get_message_class(schema):
    if schema is None:
        raise McapFoxgloveDecodeError("Foxglove protobuf schema is missing")

    schema_cache_key = (
        getattr(schema, "id", None),
        getattr(schema, "name", None),
    )
    cached = _MESSAGE_CLASS_CACHE.get(schema_cache_key)
    if cached is not None:
        return cached

    descriptor_set_bytes = getattr(schema, "data", None)
    if not descriptor_set_bytes:
        raise McapFoxgloveDecodeError(
            "Foxglove protobuf schema '%s' is missing a descriptor set"
            % getattr(schema, "name", "<unknown>")
        )

    descriptor_set = descriptor_pb2.FileDescriptorSet()
    try:
        descriptor_set.ParseFromString(descriptor_set_bytes)
    except Exception as error:
        raise McapFoxgloveDecodeError(
            "Invalid Foxglove descriptor set for '%s'"
            % getattr(schema, "name", "<unknown>")
        ) from error

    for file_descriptor in descriptor_set.file:
        try:
            _MESSAGE_DESCRIPTOR_POOL.AddSerializedFile(
                file_descriptor.SerializeToString()
            )
        except Exception:
            # Shared dependencies such as Timestamp will be re-added by each
            # schema descriptor set, which is safe to ignore.
            pass

    try:
        descriptor = _MESSAGE_DESCRIPTOR_POOL.FindMessageTypeByName(
            schema.name
        )
    except Exception as error:
        raise McapFoxgloveDecodeError(
            "Unable to resolve Foxglove schema '%s'" % schema.name
        ) from error

    message_class = message_factory.GetMessageClass(descriptor)
    _MESSAGE_CLASS_CACHE[schema_cache_key] = message_class
    return message_class


def _decode_message(schema, payload):
    try:
        message = _get_message_class(schema)()
        message.ParseFromString(payload)
        return message
    except McapFoxgloveDecodeError:
        raise
    except Exception as error:
        raise McapFoxgloveDecodeError(
            "Unable to decode Foxglove payload for '%s'"
            % getattr(schema, "name", "<unknown>")
        ) from error


def _decode_timestamp_ns(timestamp):
    if timestamp is None:
        return None

    return int(getattr(timestamp, "seconds", 0)) * 1_000_000_000 + int(
        getattr(timestamp, "nanos", 0)
    )


def _has_message_field(message, field_name):
    try:
        return bool(message.HasField(field_name))
    except (AttributeError, ValueError):
        return getattr(message, field_name, None) is not None


def _decode_first_annotation_timestamp_ns(message):
    if _has_message_field(message, "timestamp"):
        return _decode_timestamp_ns(getattr(message, "timestamp", None))

    for field_name in ("circles", "points", "texts"):
        annotations = getattr(message, field_name, None) or []
        if not annotations:
            continue

        first_annotation = annotations[0]
        if _has_message_field(first_annotation, "timestamp"):
            return _decode_timestamp_ns(
                getattr(first_annotation, "timestamp", None)
            )

    return None


def _decode_first_scene_timestamp_ns(message):
    entities = getattr(message, "entities", None) or []
    if entities:
        first_entity = entities[0]
        if _has_message_field(first_entity, "timestamp"):
            return _decode_timestamp_ns(
                getattr(first_entity, "timestamp", None)
            )

    deletions = getattr(message, "deletions", None) or []
    if deletions:
        first_deletion = deletions[0]
        if _has_message_field(first_deletion, "timestamp"):
            return _decode_timestamp_ns(
                getattr(first_deletion, "timestamp", None)
            )

    return None


def _collect_scene_entity_frame_ids(message):
    frame_ids = []
    seen_frame_ids = set()

    for entity in getattr(message, "entities", None) or []:
        frame_id = getattr(entity, "frame_id", "")
        if not frame_id or frame_id in seen_frame_ids:
            continue

        seen_frame_ids.add(frame_id)
        frame_ids.append(frame_id)

    return frame_ids


def decode_sync_timestamp_ns(schema, payload):
    """Decodes the best-effort sensor timestamp for one Foxglove payload."""

    schema_name = getattr(schema, "name", None)
    if schema_name not in (
        "foxglove.CompressedImage",
        "foxglove.PointCloud",
        "foxglove.FrameTransform",
        "foxglove.CameraCalibration",
        "foxglove.ImageAnnotations",
        "foxglove.SceneUpdate",
    ):
        return None

    message = _decode_message(schema, payload)
    if schema_name == "foxglove.ImageAnnotations":
        return _decode_first_annotation_timestamp_ns(message)

    if schema_name == "foxglove.SceneUpdate":
        return _decode_first_scene_timestamp_ns(message)

    return _decode_timestamp_ns(getattr(message, "timestamp", None))


def decode_catalog_details(schema, payload):
    """Decodes inventory details for one Foxglove protobuf payload."""

    schema_name = getattr(schema, "name", None)
    if schema_name not in (
        "foxglove.CompressedImage",
        "foxglove.PointCloud",
        "foxglove.FrameTransform",
        "foxglove.CameraCalibration",
        "foxglove.ImageAnnotations",
        "foxglove.SceneUpdate",
    ):
        return {}

    message = _decode_message(schema, payload)

    if schema_name in (
        "foxglove.CompressedImage",
        "foxglove.PointCloud",
        "foxglove.CameraCalibration",
    ):
        return {"frame_id": getattr(message, "frame_id", "")}

    if schema_name == "foxglove.SceneUpdate":
        frame_ids = _collect_scene_entity_frame_ids(message)
        details = {"frame_ids": frame_ids}
        if len(frame_ids) == 1:
            details["frame_id"] = frame_ids[0]

        return details

    if schema_name == "foxglove.ImageAnnotations":
        return {}

    return {
        "transform_edges": [
            (
                getattr(message, "parent_frame_id", ""),
                getattr(message, "child_frame_id", ""),
            )
        ]
    }
