"""
Minimal ROS2 CDR decoders for MCAP ingest inventory.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import struct


class McapCdrDecodeError(ValueError):
    """Raised when a ROS2 CDR payload cannot be decoded."""


class _CdrReader:
    def __init__(self, payload):
        if len(payload) < 4:
            raise McapCdrDecodeError("ROS2 CDR payload is too small")

        self._payload = memoryview(payload)
        self._little_endian = self._payload[1] == 1
        self._offset = 4

    def _align(self, size):
        remainder = self._offset % size
        if remainder:
            self._offset += size - remainder

    def _unpack(self, format_char, size):
        self._align(size)
        if self._offset + size > len(self._payload):
            raise McapCdrDecodeError("Unexpected end of ROS2 CDR payload")

        format_prefix = "<" if self._little_endian else ">"
        value = struct.unpack_from(
            format_prefix + format_char,
            self._payload,
            self._offset,
        )[0]
        self._offset += size
        return value

    def read_int32(self):
        return self._unpack("i", 4)

    def read_uint32(self):
        return self._unpack("I", 4)

    def read_uint16(self):
        return self._unpack("H", 2)

    def read_int8(self):
        return self._unpack("b", 1)

    def read_uint8(self):
        return self._unpack("B", 1)

    def read_float64(self):
        return self._unpack("d", 8)

    def read_float32(self):
        return self._unpack("f", 4)

    def read_boolean(self):
        return bool(self.read_uint8())

    def read_string(self):
        length = self.read_uint32()
        if length == 0:
            return ""

        if self._offset + length > len(self._payload):
            raise McapCdrDecodeError("Invalid ROS2 CDR string length")

        value = self._payload[self._offset : self._offset + length - 1]
        self._offset += length
        return value.tobytes().decode("utf-8", errors="replace")

    def skip_bytes(self, count):
        if count < 0 or self._offset + count > len(self._payload):
            raise McapCdrDecodeError("Invalid ROS2 CDR byte skip")

        self._offset += count


def _to_timestamp_ns(sec, nanosec):
    return int(sec) * 1_000_000_000 + int(nanosec)


def _parse_header(reader):
    sec = reader.read_int32()
    nanosec = reader.read_uint32()
    frame_id = reader.read_string()
    return sec, nanosec, frame_id


def _parse_vector3(reader):
    return (
        reader.read_float64(),
        reader.read_float64(),
        reader.read_float64(),
    )


def _parse_quaternion(reader):
    return (
        reader.read_float64(),
        reader.read_float64(),
        reader.read_float64(),
        reader.read_float64(),
    )


def _skip_color_rgba(reader):
    reader.read_float32()
    reader.read_float32()
    reader.read_float32()
    reader.read_float32()


def _skip_duration(reader):
    reader.read_int32()
    reader.read_uint32()


def _skip_pose(reader):
    _parse_vector3(reader)
    _parse_quaternion(reader)


def _skip_covariance(reader):
    for _index in range(36):
        reader.read_float64()


def _decode_header_frame_id(payload):
    _sec, _nanosec, frame_id = _parse_header(_CdrReader(payload))
    return frame_id


def _decode_header_timestamp_ns(payload):
    sec, nanosec, _frame_id = _parse_header(_CdrReader(payload))
    return _to_timestamp_ns(sec, nanosec)


def _decode_odometry_frames(payload):
    reader = _CdrReader(payload)
    _sec, _nanosec, header_frame_id = _parse_header(reader)
    child_frame_id = reader.read_string()
    return header_frame_id, child_frame_id


def _decode_tf_edges(payload):
    reader = _CdrReader(payload)
    edge_count = reader.read_uint32()
    edges = []
    for _index in range(edge_count):
        _sec, _nanosec, parent_frame_id = _parse_header(reader)
        child_frame_id = reader.read_string()
        _parse_vector3(reader)
        _parse_quaternion(reader)
        edges.append((parent_frame_id, child_frame_id))

    return edges


def _decode_tf_timestamp_ns(payload):
    reader = _CdrReader(payload)
    edge_count = reader.read_uint32()
    timestamps_ns = []
    for _index in range(edge_count):
        sec, nanosec, _parent_frame_id = _parse_header(reader)
        reader.read_string()
        _parse_vector3(reader)
        _parse_quaternion(reader)
        timestamps_ns.append(_to_timestamp_ns(sec, nanosec))

    if not timestamps_ns:
        return None

    return min(timestamps_ns)


def _decode_marker_array_headers(payload):
    reader = _CdrReader(payload)
    marker_count = reader.read_uint32()
    frame_ids = []
    timestamps_ns = []

    for _index in range(marker_count):
        sec, nanosec, frame_id = _parse_header(reader)
        timestamps_ns.append(_to_timestamp_ns(sec, nanosec))
        frame_ids.append(frame_id)

        reader.read_string()  # namespace
        reader.read_int32()  # marker id
        reader.read_int32()  # type
        reader.read_int32()  # action
        _skip_pose(reader)
        _parse_vector3(reader)  # scale
        _skip_color_rgba(reader)
        _skip_duration(reader)
        reader.read_boolean()  # frame_locked

        point_count = reader.read_uint32()
        for _point_index in range(point_count):
            _parse_vector3(reader)

        color_count = reader.read_uint32()
        for _color_index in range(color_count):
            _skip_color_rgba(reader)

        reader.read_string()  # text
        reader.read_string()  # mesh_resource
        reader.read_boolean()  # mesh_use_embedded_materials

    unique_frame_ids = []
    for frame_id in frame_ids:
        if frame_id and frame_id not in unique_frame_ids:
            unique_frame_ids.append(frame_id)

    return unique_frame_ids, timestamps_ns


def decode_sync_timestamp_ns(schema_name, payload):
    """Decodes the best-effort sensor timestamp for the given message payload."""

    if schema_name in (
        "sensor_msgs/msg/CompressedImage",
        "sensor_msgs/msg/PointCloud2",
        "sensor_msgs/msg/LaserScan",
        "geometry_msgs/msg/PoseStamped",
        "geometry_msgs/msg/PoseWithCovarianceStamped",
        "sensor_msgs/msg/NavSatFix",
        "nav_msgs/msg/Odometry",
    ):
        return _decode_header_timestamp_ns(payload)

    if schema_name == "tf2_msgs/msg/TFMessage":
        return _decode_tf_timestamp_ns(payload)

    if schema_name == "visualization_msgs/msg/MarkerArray":
        _frame_ids, timestamps_ns = _decode_marker_array_headers(payload)
        if not timestamps_ns:
            return None

        return min(timestamps_ns)

    return None


def decode_catalog_details(schema_name, payload):
    """Decodes inventory details for the requested ROS2 message schema.

    Args:
        schema_name: the ROS2 schema name
        payload: the raw MCAP message payload bytes

    Returns:
        a dict with zero or more of:
        ``frame_id``, ``child_frame_id``, ``transform_edges``
    """

    if schema_name in (
        "sensor_msgs/msg/CompressedImage",
        "sensor_msgs/msg/PointCloud2",
        "sensor_msgs/msg/LaserScan",
        "geometry_msgs/msg/PoseStamped",
        "geometry_msgs/msg/PoseWithCovarianceStamped",
        "sensor_msgs/msg/NavSatFix",
    ):
        return {"frame_id": _decode_header_frame_id(payload)}

    if schema_name == "nav_msgs/msg/Odometry":
        frame_id, child_frame_id = _decode_odometry_frames(payload)
        return {
            "frame_id": frame_id,
            "child_frame_id": child_frame_id,
        }

    if schema_name == "tf2_msgs/msg/TFMessage":
        return {"transform_edges": _decode_tf_edges(payload)}

    if schema_name == "visualization_msgs/msg/MarkerArray":
        frame_ids, _timestamps_ns = _decode_marker_array_headers(payload)
        details = {"frame_ids": frame_ids}
        if len(frame_ids) == 1:
            details["frame_id"] = frame_ids[0]

        return details

    return {}
