"""
Schema-aware multimodal stream codecs.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from abc import ABC, abstractmethod

from fiftyone.server.mcap_cdr import (
    decode_catalog_details,
    decode_sync_timestamp_ns,
)
from fiftyone.server.mcap_foxglove import (
    decode_catalog_details as decode_foxglove_catalog_details,
)
from fiftyone.server.mcap_foxglove import (
    decode_sync_timestamp_ns as decode_foxglove_sync_timestamp_ns,
)
from fiftyone.server.multimodal_common import DEFAULT_STREAM


def _get_schema_name(schema):
    if isinstance(schema, str):
        return schema

    return getattr(schema, "name", None)


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
            return dict(DEFAULT_STREAM)

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
