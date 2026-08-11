import { parse as parseRosMessageDefinition } from "@foxglove/rosmsg";
import { parseRos2idl } from "@foxglove/ros2idl-parser";
import { MessageWriter as Ros1MessageWriter } from "@foxglove/rosmsg-serialization";
import { MessageWriter as Ros2MessageWriter } from "@foxglove/rosmsg2-serialization";
import { expect } from "vitest";
import type { Decoder } from "../../../decoders/index";
import {
  VISUALIZATION_KIND,
  type DecodedOutput,
  type PayloadDescriptor,
} from "../../../ir/index";
import type { StreamInventory } from "../../../schemas/v1/index";
import { poseRecord, vectorRecord } from "./ros.test-fixtures";

export {
  detection2DRecord,
  detection3DRecord,
  poseRecord,
  vectorRecord,
} from "./ros.test-fixtures";

export const TEXT_ENCODER = new TextEncoder();
export const H264_KEYFRAME_BYTES = Uint8Array.of(
  0,
  0,
  0,
  1,
  0x67,
  0x4d,
  0x00,
  0x1f,
  0,
  0,
  1,
  0x68,
  0xce,
  0,
  0,
  1,
  0x65,
  0xb0,
);

export const ROS2_HEADER_DEFINITIONS = `===
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
===
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;

export const ROS1_POINT_CLOUD2_SCHEMA = `std_msgs/Header header
uint32 height
uint32 width
sensor_msgs/PointField[] fields
bool is_bigendian
uint32 point_step
uint32 row_step
uint8[] data
bool is_dense
===
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id
===
MSG: sensor_msgs/PointField
uint8 INT8=1
uint8 UINT8=2
uint8 INT16=3
uint8 UINT16=4
uint8 INT32=5
uint8 UINT32=6
uint8 FLOAT32=7
uint8 FLOAT64=8
string name
uint32 offset
uint8 datatype
uint32 count`;

export const ROS2_CAMERA_INFO_SCHEMA = `std_msgs/Header header
uint32 height
uint32 width
string distortion_model
float64[] d
float64[9] k
float64[9] r
float64[12] p
uint32 binning_x
uint32 binning_y
sensor_msgs/RegionOfInterest roi
${ROS2_HEADER_DEFINITIONS}
===
MSG: sensor_msgs/RegionOfInterest
uint32 x_offset
uint32 y_offset
uint32 height
uint32 width
bool do_rectify`;

export const ROS2_LASER_SCAN_SCHEMA = `std_msgs/Header header
float32 angle_min
float32 angle_max
float32 angle_increment
float32 time_increment
float32 scan_time
float32 range_min
float32 range_max
float32[] ranges
float32[] intensities
${ROS2_HEADER_DEFINITIONS}`;

export const ROS2_POSE_STAMPED_SCHEMA = `std_msgs/Header header
geometry_msgs/Pose pose
${ROS2_HEADER_DEFINITIONS}
===
MSG: geometry_msgs/Pose
geometry_msgs/Point position
geometry_msgs/Quaternion orientation
===
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z
===
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`;

export const ROS2_PATH_SCHEMA = `std_msgs/Header header
geometry_msgs/PoseStamped[] poses
${ROS2_HEADER_DEFINITIONS}
===
MSG: geometry_msgs/PoseStamped
std_msgs/Header header
geometry_msgs/Pose pose
===
MSG: geometry_msgs/Pose
geometry_msgs/Point position
geometry_msgs/Quaternion orientation
===
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z
===
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`;

export const ROS2_POSE_ARRAY_SCHEMA = `std_msgs/Header header
geometry_msgs/Pose[] poses
${ROS2_HEADER_DEFINITIONS}
===
MSG: geometry_msgs/Pose
geometry_msgs/Point position
geometry_msgs/Quaternion orientation
===
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z
===
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`;

export const ROS2_DETECTION_2D_ARRAY_SCHEMA = `std_msgs/Header header
vision_msgs/Detection2D[] detections
${ROS2_HEADER_DEFINITIONS}
===
MSG: vision_msgs/Detection2D
vision_msgs/ObjectHypothesisWithPose[] results
vision_msgs/BoundingBox2D bbox
string id
===
MSG: vision_msgs/ObjectHypothesisWithPose
vision_msgs/ObjectHypothesis hypothesis
===
MSG: vision_msgs/ObjectHypothesis
string class_id
float64 score
===
MSG: vision_msgs/BoundingBox2D
vision_msgs/Pose2D center
float64 size_x
float64 size_y
===
MSG: vision_msgs/Pose2D
vision_msgs/Point2D position
float64 theta
===
MSG: vision_msgs/Point2D
float64 x
float64 y`;

export const ROS2_DETECTION_3D_ARRAY_SCHEMA = `std_msgs/Header header
vision_msgs/Detection3D[] detections
${ROS2_HEADER_DEFINITIONS}
===
MSG: vision_msgs/Detection3D
vision_msgs/ObjectHypothesisWithPose[] results
vision_msgs/BoundingBox3D bbox
string id
===
MSG: vision_msgs/ObjectHypothesisWithPose
vision_msgs/ObjectHypothesis hypothesis
===
MSG: vision_msgs/ObjectHypothesis
string class_id
float64 score
===
MSG: vision_msgs/BoundingBox3D
geometry_msgs/Pose center
geometry_msgs/Vector3 size
===
MSG: geometry_msgs/Pose
geometry_msgs/Point position
geometry_msgs/Quaternion orientation
===
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z
===
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z
===
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`;

export const ROS1_LOG_SCHEMA = `std_msgs/Header header
byte level
string name
string msg
string file
string function
uint32 line
string[] topics
===
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id`;

export const ROS2_RCL_LOG_SCHEMA = `builtin_interfaces/Time stamp
uint8 level
string name
string msg
string file
string function
uint32 line
${ROS2_HEADER_DEFINITIONS}`;

export const ROS2_DIAGNOSTIC_ARRAY_SCHEMA = `std_msgs/Header header
diagnostic_msgs/DiagnosticStatus[] status
${ROS2_HEADER_DEFINITIONS}
===
MSG: diagnostic_msgs/DiagnosticStatus
byte OK=0
byte WARN=1
byte ERROR=2
byte STALE=3
byte level
string name
string message
string hardware_id
diagnostic_msgs/KeyValue[] values
===
MSG: diagnostic_msgs/KeyValue
string key
string value`;

export const ROS2_ODOMETRY_SCHEMA = `std_msgs/Header header
string child_frame_id
geometry_msgs/PoseWithCovariance pose
geometry_msgs/TwistWithCovariance twist
${ROS2_HEADER_DEFINITIONS}
===
MSG: geometry_msgs/PoseWithCovariance
geometry_msgs/Pose pose
float64[36] covariance
===
MSG: geometry_msgs/TwistWithCovariance
geometry_msgs/Twist twist
float64[36] covariance
===
MSG: geometry_msgs/Pose
geometry_msgs/Point position
geometry_msgs/Quaternion orientation
===
MSG: geometry_msgs/Twist
geometry_msgs/Vector3 linear
geometry_msgs/Vector3 angular
===
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z
===
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z
===
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`;

export const ROS2_MARKER_ARRAY_SCHEMA = `visualization_msgs/Marker[] markers
===
MSG: visualization_msgs/Marker
std_msgs/Header header
string ns
int32 id
int32 type
int32 action
geometry_msgs/Pose pose
geometry_msgs/Vector3 scale
std_msgs/ColorRGBA color
builtin_interfaces/Duration lifetime
bool frame_locked
geometry_msgs/Point[] points
std_msgs/ColorRGBA[] colors
string text
string mesh_resource
bool mesh_use_embedded_materials
${ROS2_HEADER_DEFINITIONS}
===
MSG: geometry_msgs/Pose
geometry_msgs/Point position
geometry_msgs/Quaternion orientation
===
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z
===
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z
===
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w
===
MSG: std_msgs/ColorRGBA
float32 r
float32 g
float32 b
float32 a`;

export const ROS1_NAV_SAT_FIX_SCHEMA = `std_msgs/Header header
sensor_msgs/NavSatStatus status
float64 latitude
float64 longitude
float64 altitude
float64[9] position_covariance
uint8 position_covariance_type
===
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id
===
MSG: sensor_msgs/NavSatStatus
int8 STATUS_NO_FIX=-1
int8 STATUS_FIX=0
int8 STATUS_SBAS_FIX=1
int8 STATUS_GBAS_FIX=2
uint16 SERVICE_GPS=1
uint16 SERVICE_GLONASS=2
uint16 SERVICE_COMPASS=4
uint16 SERVICE_GALILEO=8
int8 status
uint16 service`;

export const ROS1_OCCUPANCY_GRID_SCHEMA = `std_msgs/Header header
nav_msgs/MapMetaData info
int8[] data
===
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id
===
MSG: nav_msgs/MapMetaData
time map_load_time
float32 resolution
uint32 width
uint32 height
geometry_msgs/Pose origin
===
MSG: geometry_msgs/Pose
geometry_msgs/Point position
geometry_msgs/Quaternion orientation
===
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z
===
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`;

export const ROS2_IDL_COMPRESSED_IMAGE_SCHEMA = `module sensor_msgs {
  module msg {
    struct CompressedImage {
      std_msgs::msg::Header header;
      string format;
      sequence<octet> data;
    };
  };
};
module std_msgs {
  module msg {
    struct Header {
      builtin_interfaces::msg::Time stamp;
      string frame_id;
    };
  };
};
module builtin_interfaces {
  module msg {
    struct Time {
      long sec;
      unsigned long nanosec;
    };
  };
};`;

export const ROS2_COMPRESSED_IMAGE_SCHEMA = `std_msgs/Header header
string format
uint8[] data
${ROS2_HEADER_DEFINITIONS}`;

export const ROS1_IMAGE_SCHEMA = `std_msgs/Header header
uint32 height
uint32 width
string encoding
uint8 is_bigendian
uint32 step
uint8[] data
===
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id`;

export const ROS2_IMAGE_SCHEMA = `std_msgs/Header header
uint32 height
uint32 width
string encoding
uint8 is_bigendian
uint32 step
uint8[] data
${ROS2_HEADER_DEFINITIONS}`;

export const ROS2_IDL_IMAGE_SCHEMA = `module sensor_msgs {
  module msg {
    struct Image {
      std_msgs::msg::Header header;
      unsigned long height;
      unsigned long width;
      string encoding;
      octet is_bigendian;
      unsigned long step;
      sequence<octet> data;
    };
  };
};
module std_msgs {
  module msg {
    struct Header {
      builtin_interfaces::msg::Time stamp;
      string frame_id;
    };
  };
};
module builtin_interfaces {
  module msg {
    struct Time {
      long sec;
      unsigned long nanosec;
    };
  };
};`;

export function decoderForSchemaEncoding(
  decoders: readonly Decoder[],
  schemaEncoding: string,
): Decoder {
  const decoder = decoders.find(
    (candidate) => candidate.payload.schemaEncoding === schemaEncoding,
  );
  if (!decoder) {
    throw new Error(`Missing decoder for ${schemaEncoding}`);
  }

  return decoder;
}

export function schemaData(schema: string): Uint8Array {
  return new Uint8Array(TEXT_ENCODER.encode(schema));
}

export function ros1Message(
  schema: string,
  record: Record<string, unknown>,
): Uint8Array {
  const writer = new Ros1MessageWriter(parseRosMessageDefinition(schema));
  return writer.writeMessage(record);
}

export function ros2Message(
  schema: string,
  record: Record<string, unknown>,
): Uint8Array {
  const writer = new Ros2MessageWriter(
    parseRosMessageDefinition(schema, { ros2: true }),
  );
  return writer.writeMessage(record);
}

export function ros2IdlMessage(
  schema: string,
  record: Record<string, unknown>,
): Uint8Array {
  const writer = new Ros2MessageWriter(parseRos2idl(schema));
  return writer.writeMessage(record);
}

export function ros1ImageMessage({
  data,
  encoding,
  height,
  isBigEndian = false,
  step,
  width,
}: {
  readonly data: readonly number[];
  readonly encoding: string;
  readonly height: number;
  readonly isBigEndian?: boolean;
  readonly step: number;
  readonly width: number;
}): Uint8Array {
  return ros1Message(ROS1_IMAGE_SCHEMA, {
    data,
    encoding,
    header: ros1Header({ frameId: "camera", nsec: 2, sec: 1, seq: 9 }),
    height,
    is_bigendian: isBigEndian ? 1 : 0,
    step,
    width,
  });
}

export function ros2ImageMessage({
  data,
  encoding,
  height,
  isBigEndian = false,
  step,
  width,
}: {
  readonly data: readonly number[];
  readonly encoding: string;
  readonly height: number;
  readonly isBigEndian?: boolean;
  readonly step: number;
  readonly width: number;
}): Uint8Array {
  return ros2Message(ROS2_IMAGE_SCHEMA, {
    data,
    encoding,
    header: ros2Header({ frameId: "camera", nanosec: 2, sec: 1 }),
    height,
    is_bigendian: isBigEndian ? 1 : 0,
    step,
    width,
  });
}

export function ros2IdlImageMessage({
  data,
  encoding,
  height,
  isBigEndian = false,
  step,
  width,
}: {
  readonly data: readonly number[];
  readonly encoding: string;
  readonly height: number;
  readonly isBigEndian?: boolean;
  readonly step: number;
  readonly width: number;
}): Uint8Array {
  return ros2IdlMessage(ROS2_IDL_IMAGE_SCHEMA, {
    data,
    encoding,
    header: {
      frame_id: "camera",
      stamp: { nanosec: 2, sec: 1 },
    },
    height,
    is_bigendian: isBigEndian ? 1 : 0,
    step,
    width,
  });
}

export function rawRgba(output: DecodedOutput): readonly number[] {
  expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.RAW_IMAGE);
  if (output.visualization?.kind !== VISUALIZATION_KIND.RAW_IMAGE) {
    throw new Error("Expected raw image visualization");
  }

  return Array.from(output.visualization.rgba);
}

export function ros1Header({
  frameId,
  nsec = 0,
  sec = 0,
  seq = 0,
}: {
  readonly frameId: string;
  readonly nsec?: number;
  readonly sec?: number;
  readonly seq?: number;
}) {
  return {
    frame_id: frameId,
    seq,
    stamp: { nsec, sec },
  };
}

export function ros2Header({
  frameId,
  nanosec = 0,
  sec = 0,
}: {
  readonly frameId: string;
  readonly nanosec?: number;
  readonly sec?: number;
}) {
  return {
    frame_id: frameId,
    stamp: { nanosec, sec },
  };
}

export function pointField(name: string, offset: number, datatype = 7) {
  return {
    count: 1,
    datatype,
    name,
    offset,
  };
}

export function pointCloud2Data({
  pointStep,
  points,
  rowStep,
  width,
}: {
  readonly pointStep: number;
  readonly points: readonly (readonly [
    number,
    number,
    number,
    number,
    number,
  ])[];
  readonly rowStep: number;
  readonly width: number;
}): Uint8Array {
  const height = Math.ceil(points.length / width);
  const data = new Uint8Array(rowStep * height);
  const view = new DataView(data.buffer);

  points.forEach(([x, y, z, intensity, ring], index) => {
    const row = Math.floor(index / width);
    const column = index % width;
    const offset = row * rowStep + column * pointStep;
    view.setFloat32(offset, x, true);
    view.setFloat32(offset + 4, y, true);
    view.setFloat32(offset + 8, z, true);
    view.setFloat32(offset + 12, intensity, true);
    view.setUint16(offset + 16, ring, true);
  });

  return data;
}

export function uint16Bytes(
  values: readonly number[],
  littleEndian = true,
): number[] {
  const data = new Uint8Array(values.length * 2);
  const view = new DataView(data.buffer);
  values.forEach((value, index) => {
    view.setUint16(index * 2, value, littleEndian);
  });
  return Array.from(data);
}

export function float32Bytes(
  values: readonly number[],
  littleEndian = true,
): number[] {
  const data = new Uint8Array(values.length * 4);
  const view = new DataView(data.buffer);
  values.forEach((value, index) => {
    view.setFloat32(index * 4, value, littleEndian);
  });
  return Array.from(data);
}

export function markerRecord({
  action = 0,
  color = colorRecord([1, 1, 1, 1]),
  colors = [],
  frameLocked = false,
  id,
  lifetime = { nanosec: 0, sec: 0 },
  meshResource = "",
  meshUseEmbeddedMaterials = false,
  ns,
  points = [],
  pose = poseRecord([0, 0, 0], [0, 0, 0, 1]),
  scale = vectorRecord([1, 1, 1]),
  text = "",
  type,
}: {
  readonly action?: number;
  readonly color?: ReturnType<typeof colorRecord>;
  readonly colors?: readonly ReturnType<typeof colorRecord>[];
  readonly frameLocked?: boolean;
  readonly id: number;
  readonly lifetime?: { readonly nanosec: number; readonly sec: number };
  readonly meshResource?: string;
  readonly meshUseEmbeddedMaterials?: boolean;
  readonly ns: string;
  readonly points?: readonly ReturnType<typeof vectorRecord>[];
  readonly pose?: ReturnType<typeof poseRecord>;
  readonly scale?: ReturnType<typeof vectorRecord>;
  readonly text?: string;
  readonly type: number;
}) {
  return {
    action,
    color,
    colors,
    frame_locked: frameLocked,
    header: ros2Header({ frameId: "map", nanosec: 22, sec: 21 }),
    id,
    lifetime,
    mesh_resource: meshResource,
    mesh_use_embedded_materials: meshUseEmbeddedMaterials,
    ns,
    points,
    pose,
    scale,
    text,
    type,
  };
}

export function colorRecord(color: readonly [number, number, number, number]) {
  return {
    a: color[3],
    b: color[2],
    g: color[1],
    r: color[0],
  };
}

export function createTopic(
  topic: string,
  payload: PayloadDescriptor = {
    encoding: "protobuf",
    schema: "foxglove.CompressedImage",
    schemaEncoding: "protobuf",
  },
): StreamInventory {
  return {
    $typeName: "fiftyone.multimodal.schemas.v1.StreamInventory",
    displayName: topic,
    metadata: {
      "mcap.schema_name": payload.schema ?? "",
      "mcap.topic": topic,
    },
    payload: {
      $typeName: "fiftyone.multimodal.schemas.v1.PayloadDescriptor",
      encoding: payload.encoding,
      schema: payload.schema,
      schemaEncoding: payload.schemaEncoding,
    },
    streamId: topic,
  };
}

export function expectArrayCloseTo(
  actual: readonly number[],
  expected: readonly number[],
) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN);
  });
}
