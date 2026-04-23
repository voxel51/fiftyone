import { parse, Root, Type } from "protobufjs";

const GOOGLE_DEFINITION = `syntax = "proto3";
package google.protobuf;

message Timestamp {
  int64 seconds = 1;
  int32 nanos = 2;
}

message Duration {
  int64 seconds = 1;
  int32 nanos = 2;
}`;

const FOXGLOVE_DEFINITION = `syntax = "proto3";
package foxglove;

message Vector3 {
  double x = 1;
  double y = 2;
  double z = 3;
}

message Point2 {
  double x = 1;
  double y = 2;
}

message Point3 {
  double x = 1;
  double y = 2;
  double z = 3;
}

message Quaternion {
  double x = 1;
  double y = 2;
  double z = 3;
  double w = 4;
}

message Pose {
  Vector3 position = 1;
  Quaternion orientation = 2;
}

message Color {
  double r = 1;
  double g = 2;
  double b = 3;
  double a = 4;
}

message KeyValuePair {
  string key = 1;
  string value = 2;
}

message PackedElementField {
  enum NumericType {
    UNKNOWN = 0;
    UINT8 = 1;
    INT8 = 2;
    UINT16 = 3;
    INT16 = 4;
    UINT32 = 5;
    INT32 = 6;
    FLOAT32 = 7;
    FLOAT64 = 8;
  }

  string name = 1;
  fixed32 offset = 2;
  NumericType type = 3;
}

message CompressedImage {
  google.protobuf.Timestamp timestamp = 1;
  bytes data = 2;
  string format = 3;
  string frame_id = 4;
}

message PointCloud {
  google.protobuf.Timestamp timestamp = 1;
  string frame_id = 2;
  Pose pose = 3;
  fixed32 point_stride = 4;
  repeated PackedElementField fields = 5;
  bytes data = 6;
}

message FrameTransform {
  google.protobuf.Timestamp timestamp = 1;
  string parent_frame_id = 2;
  string child_frame_id = 3;
  Vector3 translation = 4;
  Quaternion rotation = 5;
}

message CameraCalibration {
  google.protobuf.Timestamp timestamp = 1;
  fixed32 width = 2;
  fixed32 height = 3;
  string distortion_model = 4;
  repeated double D = 5;
  repeated double K = 6;
  repeated double R = 7;
  repeated double P = 8;
  string frame_id = 9;
}

message CircleAnnotation {
  google.protobuf.Timestamp timestamp = 1;
  Point2 position = 2;
  double diameter = 3;
  double thickness = 4;
  Color fill_color = 5;
  Color outline_color = 6;
  repeated KeyValuePair metadata = 7;
}

message PointsAnnotation {
  enum Type {
    UNKNOWN = 0;
    POINTS = 1;
    LINE_LOOP = 2;
    LINE_STRIP = 3;
    LINE_LIST = 4;
  }

  google.protobuf.Timestamp timestamp = 1;
  Type type = 2;
  repeated Point2 points = 3;
  Color outline_color = 4;
  repeated Color outline_colors = 5;
  Color fill_color = 6;
  double thickness = 7;
  repeated KeyValuePair metadata = 8;
}

message TextAnnotation {
  google.protobuf.Timestamp timestamp = 1;
  Point2 position = 2;
  string text = 3;
  double font_size = 4;
  Color text_color = 5;
  Color background_color = 6;
  repeated KeyValuePair metadata = 7;
}

message ImageAnnotations {
  repeated CircleAnnotation circles = 1;
  repeated PointsAnnotation points = 2;
  repeated TextAnnotation texts = 3;
  repeated KeyValuePair metadata = 4;
  optional google.protobuf.Timestamp timestamp = 5;
}

message ArrowPrimitive {
  Pose pose = 1;
  double shaft_length = 2;
  double shaft_diameter = 3;
  double head_length = 4;
  double head_diameter = 5;
  Color color = 6;
}

message CubePrimitive {
  Pose pose = 1;
  Vector3 size = 2;
  Color color = 3;
}

message SpherePrimitive {
  Pose pose = 1;
  Vector3 size = 2;
  Color color = 3;
}

message LinePrimitive {
  enum Type {
    LINE_STRIP = 0;
    LINE_LOOP = 1;
    LINE_LIST = 2;
  }

  Type type = 1;
  Pose pose = 2;
  double thickness = 3;
  bool scale_invariant = 4;
  repeated Point3 points = 5;
  Color color = 6;
  repeated Color colors = 7;
  repeated fixed32 indices = 8;
}

message CylinderPrimitive {}
message TriangleListPrimitive {}
message TextPrimitive {}
message ModelPrimitive {}

message SceneEntity {
  google.protobuf.Timestamp timestamp = 1;
  string frame_id = 2;
  string id = 3;
  google.protobuf.Duration lifetime = 4;
  bool frame_locked = 5;
  repeated KeyValuePair metadata = 6;
  repeated ArrowPrimitive arrows = 7;
  repeated CubePrimitive cubes = 8;
  repeated SpherePrimitive spheres = 9;
  repeated CylinderPrimitive cylinders = 10;
  repeated LinePrimitive lines = 11;
  repeated TriangleListPrimitive triangles = 12;
  repeated TextPrimitive texts = 13;
  repeated ModelPrimitive models = 14;
}

message SceneEntityDeletion {
  enum Type {
    MATCHING_ID = 0;
    ALL = 1;
  }

  google.protobuf.Timestamp timestamp = 1;
  Type type = 2;
  string id = 3;
}

message SceneUpdate {
  repeated SceneEntityDeletion deletions = 1;
  repeated SceneEntity entities = 2;
}`;

export type FoxgloveTimestamp = {
  seconds?: number;
  nanos?: number;
};

export type FoxgloveDuration = {
  seconds?: number;
  nanos?: number;
};

export type FoxgloveVector3 = {
  x?: number;
  y?: number;
  z?: number;
};

export type FoxglovePoint2 = {
  x?: number;
  y?: number;
};

export type FoxglovePoint3 = {
  x?: number;
  y?: number;
  z?: number;
};

export type FoxgloveQuaternion = {
  x?: number;
  y?: number;
  z?: number;
  w?: number;
};

export type FoxglovePose = {
  position?: FoxgloveVector3;
  orientation?: FoxgloveQuaternion;
};

export type FoxgloveColor = {
  r?: number;
  g?: number;
  b?: number;
  a?: number;
};

export type FoxgloveKeyValuePair = {
  key?: string;
  value?: string;
};

type FoxglovePackedElementField = {
  name?: string;
  offset?: number;
  type?: number;
};

type FoxgloveCompressedImageMessage = {
  timestamp?: FoxgloveTimestamp;
  data?: Uint8Array;
  format?: string;
  frameId?: string;
};

type FoxglovePointCloudMessage = {
  timestamp?: FoxgloveTimestamp;
  frameId?: string;
  pose?: FoxglovePose;
  pointStride?: number;
  fields?: FoxglovePackedElementField[];
  data?: Uint8Array;
};

type FoxgloveFrameTransformMessage = {
  timestamp?: FoxgloveTimestamp;
  parentFrameId?: string;
  childFrameId?: string;
  translation?: FoxgloveVector3;
  rotation?: FoxgloveQuaternion;
};

type FoxgloveCameraCalibrationMessage = {
  timestamp?: FoxgloveTimestamp;
  frameId?: string;
  width?: number;
  height?: number;
  distortionModel?: string;
  d?: number[];
  k?: number[];
  r?: number[];
  p?: number[];
};

type FoxgloveCircleAnnotationMessage = {
  timestamp?: FoxgloveTimestamp;
  position?: FoxglovePoint2;
  diameter?: number;
  thickness?: number;
  fillColor?: FoxgloveColor;
  outlineColor?: FoxgloveColor;
};

type FoxglovePointsAnnotationMessage = {
  timestamp?: FoxgloveTimestamp;
  type?: number;
  points?: FoxglovePoint2[];
  outlineColor?: FoxgloveColor;
  outlineColors?: FoxgloveColor[];
  fillColor?: FoxgloveColor;
  thickness?: number;
};

type FoxgloveTextAnnotationMessage = {
  timestamp?: FoxgloveTimestamp;
  position?: FoxglovePoint2;
  text?: string;
  fontSize?: number;
  textColor?: FoxgloveColor;
  backgroundColor?: FoxgloveColor;
};

type FoxgloveImageAnnotationsMessage = {
  timestamp?: FoxgloveTimestamp;
  circles?: FoxgloveCircleAnnotationMessage[];
  points?: FoxglovePointsAnnotationMessage[];
  texts?: FoxgloveTextAnnotationMessage[];
};

export type FoxgloveArrowPrimitiveMessage = {
  pose?: FoxglovePose;
  shaftLength?: number;
  shaftDiameter?: number;
  headLength?: number;
  headDiameter?: number;
  color?: FoxgloveColor;
};

export type FoxgloveCubePrimitiveMessage = {
  pose?: FoxglovePose;
  size?: FoxgloveVector3;
  color?: FoxgloveColor;
};

export type FoxgloveSpherePrimitiveMessage = {
  pose?: FoxglovePose;
  size?: FoxgloveVector3;
  color?: FoxgloveColor;
};

export type FoxgloveLinePrimitiveMessage = {
  type?: number;
  pose?: FoxglovePose;
  thickness?: number;
  scaleInvariant?: boolean;
  points?: FoxglovePoint3[];
  color?: FoxgloveColor;
  colors?: FoxgloveColor[];
  indices?: number[];
};

type FoxgloveSceneEntityMessage = {
  timestamp?: FoxgloveTimestamp;
  frameId?: string;
  id?: string;
  lifetime?: FoxgloveDuration;
  frameLocked?: boolean;
  metadata?: FoxgloveKeyValuePair[];
  arrows?: FoxgloveArrowPrimitiveMessage[];
  cubes?: FoxgloveCubePrimitiveMessage[];
  spheres?: FoxgloveSpherePrimitiveMessage[];
  cylinders?: unknown[];
  lines?: FoxgloveLinePrimitiveMessage[];
  triangles?: unknown[];
  texts?: unknown[];
  models?: unknown[];
};

type FoxgloveSceneEntityDeletionMessage = {
  timestamp?: FoxgloveTimestamp;
  type?: number;
  id?: string;
};

type FoxgloveSceneUpdateMessage = {
  deletions?: FoxgloveSceneEntityDeletionMessage[];
  entities?: FoxgloveSceneEntityMessage[];
};

const foxgloveRoot = new Root();
parse(GOOGLE_DEFINITION, foxgloveRoot);
parse(FOXGLOVE_DEFINITION, foxgloveRoot);
foxgloveRoot.resolveAll();

const compressedImageType = foxgloveRoot.lookupType("foxglove.CompressedImage");
const pointCloudType = foxgloveRoot.lookupType("foxglove.PointCloud");
const frameTransformType = foxgloveRoot.lookupType("foxglove.FrameTransform");
const cameraCalibrationType = foxgloveRoot.lookupType(
  "foxglove.CameraCalibration"
);
const imageAnnotationsType = foxgloveRoot.lookupType(
  "foxglove.ImageAnnotations"
);
const sceneUpdateType = foxgloveRoot.lookupType("foxglove.SceneUpdate");

function toUint8Array(
  value: Uint8Array | ArrayLike<number> | null | undefined
) {
  if (!value) {
    return new Uint8Array();
  }

  return value instanceof Uint8Array ? value : Uint8Array.from(value);
}

function toNumberArray(value: number[] | ArrayLike<number> | null | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : Array.from(value);
}

function decodeFoxgloveMessage(type: Type, payload: Uint8Array) {
  return type.toObject(type.decode(payload), {
    arrays: true,
    bytes: Uint8Array,
    defaults: false,
    enums: Number,
    longs: Number,
  });
}

export function decodeFoxgloveCompressedImageMessage(payload: Uint8Array) {
  const decoded = decodeFoxgloveMessage(
    compressedImageType,
    payload
  ) as FoxgloveCompressedImageMessage;

  return {
    timestamp: decoded.timestamp,
    data: toUint8Array(decoded.data),
    format: decoded.format ?? "",
    frameId: decoded.frameId ?? "",
  };
}

export function decodeFoxglovePointCloudMessage(payload: Uint8Array) {
  const decoded = decodeFoxgloveMessage(
    pointCloudType,
    payload
  ) as FoxglovePointCloudMessage;

  return {
    timestamp: decoded.timestamp,
    frameId: decoded.frameId ?? "",
    pose: decoded.pose ?? null,
    pointStride: decoded.pointStride ?? 0,
    fields: decoded.fields ?? [],
    data: toUint8Array(decoded.data),
  };
}

export function decodeFoxgloveFrameTransformMessage(payload: Uint8Array) {
  const decoded = decodeFoxgloveMessage(
    frameTransformType,
    payload
  ) as FoxgloveFrameTransformMessage;

  return {
    timestamp: decoded.timestamp,
    parentFrameId: decoded.parentFrameId ?? "",
    childFrameId: decoded.childFrameId ?? "",
    translation: decoded.translation ?? null,
    rotation: decoded.rotation ?? null,
  };
}

export function decodeFoxgloveCameraCalibrationMessage(payload: Uint8Array) {
  const decoded = decodeFoxgloveMessage(
    cameraCalibrationType,
    payload
  ) as FoxgloveCameraCalibrationMessage;

  return {
    timestamp: decoded.timestamp,
    frameId: decoded.frameId ?? "",
    width: decoded.width ?? 0,
    height: decoded.height ?? 0,
    distortionModel: decoded.distortionModel ?? "",
    d: toNumberArray(decoded.d),
    k: toNumberArray(decoded.k),
    r: toNumberArray(decoded.r),
    p: toNumberArray(decoded.p),
  };
}

export function decodeFoxgloveImageAnnotationsMessage(payload: Uint8Array) {
  const decoded = decodeFoxgloveMessage(
    imageAnnotationsType,
    payload
  ) as FoxgloveImageAnnotationsMessage;

  return {
    timestamp: decoded.timestamp,
    circles: decoded.circles ?? [],
    points: decoded.points ?? [],
    texts: decoded.texts ?? [],
  };
}

export function decodeFoxgloveSceneUpdateMessage(payload: Uint8Array) {
  const decoded = decodeFoxgloveMessage(
    sceneUpdateType,
    payload
  ) as FoxgloveSceneUpdateMessage;

  return {
    deletions: decoded.deletions ?? [],
    entities: decoded.entities ?? [],
  };
}
