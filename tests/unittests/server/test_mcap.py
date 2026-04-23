"""
FiftyOne Server MCAP adapter and service unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

# pylint: disable=no-member

import json
import struct
import tempfile
from types import SimpleNamespace

from google.protobuf import descriptor_pb2
from google.protobuf import descriptor_pool
from google.protobuf import message_factory
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


def _make_schema(schema_id, name, encoding="ros2msg", data=b""):
    return SimpleNamespace(
        id=schema_id, name=name, encoding=encoding, data=data
    )


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


def _decode_binary_window_response(payload):
    assert payload[:4] == b"MMRB"
    assert payload[4] == 1
    manifest_size = struct.unpack("<I", payload[5:9])[0]
    manifest_end = 9 + manifest_size
    manifest = json.loads(payload[9:manifest_end].decode("utf-8"))
    return manifest, payload[manifest_end:]


def _add_proto_field(
    message_descriptor,
    name,
    number,
    field_type,
    label=descriptor_pb2.FieldDescriptorProto.LABEL_OPTIONAL,
    type_name=None,
):
    field = message_descriptor.field.add()
    field.name = name
    field.number = number
    field.type = field_type
    field.label = label
    if type_name is not None:
        field.type_name = type_name


def _build_foxglove_descriptor_set():
    descriptor_set = descriptor_pb2.FileDescriptorSet()

    timestamp_file = descriptor_set.file.add()
    timestamp_file.name = "google/protobuf/timestamp.proto"
    timestamp_file.package = "google.protobuf"
    timestamp_file.syntax = "proto3"
    timestamp_message = timestamp_file.message_type.add()
    timestamp_message.name = "Timestamp"
    _add_proto_field(
        timestamp_message,
        "seconds",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_INT64,
    )
    _add_proto_field(
        timestamp_message,
        "nanos",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_INT32,
    )

    duration_file = descriptor_set.file.add()
    duration_file.name = "google/protobuf/duration.proto"
    duration_file.package = "google.protobuf"
    duration_file.syntax = "proto3"
    duration_message = duration_file.message_type.add()
    duration_message.name = "Duration"
    _add_proto_field(
        duration_message,
        "seconds",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_INT64,
    )
    _add_proto_field(
        duration_message,
        "nanos",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_INT32,
    )

    vector3_file = descriptor_set.file.add()
    vector3_file.name = "foxglove/Vector3.proto"
    vector3_file.package = "foxglove"
    vector3_file.syntax = "proto3"
    vector3_message = vector3_file.message_type.add()
    vector3_message.name = "Vector3"
    _add_proto_field(
        vector3_message,
        "x",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_DOUBLE,
    )
    _add_proto_field(
        vector3_message,
        "y",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_DOUBLE,
    )
    _add_proto_field(
        vector3_message,
        "z",
        3,
        descriptor_pb2.FieldDescriptorProto.TYPE_DOUBLE,
    )

    quaternion_file = descriptor_set.file.add()
    quaternion_file.name = "foxglove/Quaternion.proto"
    quaternion_file.package = "foxglove"
    quaternion_file.syntax = "proto3"
    quaternion_message = quaternion_file.message_type.add()
    quaternion_message.name = "Quaternion"
    _add_proto_field(
        quaternion_message,
        "x",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_DOUBLE,
    )
    _add_proto_field(
        quaternion_message,
        "y",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_DOUBLE,
    )
    _add_proto_field(
        quaternion_message,
        "z",
        3,
        descriptor_pb2.FieldDescriptorProto.TYPE_DOUBLE,
    )
    _add_proto_field(
        quaternion_message,
        "w",
        4,
        descriptor_pb2.FieldDescriptorProto.TYPE_DOUBLE,
    )

    pose_file = descriptor_set.file.add()
    pose_file.name = "foxglove/Pose.proto"
    pose_file.package = "foxglove"
    pose_file.syntax = "proto3"
    pose_file.dependency.extend(
        ["foxglove/Vector3.proto", "foxglove/Quaternion.proto"]
    )
    pose_message = pose_file.message_type.add()
    pose_message.name = "Pose"
    _add_proto_field(
        pose_message,
        "position",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".foxglove.Vector3",
    )
    _add_proto_field(
        pose_message,
        "orientation",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".foxglove.Quaternion",
    )

    point2_file = descriptor_set.file.add()
    point2_file.name = "foxglove/Point2.proto"
    point2_file.package = "foxglove"
    point2_file.syntax = "proto3"
    point2_message = point2_file.message_type.add()
    point2_message.name = "Point2"
    _add_proto_field(
        point2_message,
        "x",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_DOUBLE,
    )
    _add_proto_field(
        point2_message,
        "y",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_DOUBLE,
    )

    color_file = descriptor_set.file.add()
    color_file.name = "foxglove/Color.proto"
    color_file.package = "foxglove"
    color_file.syntax = "proto3"
    color_message = color_file.message_type.add()
    color_message.name = "Color"
    for number, name in ((1, "r"), (2, "g"), (3, "b"), (4, "a")):
        _add_proto_field(
            color_message,
            name,
            number,
            descriptor_pb2.FieldDescriptorProto.TYPE_DOUBLE,
        )

    key_value_file = descriptor_set.file.add()
    key_value_file.name = "foxglove/KeyValuePair.proto"
    key_value_file.package = "foxglove"
    key_value_file.syntax = "proto3"
    key_value_message = key_value_file.message_type.add()
    key_value_message.name = "KeyValuePair"
    _add_proto_field(
        key_value_message,
        "key",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_STRING,
    )
    _add_proto_field(
        key_value_message,
        "value",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_STRING,
    )

    packed_field_file = descriptor_set.file.add()
    packed_field_file.name = "foxglove/PackedElementField.proto"
    packed_field_file.package = "foxglove"
    packed_field_file.syntax = "proto3"
    packed_field_message = packed_field_file.message_type.add()
    packed_field_message.name = "PackedElementField"
    numeric_type = packed_field_message.enum_type.add()
    numeric_type.name = "NumericType"
    for number, name in (
        (0, "UNKNOWN"),
        (1, "UINT8"),
        (2, "INT8"),
        (3, "UINT16"),
        (4, "INT16"),
        (5, "UINT32"),
        (6, "INT32"),
        (7, "FLOAT32"),
        (8, "FLOAT64"),
    ):
        value = numeric_type.value.add()
        value.number = number
        value.name = name

    _add_proto_field(
        packed_field_message,
        "name",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_STRING,
    )
    _add_proto_field(
        packed_field_message,
        "offset",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_UINT32,
    )
    _add_proto_field(
        packed_field_message,
        "type",
        3,
        descriptor_pb2.FieldDescriptorProto.TYPE_ENUM,
        type_name=".foxglove.PackedElementField.NumericType",
    )

    compressed_image_file = descriptor_set.file.add()
    compressed_image_file.name = "foxglove/CompressedImage.proto"
    compressed_image_file.package = "foxglove"
    compressed_image_file.syntax = "proto3"
    compressed_image_file.dependency.append("google/protobuf/timestamp.proto")
    compressed_image_message = compressed_image_file.message_type.add()
    compressed_image_message.name = "CompressedImage"
    _add_proto_field(
        compressed_image_message,
        "timestamp",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".google.protobuf.Timestamp",
    )
    _add_proto_field(
        compressed_image_message,
        "data",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_BYTES,
    )
    _add_proto_field(
        compressed_image_message,
        "format",
        3,
        descriptor_pb2.FieldDescriptorProto.TYPE_STRING,
    )
    _add_proto_field(
        compressed_image_message,
        "frame_id",
        4,
        descriptor_pb2.FieldDescriptorProto.TYPE_STRING,
    )

    pointcloud_file = descriptor_set.file.add()
    pointcloud_file.name = "foxglove/PointCloud.proto"
    pointcloud_file.package = "foxglove"
    pointcloud_file.syntax = "proto3"
    pointcloud_file.dependency.extend(
        [
            "google/protobuf/timestamp.proto",
            "foxglove/Pose.proto",
            "foxglove/PackedElementField.proto",
        ]
    )
    pointcloud_message = pointcloud_file.message_type.add()
    pointcloud_message.name = "PointCloud"
    _add_proto_field(
        pointcloud_message,
        "timestamp",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".google.protobuf.Timestamp",
    )
    _add_proto_field(
        pointcloud_message,
        "frame_id",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_STRING,
    )
    _add_proto_field(
        pointcloud_message,
        "pose",
        3,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".foxglove.Pose",
    )
    _add_proto_field(
        pointcloud_message,
        "point_stride",
        4,
        descriptor_pb2.FieldDescriptorProto.TYPE_UINT32,
    )
    _add_proto_field(
        pointcloud_message,
        "fields",
        5,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        label=descriptor_pb2.FieldDescriptorProto.LABEL_REPEATED,
        type_name=".foxglove.PackedElementField",
    )
    _add_proto_field(
        pointcloud_message,
        "data",
        6,
        descriptor_pb2.FieldDescriptorProto.TYPE_BYTES,
    )

    frame_transform_file = descriptor_set.file.add()
    frame_transform_file.name = "foxglove/FrameTransform.proto"
    frame_transform_file.package = "foxglove"
    frame_transform_file.syntax = "proto3"
    frame_transform_file.dependency.extend(
        [
            "google/protobuf/timestamp.proto",
            "foxglove/Vector3.proto",
            "foxglove/Quaternion.proto",
        ]
    )
    frame_transform_message = frame_transform_file.message_type.add()
    frame_transform_message.name = "FrameTransform"
    _add_proto_field(
        frame_transform_message,
        "timestamp",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".google.protobuf.Timestamp",
    )
    _add_proto_field(
        frame_transform_message,
        "parent_frame_id",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_STRING,
    )
    _add_proto_field(
        frame_transform_message,
        "child_frame_id",
        3,
        descriptor_pb2.FieldDescriptorProto.TYPE_STRING,
    )
    _add_proto_field(
        frame_transform_message,
        "translation",
        4,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".foxglove.Vector3",
    )
    _add_proto_field(
        frame_transform_message,
        "rotation",
        5,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".foxglove.Quaternion",
    )

    camera_calibration_file = descriptor_set.file.add()
    camera_calibration_file.name = "foxglove/CameraCalibration.proto"
    camera_calibration_file.package = "foxglove"
    camera_calibration_file.syntax = "proto3"
    camera_calibration_file.dependency.append(
        "google/protobuf/timestamp.proto"
    )
    camera_calibration_message = camera_calibration_file.message_type.add()
    camera_calibration_message.name = "CameraCalibration"
    _add_proto_field(
        camera_calibration_message,
        "timestamp",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".google.protobuf.Timestamp",
    )
    _add_proto_field(
        camera_calibration_message,
        "width",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_UINT32,
    )
    _add_proto_field(
        camera_calibration_message,
        "height",
        3,
        descriptor_pb2.FieldDescriptorProto.TYPE_UINT32,
    )
    _add_proto_field(
        camera_calibration_message,
        "frame_id",
        9,
        descriptor_pb2.FieldDescriptorProto.TYPE_STRING,
    )

    circle_annotation_file = descriptor_set.file.add()
    circle_annotation_file.name = "foxglove/CircleAnnotation.proto"
    circle_annotation_file.package = "foxglove"
    circle_annotation_file.syntax = "proto3"
    circle_annotation_file.dependency.extend(
        [
            "foxglove/Color.proto",
            "foxglove/KeyValuePair.proto",
            "foxglove/Point2.proto",
            "google/protobuf/timestamp.proto",
        ]
    )
    circle_annotation_message = circle_annotation_file.message_type.add()
    circle_annotation_message.name = "CircleAnnotation"
    _add_proto_field(
        circle_annotation_message,
        "timestamp",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".google.protobuf.Timestamp",
    )
    _add_proto_field(
        circle_annotation_message,
        "position",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".foxglove.Point2",
    )
    _add_proto_field(
        circle_annotation_message,
        "diameter",
        3,
        descriptor_pb2.FieldDescriptorProto.TYPE_DOUBLE,
    )
    _add_proto_field(
        circle_annotation_message,
        "thickness",
        4,
        descriptor_pb2.FieldDescriptorProto.TYPE_DOUBLE,
    )
    _add_proto_field(
        circle_annotation_message,
        "fill_color",
        5,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".foxglove.Color",
    )
    _add_proto_field(
        circle_annotation_message,
        "outline_color",
        6,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".foxglove.Color",
    )

    points_annotation_file = descriptor_set.file.add()
    points_annotation_file.name = "foxglove/PointsAnnotation.proto"
    points_annotation_file.package = "foxglove"
    points_annotation_file.syntax = "proto3"
    points_annotation_file.dependency.extend(
        [
            "foxglove/Color.proto",
            "foxglove/KeyValuePair.proto",
            "foxglove/Point2.proto",
            "google/protobuf/timestamp.proto",
        ]
    )
    points_annotation_message = points_annotation_file.message_type.add()
    points_annotation_message.name = "PointsAnnotation"
    points_annotation_type = points_annotation_message.enum_type.add()
    points_annotation_type.name = "Type"
    for number, name in (
        (0, "UNKNOWN"),
        (1, "POINTS"),
        (2, "LINE_LOOP"),
        (3, "LINE_STRIP"),
        (4, "LINE_LIST"),
    ):
        value = points_annotation_type.value.add()
        value.number = number
        value.name = name

    _add_proto_field(
        points_annotation_message,
        "timestamp",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".google.protobuf.Timestamp",
    )
    _add_proto_field(
        points_annotation_message,
        "type",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_ENUM,
        type_name=".foxglove.PointsAnnotation.Type",
    )
    _add_proto_field(
        points_annotation_message,
        "points",
        3,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        label=descriptor_pb2.FieldDescriptorProto.LABEL_REPEATED,
        type_name=".foxglove.Point2",
    )

    text_annotation_file = descriptor_set.file.add()
    text_annotation_file.name = "foxglove/TextAnnotation.proto"
    text_annotation_file.package = "foxglove"
    text_annotation_file.syntax = "proto3"
    text_annotation_file.dependency.extend(
        [
            "foxglove/Color.proto",
            "foxglove/KeyValuePair.proto",
            "foxglove/Point2.proto",
            "google/protobuf/timestamp.proto",
        ]
    )
    text_annotation_message = text_annotation_file.message_type.add()
    text_annotation_message.name = "TextAnnotation"
    _add_proto_field(
        text_annotation_message,
        "timestamp",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".google.protobuf.Timestamp",
    )
    _add_proto_field(
        text_annotation_message,
        "position",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".foxglove.Point2",
    )
    _add_proto_field(
        text_annotation_message,
        "text",
        3,
        descriptor_pb2.FieldDescriptorProto.TYPE_STRING,
    )

    image_annotations_file = descriptor_set.file.add()
    image_annotations_file.name = "foxglove/ImageAnnotations.proto"
    image_annotations_file.package = "foxglove"
    image_annotations_file.syntax = "proto3"
    image_annotations_file.dependency.extend(
        [
            "foxglove/CircleAnnotation.proto",
            "foxglove/PointsAnnotation.proto",
            "foxglove/TextAnnotation.proto",
            "google/protobuf/timestamp.proto",
        ]
    )
    image_annotations_message = image_annotations_file.message_type.add()
    image_annotations_message.name = "ImageAnnotations"
    _add_proto_field(
        image_annotations_message,
        "circles",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        label=descriptor_pb2.FieldDescriptorProto.LABEL_REPEATED,
        type_name=".foxglove.CircleAnnotation",
    )
    _add_proto_field(
        image_annotations_message,
        "points",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        label=descriptor_pb2.FieldDescriptorProto.LABEL_REPEATED,
        type_name=".foxglove.PointsAnnotation",
    )
    _add_proto_field(
        image_annotations_message,
        "texts",
        3,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        label=descriptor_pb2.FieldDescriptorProto.LABEL_REPEATED,
        type_name=".foxglove.TextAnnotation",
    )
    _add_proto_field(
        image_annotations_message,
        "timestamp",
        5,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".google.protobuf.Timestamp",
    )

    scene_deletion_file = descriptor_set.file.add()
    scene_deletion_file.name = "foxglove/SceneEntityDeletion.proto"
    scene_deletion_file.package = "foxglove"
    scene_deletion_file.syntax = "proto3"
    scene_deletion_file.dependency.append("google/protobuf/timestamp.proto")
    scene_deletion_message = scene_deletion_file.message_type.add()
    scene_deletion_message.name = "SceneEntityDeletion"
    scene_deletion_type = scene_deletion_message.enum_type.add()
    scene_deletion_type.name = "Type"
    for number, name in ((0, "MATCHING_ID"), (1, "ALL")):
        value = scene_deletion_type.value.add()
        value.number = number
        value.name = name

    _add_proto_field(
        scene_deletion_message,
        "timestamp",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".google.protobuf.Timestamp",
    )
    _add_proto_field(
        scene_deletion_message,
        "type",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_ENUM,
        type_name=".foxglove.SceneEntityDeletion.Type",
    )
    _add_proto_field(
        scene_deletion_message,
        "id",
        3,
        descriptor_pb2.FieldDescriptorProto.TYPE_STRING,
    )

    scene_entity_file = descriptor_set.file.add()
    scene_entity_file.name = "foxglove/SceneEntity.proto"
    scene_entity_file.package = "foxglove"
    scene_entity_file.syntax = "proto3"
    scene_entity_file.dependency.extend(
        [
            "google/protobuf/duration.proto",
            "google/protobuf/timestamp.proto",
        ]
    )
    scene_entity_message = scene_entity_file.message_type.add()
    scene_entity_message.name = "SceneEntity"
    _add_proto_field(
        scene_entity_message,
        "timestamp",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".google.protobuf.Timestamp",
    )
    _add_proto_field(
        scene_entity_message,
        "frame_id",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_STRING,
    )
    _add_proto_field(
        scene_entity_message,
        "id",
        3,
        descriptor_pb2.FieldDescriptorProto.TYPE_STRING,
    )
    _add_proto_field(
        scene_entity_message,
        "lifetime",
        4,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        type_name=".google.protobuf.Duration",
    )

    scene_update_file = descriptor_set.file.add()
    scene_update_file.name = "foxglove/SceneUpdate.proto"
    scene_update_file.package = "foxglove"
    scene_update_file.syntax = "proto3"
    scene_update_file.dependency.extend(
        [
            "foxglove/SceneEntity.proto",
            "foxglove/SceneEntityDeletion.proto",
        ]
    )
    scene_update_message = scene_update_file.message_type.add()
    scene_update_message.name = "SceneUpdate"
    _add_proto_field(
        scene_update_message,
        "deletions",
        1,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        label=descriptor_pb2.FieldDescriptorProto.LABEL_REPEATED,
        type_name=".foxglove.SceneEntityDeletion",
    )
    _add_proto_field(
        scene_update_message,
        "entities",
        2,
        descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE,
        label=descriptor_pb2.FieldDescriptorProto.LABEL_REPEATED,
        type_name=".foxglove.SceneEntity",
    )

    return descriptor_set


def _build_foxglove_message_classes(descriptor_set):
    pool = descriptor_pool.DescriptorPool()
    for file_descriptor in descriptor_set.file:
        pool.AddSerializedFile(file_descriptor.SerializeToString())

    return {
        name: message_factory.GetMessageClass(pool.FindMessageTypeByName(name))
        for name in (
            "foxglove.CompressedImage",
            "foxglove.PointCloud",
            "foxglove.FrameTransform",
            "foxglove.CameraCalibration",
            "foxglove.ImageAnnotations",
            "foxglove.SceneUpdate",
        )
    }


_FOXGLOVE_DESCRIPTOR_SET = _build_foxglove_descriptor_set()
_FOXGLOVE_DESCRIPTOR_SET_BYTES = _FOXGLOVE_DESCRIPTOR_SET.SerializeToString()
_FOXGLOVE_MESSAGE_CLASSES = _build_foxglove_message_classes(
    _FOXGLOVE_DESCRIPTOR_SET
)


def _make_foxglove_schema(schema_id, name):
    return _make_schema(
        schema_id,
        name,
        encoding="protobuf",
        data=_FOXGLOVE_DESCRIPTOR_SET_BYTES,
    )


def _make_foxglove_compressed_image_payload(
    seconds=1,
    nanos=2,
    frame_id="camera",
    image_format="jpeg",
    image_bytes=b"\x01\x02\x03",
):
    message = _FOXGLOVE_MESSAGE_CLASSES["foxglove.CompressedImage"]()
    message.timestamp.seconds = seconds
    message.timestamp.nanos = nanos
    message.frame_id = frame_id
    message.format = image_format
    message.data = image_bytes
    return message.SerializeToString()


def _make_foxglove_pointcloud_payload(seconds=1, nanos=2, frame_id="lidar"):
    message = _FOXGLOVE_MESSAGE_CLASSES["foxglove.PointCloud"]()
    message.timestamp.seconds = seconds
    message.timestamp.nanos = nanos
    message.frame_id = frame_id
    message.point_stride = 12

    for offset, name in ((0, "x"), (4, "y"), (8, "z")):
        field = message.fields.add()
        field.name = name
        field.offset = offset
        field.type = 7

    message.data = struct.pack("<fff", 1.0, 2.0, 3.0)
    return message.SerializeToString()


def _make_foxglove_frame_transform_payload(
    seconds=1,
    nanos=2,
    parent_frame_id="map",
    child_frame_id="lidar",
):
    message = _FOXGLOVE_MESSAGE_CLASSES["foxglove.FrameTransform"]()
    message.timestamp.seconds = seconds
    message.timestamp.nanos = nanos
    message.parent_frame_id = parent_frame_id
    message.child_frame_id = child_frame_id
    message.translation.x = 1.0
    message.translation.y = 2.0
    message.translation.z = 3.0
    message.rotation.w = 1.0
    return message.SerializeToString()


def _make_foxglove_camera_calibration_payload(
    seconds=1,
    nanos=2,
    frame_id="camera",
    width=1920,
    height=1080,
):
    message = _FOXGLOVE_MESSAGE_CLASSES["foxglove.CameraCalibration"]()
    message.timestamp.seconds = seconds
    message.timestamp.nanos = nanos
    message.frame_id = frame_id
    message.width = width
    message.height = height
    return message.SerializeToString()


def _make_foxglove_image_annotations_payload(
    root_timestamp=None,
    circle_timestamp=None,
    point_timestamp=None,
    text_timestamp=None,
):
    message = _FOXGLOVE_MESSAGE_CLASSES["foxglove.ImageAnnotations"]()

    if root_timestamp is not None:
        seconds, nanos = root_timestamp
        message.timestamp.seconds = seconds
        message.timestamp.nanos = nanos

    if circle_timestamp is not None:
        seconds, nanos = circle_timestamp
        annotation = message.circles.add()
        annotation.timestamp.seconds = seconds
        annotation.timestamp.nanos = nanos

    if point_timestamp is not None:
        seconds, nanos = point_timestamp
        annotation = message.points.add()
        annotation.timestamp.seconds = seconds
        annotation.timestamp.nanos = nanos

    if text_timestamp is not None:
        seconds, nanos = text_timestamp
        annotation = message.texts.add()
        annotation.timestamp.seconds = seconds
        annotation.timestamp.nanos = nanos

    return message.SerializeToString()


def _make_foxglove_scene_update_payload(
    entity_timestamps=None,
    entity_frame_ids=None,
    deletion_timestamps=None,
):
    message = _FOXGLOVE_MESSAGE_CLASSES["foxglove.SceneUpdate"]()

    entity_timestamps = entity_timestamps or []
    entity_frame_ids = entity_frame_ids or []
    deletion_timestamps = deletion_timestamps or []

    for index, timestamp in enumerate(entity_timestamps):
        seconds, nanos = timestamp
        entity = message.entities.add()
        entity.timestamp.seconds = seconds
        entity.timestamp.nanos = nanos
        entity.id = "entity-%d" % index
        entity.frame_id = (
            entity_frame_ids[index]
            if index < len(entity_frame_ids)
            else "frame-%d" % index
        )

    for index, timestamp in enumerate(deletion_timestamps):
        seconds, nanos = timestamp
        deletion = message.deletions.add()
        deletion.timestamp.seconds = seconds
        deletion.timestamp.nanos = nanos
        deletion.id = "entity-%d" % index
        deletion.type = 0

    return message.SerializeToString()


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
        time_range=fom.MultimodalTimeRange(start_ns=start_ns, end_ns=end_ns),
        message_count=message_count,
    )


def _leaf(panel_id):
    return {"type": "leaf", "panelId": panel_id}


def _split(direction, split_percentage, first, second):
    return {
        "type": "split",
        "direction": direction,
        "splitPercentage": split_percentage,
        "first": first,
        "second": second,
    }


def _make_metadata(media_path, media_field="filepath"):
    return fom.MultimodalMetadata.build_for(
        scene_id="scene-1",
        media_field=media_field,
        media_path=media_path,
        time_range=fom.MultimodalTimeRange(start_ns=10, end_ns=20),
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
        catalog_version="multimodal-workspace-v4",
    )


def _make_camera_rig_metadata(
    media_path,
    image_topics=None,
    include_three_d=True,
    include_front_support=False,
):
    image_topics = list(
        image_topics
        or [
            "/camera/front",
            "/camera/left",
            "/camera/right",
            "/camera/rear",
        ]
    )
    streams = []
    frames = []
    channel_id = 1
    schema_id = 1

    if include_three_d:
        streams.append(
            _make_stream(
                "/lidar/top",
                "3d",
                "sensor_msgs/msg/PointCloud2",
                channel_id=channel_id,
                schema_id=schema_id,
                frame_id="lidar_top",
                affordances=["pointcloud", "3d"],
                compatible_panels=["3d"],
            )
        )
        frames.append(fom.MultimodalFrameDescriptor(frame_id="lidar_top"))
        channel_id += 1
        schema_id += 1

    for topic in image_topics:
        frame_id = topic.strip("/").replace("/", "_").replace("-", "_")
        streams.append(
            _make_stream(
                topic,
                "image",
                "sensor_msgs/msg/CompressedImage",
                channel_id=channel_id,
                schema_id=schema_id,
                frame_id=frame_id,
                affordances=["image"],
                compatible_panels=["image"],
            )
        )
        frames.append(fom.MultimodalFrameDescriptor(frame_id=frame_id))
        channel_id += 1
        schema_id += 1

    if include_front_support and "/camera/front" in image_topics:
        streams.extend(
            [
                _make_stream(
                    "/camera/front/annotations",
                    "other",
                    "foxglove.ImageAnnotations",
                    channel_id=channel_id,
                    schema_id=schema_id,
                    affordances=["image-annotations", "overlay"],
                    compatible_panels=["image"],
                ),
                _make_stream(
                    "/camera/front/camera_info",
                    "other",
                    "foxglove.CameraCalibration",
                    channel_id=channel_id + 1,
                    schema_id=schema_id + 1,
                    frame_id="camera_front",
                    affordances=["camera", "calibration"],
                    compatible_panels=["image"],
                ),
            ]
        )

    return fom.MultimodalMetadata.build_for(
        scene_id="scene-1",
        media_field="filepath",
        media_path=media_path,
        time_range=fom.MultimodalTimeRange(start_ns=10, end_ns=20),
        streams=streams,
        frames=frames,
        transforms=[],
        location_topics=[],
        catalog_version="multimodal-workspace-v4",
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

        assert metadata.catalog_version == "multimodal-workspace-v4"
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
        metadata = _make_camera_rig_metadata(
            __file__,
            include_front_support=True,
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
        assert [panel.title for panel in plan.panels] == [
            "lidar",
            "camera",
            "camera 2",
            "camera 3",
        ]
        assert plan.panels[0].visible_stream_ids == ["/lidar/top"]
        assert plan.panels[0].frame_config.display_frame_id == "lidar_top"
        assert [panel.render_stream_id for panel in plan.panels[1:]] == [
            "/camera/front",
            "/camera/left",
            "/camera/right",
        ]
        assert plan.panels[1].visible_stream_ids == [
            "/camera/front/annotations",
            "/camera/front/camera_info",
        ]
        assert plan.panels[2].visible_stream_ids == []
        assert plan.panels[3].visible_stream_ids == []
        assert plan.layout_tree == _split(
            "column",
            60,
            _leaf("panel_3d_1"),
            _split(
                "row",
                33,
                _leaf("image_panel_1"),
                _split(
                    "row",
                    50,
                    _leaf("image_panel_2"),
                    _leaf("image_panel_3"),
                ),
            ),
        )

    def test_build_rendering_plan_caps_image_only_defaults_at_three(self):
        metadata = _make_camera_rig_metadata(
            __file__,
            image_topics=[
                "/camera/rear",
                "/camera/fisheye",
                "/camera/front",
                "/camera/left",
            ],
            include_three_d=False,
        )

        plan = fosm.DefaultMultimodalRenderingPlanner().build_rendering_plan(
            metadata
        )

        assert [panel.panel_id for panel in plan.panels] == [
            "image_panel_1",
            "image_panel_2",
            "image_panel_3",
        ]
        assert [panel.render_stream_id for panel in plan.panels] == [
            "/camera/front",
            "/camera/left",
            "/camera/rear",
        ]
        assert plan.layout_tree == _split(
            "row",
            33,
            _leaf("image_panel_1"),
            _split(
                "column",
                50,
                _leaf("image_panel_2"),
                _leaf("image_panel_3"),
            ),
        )

    def test_select_default_image_streams_uses_first_matched_slot(self):
        image_streams = [
            _make_stream(
                "/camera/left",
                "image",
                "sensor_msgs/msg/CompressedImage",
                channel_id=1,
                schema_id=1,
                affordances=["image"],
                compatible_panels=["image"],
            ),
            _make_stream(
                "/camera/right-left",
                "image",
                "sensor_msgs/msg/CompressedImage",
                channel_id=2,
                schema_id=2,
                affordances=["image"],
                compatible_panels=["image"],
            ),
            _make_stream(
                "/camera/right",
                "image",
                "sensor_msgs/msg/CompressedImage",
                channel_id=3,
                schema_id=3,
                affordances=["image"],
                compatible_panels=["image"],
            ),
            _make_stream(
                "/camera/rear",
                "image",
                "sensor_msgs/msg/CompressedImage",
                channel_id=4,
                schema_id=4,
                affordances=["image"],
                compatible_panels=["image"],
            ),
        ]

        selected_streams = fosm._select_default_image_streams(image_streams)

        assert [stream.stream_id for stream in selected_streams] == [
            "/camera/left",
            "/camera/right",
            "/camera/right-left",
        ]

    def test_build_rendering_plan_prefers_map_and_tf_follow_defaults(self):
        metadata = fom.MultimodalMetadata(
            scene_id="scene-1",
            media_field="filepath",
            streams=[
                _make_stream(
                    "/lidar/top",
                    "3d",
                    "sensor_msgs/msg/PointCloud2",
                    channel_id=1,
                    schema_id=1,
                    frame_id="LIDAR_TOP",
                    affordances=["pointcloud", "3d"],
                    compatible_panels=["3d"],
                ),
                _make_stream(
                    "/radar/front",
                    "3d",
                    "foxglove.PointCloud",
                    channel_id=2,
                    schema_id=2,
                    frame_id="RADAR_FRONT",
                    affordances=["pointcloud", "3d"],
                    compatible_panels=["3d"],
                ),
            ],
            frames=[
                fom.MultimodalFrameDescriptor(frame_id="RADAR_FRONT"),
                fom.MultimodalFrameDescriptor(frame_id="LIDAR_TOP"),
                fom.MultimodalFrameDescriptor(frame_id="map"),
                fom.MultimodalFrameDescriptor(frame_id="base_link"),
            ],
            transforms=[
                fom.MultimodalTransformEdge(
                    topic="/tf",
                    parent_frame_id="map",
                    child_frame_id="base_link",
                ),
                fom.MultimodalTransformEdge(
                    topic="/tf",
                    parent_frame_id="base_link",
                    child_frame_id="RADAR_FRONT",
                ),
                fom.MultimodalTransformEdge(
                    topic="/tf",
                    parent_frame_id="base_link",
                    child_frame_id="LIDAR_TOP",
                ),
            ],
            location_topics=[],
        )

        plan = fosm.DefaultMultimodalRenderingPlanner().build_rendering_plan(
            metadata
        )

        assert plan.layout_tree == _leaf("panel_3d_1")
        assert plan.panels[0].frame_config.fixed_frame_id == "map"
        assert plan.panels[0].frame_config.display_frame_id == "map"
        assert plan.panels[0].frame_config.follow_mode == "pose"

    @pytest.mark.parametrize(
        ("panel_ids", "expected_layout_tree"),
        [
            (["panel_3d_1"], _leaf("panel_3d_1")),
            (
                ["panel_3d_1", "image_panel_1"],
                _split(
                    "column",
                    60,
                    _leaf("panel_3d_1"),
                    _leaf("image_panel_1"),
                ),
            ),
            (
                ["panel_3d_1", "image_panel_1", "image_panel_2"],
                _split(
                    "column",
                    60,
                    _leaf("panel_3d_1"),
                    _split(
                        "row",
                        50,
                        _leaf("image_panel_1"),
                        _leaf("image_panel_2"),
                    ),
                ),
            ),
            (
                [
                    "panel_3d_1",
                    "image_panel_1",
                    "image_panel_2",
                    "image_panel_3",
                ],
                _split(
                    "column",
                    60,
                    _leaf("panel_3d_1"),
                    _split(
                        "row",
                        33,
                        _leaf("image_panel_1"),
                        _split(
                            "row",
                            50,
                            _leaf("image_panel_2"),
                            _leaf("image_panel_3"),
                        ),
                    ),
                ),
            ),
        ],
    )
    def test_build_default_rendering_plan_layout_tree_with_3d_panel(
        self, panel_ids, expected_layout_tree
    ):
        assert (
            fosm._build_default_rendering_plan_layout_tree(
                panel_ids, has_three_d_panel=True
            )
            == expected_layout_tree
        )

    @pytest.mark.parametrize(
        ("panel_ids", "expected_layout_tree"),
        [
            (["panel_1"], _leaf("panel_1")),
            (
                ["panel_1", "panel_2"],
                _split("row", 50, _leaf("panel_1"), _leaf("panel_2")),
            ),
            (
                ["panel_1", "panel_2", "panel_3"],
                _split(
                    "row",
                    33,
                    _leaf("panel_1"),
                    _split(
                        "column",
                        50,
                        _leaf("panel_2"),
                        _leaf("panel_3"),
                    ),
                ),
            ),
            (
                ["panel_1", "panel_2", "panel_3", "panel_4"],
                _split(
                    "column",
                    50,
                    _split(
                        "row",
                        50,
                        _leaf("panel_1"),
                        _leaf("panel_2"),
                    ),
                    _split(
                        "row",
                        50,
                        _leaf("panel_3"),
                        _leaf("panel_4"),
                    ),
                ),
            ),
            (
                ["panel_1", "panel_2", "panel_3", "panel_4", "panel_5"],
                _split(
                    "row",
                    40,
                    _split(
                        "column",
                        50,
                        _leaf("panel_1"),
                        _leaf("panel_2"),
                    ),
                    _split(
                        "column",
                        33,
                        _leaf("panel_3"),
                        _split(
                            "row",
                            50,
                            _leaf("panel_4"),
                            _leaf("panel_5"),
                        ),
                    ),
                ),
            ),
        ],
    )
    def test_build_default_layout_tree(self, panel_ids, expected_layout_tree):
        assert (
            fosm._build_default_layout_tree(panel_ids) == expected_layout_tree
        )

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

    def test_classify_stream_supports_foxglove_schemas(self):
        compressed_image = fosm._classify_stream("foxglove.CompressedImage")
        pointcloud = fosm._classify_stream("foxglove.PointCloud")
        scene_update = fosm._classify_stream("foxglove.SceneUpdate")
        image_annotations = fosm._classify_stream("foxglove.ImageAnnotations")
        camera_calibration = fosm._classify_stream(
            "foxglove.CameraCalibration"
        )
        frame_transform = fosm._classify_stream("foxglove.FrameTransform")

        assert compressed_image["kind"] == "image"
        assert compressed_image["compatible_panels"] == ["image"]
        assert pointcloud["kind"] == "3d"
        assert pointcloud["compatible_panels"] == ["3d"]
        assert scene_update["kind"] == "3d"
        assert scene_update["compatible_panels"] == ["3d", "image"]
        assert "sceneupdate" in scene_update["affordances"]
        assert image_annotations["kind"] == "other"
        assert image_annotations["compatible_panels"] == ["image"]
        assert "overlay" in image_annotations["affordances"]
        assert camera_calibration["kind"] == "other"
        assert camera_calibration["compatible_panels"] == ["image"]
        assert "calibration" in camera_calibration["affordances"]
        assert frame_transform["kind"] == "transform"
        assert frame_transform["affordances"] == ["transforms"]

    def test_catalog_reader_supports_foxglove_schemas(self):
        image_schema = _make_foxglove_schema(1, "foxglove.CompressedImage")
        pointcloud_schema = _make_foxglove_schema(2, "foxglove.PointCloud")
        transform_schema = _make_foxglove_schema(3, "foxglove.FrameTransform")
        scene_update_schema = _make_foxglove_schema(4, "foxglove.SceneUpdate")
        image_annotations_schema = _make_foxglove_schema(
            5, "foxglove.ImageAnnotations"
        )
        camera_calibration_schema = _make_foxglove_schema(
            6, "foxglove.CameraCalibration"
        )
        image_channel = _make_channel(1, "/camera/front", 1, "protobuf")
        pointcloud_channel = _make_channel(2, "/lidar/top", 2, "protobuf")
        transform_channel = _make_channel(3, "/tf", 3, "protobuf")
        scene_update_channel = _make_channel(4, "/semantic_map", 4, "protobuf")
        image_annotations_channel = _make_channel(
            5, "/camera/front/annotations", 5, "protobuf"
        )
        camera_calibration_channel = _make_channel(
            6, "/camera/front/camera_info", 6, "protobuf"
        )
        summary = SimpleNamespace(
            channels={
                1: image_channel,
                2: pointcloud_channel,
                3: transform_channel,
                4: scene_update_channel,
                5: image_annotations_channel,
                6: camera_calibration_channel,
            },
            schemas={
                1: image_schema,
                2: pointcloud_schema,
                3: transform_schema,
                4: scene_update_schema,
                5: image_annotations_schema,
                6: camera_calibration_schema,
            },
            statistics=SimpleNamespace(
                channel_message_counts={1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1},
                message_start_time=10,
                message_end_time=50,
            ),
            chunk_indexes=[],
        )
        reader = _FakeReader(
            summary=summary,
            messages=[
                (
                    image_schema,
                    image_channel,
                    _make_message(
                        10,
                        10,
                        _make_foxglove_compressed_image_payload(
                            seconds=11,
                            nanos=12,
                            frame_id="camera",
                        ),
                    ),
                ),
                (
                    pointcloud_schema,
                    pointcloud_channel,
                    _make_message(
                        20,
                        20,
                        _make_foxglove_pointcloud_payload(
                            seconds=21,
                            nanos=22,
                            frame_id="lidar",
                        ),
                    ),
                ),
                (
                    transform_schema,
                    transform_channel,
                    _make_message(
                        30,
                        30,
                        _make_foxglove_frame_transform_payload(
                            seconds=31,
                            nanos=32,
                            parent_frame_id="map",
                            child_frame_id="lidar",
                        ),
                    ),
                ),
                (
                    scene_update_schema,
                    scene_update_channel,
                    _make_message(
                        35,
                        35,
                        _make_foxglove_scene_update_payload(
                            entity_timestamps=[(35, 36), (35, 37)],
                            entity_frame_ids=["map", "base_link"],
                        ),
                    ),
                ),
                (
                    image_annotations_schema,
                    image_annotations_channel,
                    _make_message(
                        40,
                        40,
                        _make_foxglove_image_annotations_payload(
                            circle_timestamp=(41, 42)
                        ),
                    ),
                ),
                (
                    camera_calibration_schema,
                    camera_calibration_channel,
                    _make_message(
                        45,
                        45,
                        _make_foxglove_camera_calibration_payload(
                            seconds=46,
                            nanos=47,
                            frame_id="camera_front",
                        ),
                    ),
                ),
            ],
        )

        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            metadata = fosm._catalog_reader(
                reader=reader,
                scene_id="scene-1",
                media_field="filepath",
                source_path=handle.name,
                codec_registry=fosm._SCHEMA_CODEC_REGISTRY,
            )

        assert metadata.catalog_version == "multimodal-workspace-v4"
        assert [stream.kind for stream in metadata.streams] == [
            "image",
            "3d",
            "transform",
            "3d",
            "other",
            "other",
        ]
        assert metadata.streams[0].frame_id == "camera"
        assert metadata.streams[1].frame_id == "lidar"
        assert metadata.streams[3].frame_id is None
        assert metadata.streams[5].frame_id == "camera_front"
        assert {frame.frame_id for frame in metadata.frames} == {
            "camera",
            "lidar",
            "map",
            "base_link",
            "camera_front",
        }
        assert len(metadata.transforms) == 1
        assert metadata.transforms[0].parent_frame_id == "map"
        assert metadata.transforms[0].child_frame_id == "lidar"

        plan = fosm.DefaultMultimodalRenderingPlanner().build_rendering_plan(
            metadata
        )
        assert [panel.archetype for panel in plan.panels] == ["3d", "image"]
        assert plan.panels[0].visible_stream_ids == [
            "/lidar/top",
            "/semantic_map",
        ]
        assert plan.panels[1].render_stream_id == "/camera/front"
        assert plan.panels[1].visible_stream_ids == [
            "/camera/front/annotations",
            "/camera/front/camera_info",
        ]

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
        assert loaded.rendering_plan.layout_tree == rendering_plan.layout_tree

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

    def test_workspace_service_preserves_cached_rendering_plans(
        self, dataset, sample
    ):
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()
            metadata = _make_camera_rig_metadata(
                handle.name, include_front_support=True
            )
            repository = fosm.SampleMultimodalSceneRepository()
            persisted_rendering_plan = fopr.MultimodalRenderingPlan(
                source_kind=metadata.source_kind,
                media_field=metadata.media_field,
                scene_id=metadata.scene_id,
                sync=fopr.SyncConfig(
                    timestamp_source="header.stamp",
                    fallback="log_time",
                    mode="nearest",
                ),
                panels=[
                    fopr.PanelPlan(
                        panel_id="panel_3d_1",
                        archetype="3d",
                        title="lidar",
                        render_stream_id=None,
                        visible_stream_ids=["/lidar/top"],
                        frame_config=fopr.PanelFrameConfig(
                            fixed_frame_id="lidar_top",
                            display_frame_id="lidar_top",
                        ),
                        scene_config=fopr.PanelSceneConfig(
                            up_axis="z",
                            background_color="#10151d",
                            show_grid=True,
                        ),
                    ),
                    fopr.PanelPlan(
                        panel_id="image_panel_1",
                        archetype="image",
                        title="camera",
                        render_stream_id="/camera/front",
                        visible_stream_ids=[
                            "/camera/front/annotations",
                            "/camera/front/camera_info",
                        ],
                        frame_config=fopr.PanelFrameConfig(),
                        scene_config=fopr.PanelSceneConfig(),
                    ),
                    fopr.PanelPlan(
                        panel_id="image_panel_2",
                        archetype="image",
                        title="camera 2",
                        render_stream_id="/camera/left",
                        visible_stream_ids=[],
                        frame_config=fopr.PanelFrameConfig(),
                        scene_config=fopr.PanelSceneConfig(),
                    ),
                    fopr.PanelPlan(
                        panel_id="image_panel_3",
                        archetype="image",
                        title="camera 3",
                        render_stream_id="/camera/right",
                        visible_stream_ids=[],
                        frame_config=fopr.PanelFrameConfig(),
                        scene_config=fopr.PanelSceneConfig(),
                    ),
                    fopr.PanelPlan(
                        panel_id="image_panel_4",
                        archetype="image",
                        title="camera 4",
                        render_stream_id="/camera/rear",
                        visible_stream_ids=[],
                        frame_config=fopr.PanelFrameConfig(),
                        scene_config=fopr.PanelSceneConfig(),
                    ),
                ],
                sidebar_width=208,
                layout_tree=fosm._build_default_layout_tree(
                    [
                        "panel_3d_1",
                        "image_panel_1",
                        "image_panel_2",
                        "image_panel_3",
                        "image_panel_4",
                    ]
                ),
            )
            repository.save(
                dataset, sample, metadata, persisted_rendering_plan
            )
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

        assert adapter.catalog_calls == 0
        assert [panel.panel_id for panel in state.rendering_plan.panels] == [
            "panel_3d_1",
            "image_panel_1",
            "image_panel_2",
            "image_panel_3",
            "image_panel_4",
        ]

    def test_workspace_service_overwrite_rebuilds_cached_rendering_plans(
        self, dataset, sample
    ):
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()
            metadata = _make_camera_rig_metadata(
                handle.name, include_front_support=True
            )
            repository = fosm.SampleMultimodalSceneRepository()
            legacy_rendering_plan = fopr.MultimodalRenderingPlan(
                source_kind=metadata.source_kind,
                media_field=metadata.media_field,
                scene_id=metadata.scene_id,
                sync=fopr.SyncConfig(
                    timestamp_source="header.stamp",
                    fallback="log_time",
                    mode="nearest",
                ),
                panels=[
                    fopr.PanelPlan(
                        panel_id="panel_3d_1",
                        archetype="3d",
                        title="lidar",
                        render_stream_id=None,
                        visible_stream_ids=["/lidar/top"],
                        frame_config=fopr.PanelFrameConfig(
                            fixed_frame_id="lidar_top",
                            display_frame_id="lidar_top",
                        ),
                        scene_config=fopr.PanelSceneConfig(
                            up_axis="z",
                            background_color="#10151d",
                            show_grid=True,
                        ),
                    ),
                    fopr.PanelPlan(
                        panel_id="image_panel_1",
                        archetype="image",
                        title="camera",
                        render_stream_id="/camera/front",
                        visible_stream_ids=[],
                        frame_config=fopr.PanelFrameConfig(),
                        scene_config=fopr.PanelSceneConfig(),
                    ),
                    fopr.PanelPlan(
                        panel_id="image_panel_2",
                        archetype="image",
                        title="camera 2",
                        render_stream_id="/camera/left",
                        visible_stream_ids=[],
                        frame_config=fopr.PanelFrameConfig(),
                        scene_config=fopr.PanelSceneConfig(),
                    ),
                    fopr.PanelPlan(
                        panel_id="image_panel_3",
                        archetype="image",
                        title="camera 3",
                        render_stream_id="/camera/right",
                        visible_stream_ids=[],
                        frame_config=fopr.PanelFrameConfig(),
                        scene_config=fopr.PanelSceneConfig(),
                    ),
                    fopr.PanelPlan(
                        panel_id="image_panel_4",
                        archetype="image",
                        title="camera 4",
                        render_stream_id="/camera/rear",
                        visible_stream_ids=[],
                        frame_config=fopr.PanelFrameConfig(),
                        scene_config=fopr.PanelSceneConfig(),
                    ),
                ],
                sidebar_width=208,
                layout_tree=fosm._build_default_layout_tree(
                    [
                        "panel_3d_1",
                        "image_panel_1",
                        "image_panel_2",
                        "image_panel_3",
                        "image_panel_4",
                    ]
                ),
            )
            repository.save(dataset, sample, metadata, legacy_rendering_plan)
            adapter = _FakeAdapter(
                metadata=metadata,
                fingerprint=metadata.source_fingerprint,
            )
            service = fosm.MultimodalWorkspaceService(
                adapter=adapter,
                planner=fosm.DefaultMultimodalRenderingPlanner(),
                repository=repository,
            )

            state = service.ingest_workspace(
                dataset=dataset,
                sample=sample,
                media_field="filepath",
                overwrite=True,
            )

        assert adapter.catalog_calls == 1
        assert [panel.panel_id for panel in state.rendering_plan.panels] == [
            "panel_3d_1",
            "image_panel_1",
            "image_panel_2",
            "image_panel_3",
        ]

    def test_workspace_service_updates_rendering_plan(self, dataset, sample):
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()
            metadata = _make_metadata(handle.name)
            adapter = _FakeAdapter(
                metadata=metadata,
                fingerprint=metadata.source_fingerprint,
            )
            service = fosm.MultimodalWorkspaceService(
                adapter=adapter,
                planner=fosm.DefaultMultimodalRenderingPlanner(),
                repository=fosm.SampleMultimodalSceneRepository(),
            )

            current_state = service.get_workspace(dataset, sample, "filepath")
            rendering_plan = fosm._serialize_rendering_plan(
                current_state.rendering_plan
            )
            rendering_plan["layoutTree"] = _split(
                "row",
                50,
                _leaf("image_panel_1"),
                _leaf("panel_3d_1"),
            )
            rendering_plan["sidebarWidth"] = 312
            rendering_plan["panels"][0]["title"] = "Primary 3D"

            updated_state = service.update_workspace(
                dataset=dataset,
                sample=sample,
                rendering_plan=rendering_plan,
            )

        assert adapter.catalog_calls == 1
        assert updated_state.rendering_plan.layout_tree == _split(
            "row",
            50,
            _leaf("image_panel_1"),
            _leaf("panel_3d_1"),
        )
        assert updated_state.rendering_plan.sidebar_width == 312
        assert updated_state.rendering_plan.panels[0].title == "Primary 3D"

    def test_workspace_service_rejects_invalid_sidebar_width(
        self, dataset, sample
    ):
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()
            metadata = _make_metadata(handle.name)
            adapter = _FakeAdapter(
                metadata=metadata,
                fingerprint=metadata.source_fingerprint,
            )
            service = fosm.MultimodalWorkspaceService(
                adapter=adapter,
                planner=fosm.DefaultMultimodalRenderingPlanner(),
                repository=fosm.SampleMultimodalSceneRepository(),
            )

            current_state = service.get_workspace(dataset, sample, "filepath")
            rendering_plan = fosm._serialize_rendering_plan(
                current_state.rendering_plan
            )
            rendering_plan["sidebarWidth"] = 600

            with pytest.raises(fosm.MultimodalRouteError) as error_info:
                service.update_workspace(
                    dataset=dataset,
                    sample=sample,
                    rendering_plan=rendering_plan,
                )

        assert error_info.value.status_code == 400
        assert "sidebarWidth must be between 176 and 420" in (
            error_info.value.detail
        )

    @pytest.mark.parametrize(
        ("layout_tree", "expected_detail"),
        [
            (
                _split(
                    "row",
                    50,
                    _leaf("panel_3d_1"),
                    _leaf("panel_3d_1"),
                ),
                "duplicate panel ids",
            ),
            (
                _split(
                    "row",
                    50,
                    _leaf("panel_3d_1"),
                    _leaf("missing_panel"),
                ),
                "unknown panel ids",
            ),
            (_leaf("panel_3d_1"), "missing panel ids"),
        ],
    )
    def test_workspace_service_rejects_invalid_layout_tree(
        self, dataset, sample, layout_tree, expected_detail
    ):
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()
            metadata = _make_metadata(handle.name)
            adapter = _FakeAdapter(
                metadata=metadata,
                fingerprint=metadata.source_fingerprint,
            )
            service = fosm.MultimodalWorkspaceService(
                adapter=adapter,
                planner=fosm.DefaultMultimodalRenderingPlanner(),
                repository=fosm.SampleMultimodalSceneRepository(),
            )

            current_state = service.get_workspace(dataset, sample, "filepath")
            rendering_plan = fosm._serialize_rendering_plan(
                current_state.rendering_plan
            )
            rendering_plan["layoutTree"] = layout_tree

            with pytest.raises(fosm.MultimodalRouteError) as error_info:
                service.update_workspace(
                    dataset=dataset,
                    sample=sample,
                    rendering_plan=rendering_plan,
                )

        assert error_info.value.status_code == 400
        assert expected_detail in error_info.value.detail

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
                            "payload_bytes": b"\x01\x02\x03",
                        }
                    ]
                },
            )
            service = fosm.MultimodalWorkspaceService(
                adapter=adapter,
                planner=fosm.DefaultMultimodalRenderingPlanner(),
                repository=fosm.SampleMultimodalSceneRepository(),
            )

            response = service.read_stream_window_binary(
                dataset=dataset,
                sample=sample,
                media_field="filepath",
                stream_ids=["/camera/front"],
                start_time_ns=10,
                end_time_ns=20,
            )

        assert adapter.catalog_calls == 1
        manifest, payload_bytes = _decode_binary_window_response(response)
        assert manifest["streams"][0]["streamId"] == "/camera/front"
        assert manifest["streams"][0]["messages"][0]["syncTimestampNs"] == 0
        assert payload_bytes == b"\x01\x02\x03"

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
                            "payload_bytes": b"\x01\x02\x03",
                        }
                    ],
                    "/tf": [
                        {
                            "message_id": "tf-1",
                            "sync_timestamp_ns": 11,
                            "log_time_ns": 11,
                            "publish_time_ns": 11,
                            "payload_bytes": b"\x04\x05\x06",
                        }
                    ],
                },
            )
            service = fosm.MultimodalWorkspaceService(
                adapter=adapter,
                planner=fosm.DefaultMultimodalRenderingPlanner(),
                repository=fosm.SampleMultimodalSceneRepository(),
            )

            response = service.read_bootstrap_window_binary(
                dataset=dataset,
                sample=sample,
                media_field="filepath",
                anchor_time_ns=0,
                render_stream_ids=["/lidar/top"],
                transform_stream_ids=["/tf"],
                location_stream_ids=[],
                transform_window_ns=100,
            )

        manifest, payload_bytes = _decode_binary_window_response(response)
        assert manifest["window"] == {"startTimeNs": 0, "endTimeNs": 100}
        assert [stream["streamId"] for stream in manifest["streams"]] == [
            "/lidar/top",
            "/tf",
        ]
        assert manifest["streams"][0]["messages"][0]["syncTimestampNs"] == 0
        assert payload_bytes == b"\x01\x02\x03\x04\x05\x06"

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

    def test_workspace_service_reingests_outdated_persisted_workspace_state(
        self, dataset, sample
    ):
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()

            persisted_metadata = _make_metadata(handle.name)
            persisted_metadata.catalog_version = "multimodal-workspace-v1"
            persisted_rendering_plan = (
                fosm.DefaultMultimodalRenderingPlanner().build_rendering_plan(
                    persisted_metadata
                )
            )
            repository = fosm.SampleMultimodalSceneRepository()
            repository.save(
                dataset,
                sample,
                persisted_metadata,
                persisted_rendering_plan,
            )

            adapter = _FakeAdapter(
                metadata=_make_metadata(handle.name),
                fingerprint=persisted_metadata.source_fingerprint,
            )
            service = fosm.MultimodalWorkspaceService(
                adapter=adapter,
                planner=fosm.DefaultMultimodalRenderingPlanner(),
                repository=repository,
            )

            state = service.get_workspace(dataset, dataset.first(), "filepath")

        assert adapter.catalog_calls == 1
        assert state.metadata.catalog_version == "multimodal-workspace-v4"
        assert state.rendering_plan.panels[0].archetype == "3d"

    def test_workspace_service_reingests_persisted_workspace_without_layout_tree(
        self, dataset, sample
    ):
        with tempfile.NamedTemporaryFile(suffix=".mcap") as handle:
            sample["filepath"] = handle.name
            sample.save()

            persisted_metadata = _make_metadata(handle.name)
            persisted_rendering_plan = (
                fosm.DefaultMultimodalRenderingPlanner().build_rendering_plan(
                    persisted_metadata
                )
            )
            persisted_rendering_plan.layout_tree = None
            repository = fosm.SampleMultimodalSceneRepository()
            repository.save(
                dataset,
                sample,
                persisted_metadata,
                persisted_rendering_plan,
            )

            adapter = _FakeAdapter(
                metadata=_make_metadata(handle.name),
                fingerprint=persisted_metadata.source_fingerprint,
            )
            service = fosm.MultimodalWorkspaceService(
                adapter=adapter,
                planner=fosm.DefaultMultimodalRenderingPlanner(),
                repository=repository,
            )

            state = service.get_workspace(dataset, dataset.first(), "filepath")

        assert adapter.catalog_calls == 1
        assert state.metadata.catalog_version == "multimodal-workspace-v4"
        assert state.rendering_plan.layout_tree is not None

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
                time_range=fom.MultimodalTimeRange(
                    start_ns=1_000, end_ns=2_000
                ),
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
                catalog_version="multimodal-workspace-v4",
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
                            "payload_bytes": b"\x01\x02\x03",
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
            window = service.read_stream_window_binary(
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

        window_manifest, payload_bytes = _decode_binary_window_response(window)

        assert workspace.metadata.time_range.start_ns == 1_000
        assert window_manifest["window"] == {
            "startTimeNs": 0,
            "endTimeNs": 200,
        }
        assert (
            window_manifest["streams"][0]["messages"][0]["syncTimestampNs"]
            == 100
        )
        assert window_manifest["streams"][0]["messages"][0]["logTimeNs"] == 100
        assert (
            window_manifest["streams"][0]["messages"][0]["publishTimeNs"]
            == 150
        )
        assert payload_bytes == b"\x01\x02\x03"
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

    def test_resolve_message_sync_timestamp_supports_foxglove_schemas(self):
        schema = _make_foxglove_schema(1, "foxglove.CompressedImage")
        payload = _make_foxglove_compressed_image_payload(
            seconds=123,
            nanos=456,
            frame_id="camera",
        )

        assert (
            fosm._resolve_message_sync_timestamp_ns(
                schema_name=schema.name,
                schema=schema,
                payload=payload,
                log_time_ns=500,
                publish_time_ns=450,
                timestamp_source="header.stamp",
                fallback="log_time",
                codec_registry=fosm._SCHEMA_CODEC_REGISTRY,
            )
            == 123_000_000_456
        )

    def test_resolve_message_sync_timestamp_supports_image_annotations(self):
        schema = _make_foxglove_schema(1, "foxglove.ImageAnnotations")

        assert (
            fosm._resolve_message_sync_timestamp_ns(
                schema_name=schema.name,
                schema=schema,
                payload=_make_foxglove_image_annotations_payload(
                    root_timestamp=(10, 11),
                    circle_timestamp=(20, 21),
                ),
                log_time_ns=500,
                publish_time_ns=450,
                timestamp_source="header.stamp",
                fallback="log_time",
                codec_registry=fosm._SCHEMA_CODEC_REGISTRY,
            )
            == 10_000_000_011
        )

        assert (
            fosm._resolve_message_sync_timestamp_ns(
                schema_name=schema.name,
                schema=schema,
                payload=_make_foxglove_image_annotations_payload(
                    circle_timestamp=(20, 21)
                ),
                log_time_ns=500,
                publish_time_ns=450,
                timestamp_source="header.stamp",
                fallback="log_time",
                codec_registry=fosm._SCHEMA_CODEC_REGISTRY,
            )
            == 20_000_000_021
        )

    def test_resolve_message_sync_timestamp_supports_scene_update(self):
        schema = _make_foxglove_schema(1, "foxglove.SceneUpdate")

        assert (
            fosm._resolve_message_sync_timestamp_ns(
                schema_name=schema.name,
                schema=schema,
                payload=_make_foxglove_scene_update_payload(
                    entity_timestamps=[(30, 31)],
                    entity_frame_ids=["map"],
                ),
                log_time_ns=500,
                publish_time_ns=450,
                timestamp_source="header.stamp",
                fallback="log_time",
                codec_registry=fosm._SCHEMA_CODEC_REGISTRY,
            )
            == 30_000_000_031
        )

        assert (
            fosm._resolve_message_sync_timestamp_ns(
                schema_name=schema.name,
                schema=schema,
                payload=_make_foxglove_scene_update_payload(
                    deletion_timestamps=[(40, 41)]
                ),
                log_time_ns=500,
                publish_time_ns=450,
                timestamp_source="header.stamp",
                fallback="log_time",
                codec_registry=fosm._SCHEMA_CODEC_REGISTRY,
            )
            == 40_000_000_041
        )
