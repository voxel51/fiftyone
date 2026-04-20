import { parse } from "@foxglove/rosmsg";
import { MessageReader } from "@foxglove/rosmsg2-serialization";
import * as THREE from "three";
import type { Scene3dFrame, Scene3dPrimitive } from "./archetypes";

const MARKER_ARRAY_DEFINITION = `visualization_msgs/msg/Marker[] markers
================================================================================
MSG: visualization_msgs/msg/Marker
std_msgs/msg/Header header
string ns
int32 id
int32 type
int32 action
geometry_msgs/msg/Pose pose
geometry_msgs/msg/Vector3 scale
std_msgs/msg/ColorRGBA color
builtin_interfaces/msg/Duration lifetime
bool frame_locked
geometry_msgs/msg/Point[] points
std_msgs/msg/ColorRGBA[] colors
string text
string mesh_resource
bool mesh_use_embedded_materials
================================================================================
MSG: std_msgs/msg/Header
builtin_interfaces/msg/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/msg/Time
int32 sec
uint32 nanosec
================================================================================
MSG: geometry_msgs/msg/Pose
geometry_msgs/msg/Point position
geometry_msgs/msg/Quaternion orientation
================================================================================
MSG: geometry_msgs/msg/Point
float64 x
float64 y
float64 z
================================================================================
MSG: geometry_msgs/msg/Quaternion
float64 x
float64 y
float64 z
float64 w
================================================================================
MSG: geometry_msgs/msg/Vector3
float64 x
float64 y
float64 z
================================================================================
MSG: std_msgs/msg/ColorRGBA
float32 r
float32 g
float32 b
float32 a
================================================================================
MSG: builtin_interfaces/msg/Duration
int32 sec
uint32 nanosec`;

const MARKER_ACTION_ADD = 0;
const MARKER_TYPE_ARROW = 0;
const MARKER_TYPE_CUBE = 1;
const MARKER_TYPE_SPHERE = 2;
const MARKER_TYPE_LINE_STRIP = 4;
const MARKER_TYPE_LINE_LIST = 5;
const MARKER_TYPE_CUBE_LIST = 6;
const MARKER_TYPE_SPHERE_LIST = 7;
const MARKER_TYPE_POINTS = 8;

type MarkerColorMessage = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type MarkerPointMessage = {
  x: number;
  y: number;
  z: number;
};

type MarkerMessage = {
  header: {
    frame_id: string;
  };
  ns: string;
  id: number;
  type: number;
  action: number;
  pose: {
    position: MarkerPointMessage;
    orientation: {
      x: number;
      y: number;
      z: number;
      w: number;
    };
  };
  scale: {
    x: number;
    y: number;
    z: number;
  };
  color: MarkerColorMessage;
  points: MarkerPointMessage[];
  colors: MarkerColorMessage[];
};

type MarkerArrayMessage = {
  markers: MarkerMessage[];
};

const markerArrayReader = new MessageReader<MarkerArrayMessage>(
  parse(MARKER_ARRAY_DEFINITION, { ros2: true })
);

function createEmptyBounds(): Scene3dFrame["bounds"] {
  return {
    min: [0, 0, 0],
    max: [0, 0, 0],
  };
}

function updateBounds(
  bounds: Scene3dFrame["bounds"],
  x: number,
  y: number,
  z: number,
  initialize: boolean
) {
  if (initialize) {
    bounds.min = [x, y, z];
    bounds.max = [x, y, z];
    return;
  }

  bounds.min[0] = Math.min(bounds.min[0], x);
  bounds.min[1] = Math.min(bounds.min[1], y);
  bounds.min[2] = Math.min(bounds.min[2], z);
  bounds.max[0] = Math.max(bounds.max[0], x);
  bounds.max[1] = Math.max(bounds.max[1], y);
  bounds.max[2] = Math.max(bounds.max[2], z);
}

function getMarkerId(marker: MarkerMessage, index: number) {
  return `${marker.ns || "marker"}:${marker.id}:${index}`;
}

function getMarkerColor(
  marker: MarkerMessage,
  color: MarkerColorMessage | undefined
) {
  const source = color ?? marker.color;
  return [
    Number.isFinite(source?.r) ? source.r : 1,
    Number.isFinite(source?.g) ? source.g : 1,
    Number.isFinite(source?.b) ? source.b : 1,
  ] as [number, number, number];
}

function buildColorBuffer(
  count: number,
  color: [number, number, number]
): Float32Array {
  const colors = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    colors[offset] = color[0];
    colors[offset + 1] = color[1];
    colors[offset + 2] = color[2];
  }

  return colors;
}

function transformPoint(
  point: MarkerPointMessage,
  matrix: THREE.Matrix4
): [number, number, number] {
  const vector = new THREE.Vector3(point.x, point.y, point.z).applyMatrix4(
    matrix
  );
  return [vector.x, vector.y, vector.z];
}

function getPoseMatrix(marker: MarkerMessage) {
  const translation = new THREE.Vector3(
    marker.pose.position.x,
    marker.pose.position.y,
    marker.pose.position.z
  );
  const rotation = new THREE.Quaternion(
    marker.pose.orientation.x,
    marker.pose.orientation.y,
    marker.pose.orientation.z,
    marker.pose.orientation.w
  );
  const scale = new THREE.Vector3(1, 1, 1);
  return new THREE.Matrix4().compose(translation, rotation, scale);
}

function getRotationArray(marker: MarkerMessage, count: number) {
  const values = new Float32Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    values[offset] = marker.pose.orientation.x;
    values[offset + 1] = marker.pose.orientation.y;
    values[offset + 2] = marker.pose.orientation.z;
    values[offset + 3] = marker.pose.orientation.w;
  }
  return values;
}

function createLinePrimitive(
  kind: "line-list" | "line-strip",
  marker: MarkerMessage,
  markerIndex: number,
  poseMatrix: THREE.Matrix4
): Scene3dPrimitive | null {
  const positions = new Float32Array(marker.points.length * 3);

  marker.points.forEach((point, index) => {
    const [x, y, z] = transformPoint(point, poseMatrix);
    const offset = index * 3;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
  });

  if (positions.length === 0) {
    return null;
  }

  const colors =
    marker.colors.length === marker.points.length
      ? Float32Array.from(
          marker.colors.flatMap((color) => getMarkerColor(marker, color))
        )
      : buildColorBuffer(
          marker.points.length,
          getMarkerColor(marker, undefined)
        );

  return {
    kind,
    id: getMarkerId(marker, markerIndex),
    frameId: marker.header.frame_id || null,
    positions,
    colors,
    solidColor: null,
  };
}

function createPointsPrimitive(
  marker: MarkerMessage,
  markerIndex: number,
  poseMatrix: THREE.Matrix4
): Scene3dPrimitive | null {
  const positions = new Float32Array(marker.points.length * 3);

  marker.points.forEach((point, index) => {
    const [x, y, z] = transformPoint(point, poseMatrix);
    const offset = index * 3;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
  });

  if (positions.length === 0) {
    return null;
  }

  const colors =
    marker.colors.length === marker.points.length
      ? Float32Array.from(
          marker.colors.flatMap((color) => getMarkerColor(marker, color))
        )
      : buildColorBuffer(
          marker.points.length,
          getMarkerColor(marker, undefined)
        );

  return {
    kind: "points",
    id: getMarkerId(marker, markerIndex),
    frameId: marker.header.frame_id || null,
    pointCount: marker.points.length,
    positions,
    intensity: null,
    colors,
    pointSize: Math.max(marker.scale.x || 0, 2),
    solidColor: null,
  };
}

function createInstancePrimitive(
  kind: "sphere-list" | "cube-list",
  marker: MarkerMessage,
  markerIndex: number,
  poseMatrix: THREE.Matrix4,
  points: MarkerPointMessage[]
): Scene3dPrimitive | null {
  if (!points.length) {
    return null;
  }

  const positions = new Float32Array(points.length * 3);
  const scales = new Float32Array(points.length * 3);
  const rotations = getRotationArray(marker, points.length);

  points.forEach((point, index) => {
    const [x, y, z] = transformPoint(point, poseMatrix);
    const positionOffset = index * 3;
    positions[positionOffset] = x;
    positions[positionOffset + 1] = y;
    positions[positionOffset + 2] = z;
    scales[positionOffset] = marker.scale.x || 0.1;
    scales[positionOffset + 1] = marker.scale.y || marker.scale.x || 0.1;
    scales[positionOffset + 2] = marker.scale.z || marker.scale.x || 0.1;
  });

  const colors =
    marker.colors.length === points.length
      ? Float32Array.from(
          marker.colors.flatMap((color) => getMarkerColor(marker, color))
        )
      : buildColorBuffer(points.length, getMarkerColor(marker, undefined));

  return {
    kind,
    id: getMarkerId(marker, markerIndex),
    frameId: marker.header.frame_id || null,
    positions,
    scales,
    rotations,
    colors,
    solidColor: null,
  };
}

function createArrowPrimitive(
  marker: MarkerMessage,
  markerIndex: number,
  poseMatrix: THREE.Matrix4
): Scene3dPrimitive | null {
  const points =
    marker.points.length >= 2
      ? marker.points.slice(0, 2)
      : [
          { x: 0, y: 0, z: 0 },
          { x: marker.scale.x || 1, y: 0, z: 0 },
        ];

  return createLinePrimitive(
    "line-strip",
    { ...marker, points },
    markerIndex,
    poseMatrix
  );
}

function getMarkerPrimitive(
  marker: MarkerMessage,
  markerIndex: number
): Scene3dPrimitive | null {
  if (marker.action !== MARKER_ACTION_ADD) {
    return null;
  }

  const poseMatrix = getPoseMatrix(marker);

  switch (marker.type) {
    case MARKER_TYPE_ARROW:
      return createArrowPrimitive(marker, markerIndex, poseMatrix);
    case MARKER_TYPE_CUBE:
      return createInstancePrimitive(
        "cube-list",
        marker,
        markerIndex,
        poseMatrix,
        [{ x: 0, y: 0, z: 0 }]
      );
    case MARKER_TYPE_SPHERE:
      return createInstancePrimitive(
        "sphere-list",
        marker,
        markerIndex,
        poseMatrix,
        [{ x: 0, y: 0, z: 0 }]
      );
    case MARKER_TYPE_LINE_STRIP:
      return createLinePrimitive("line-strip", marker, markerIndex, poseMatrix);
    case MARKER_TYPE_LINE_LIST:
      return createLinePrimitive("line-list", marker, markerIndex, poseMatrix);
    case MARKER_TYPE_CUBE_LIST:
      return createInstancePrimitive(
        "cube-list",
        marker,
        markerIndex,
        poseMatrix,
        marker.points
      );
    case MARKER_TYPE_SPHERE_LIST:
      return createInstancePrimitive(
        "sphere-list",
        marker,
        markerIndex,
        poseMatrix,
        marker.points
      );
    case MARKER_TYPE_POINTS:
      return createPointsPrimitive(marker, markerIndex, poseMatrix);
    default:
      return null;
  }
}

/** Worker request payload for one raw `MarkerArray` Multimodal message. */
export type MultimodalMarkerArrayDecodeRequest = {
  messageId: string;
  payload: ArrayBuffer;
};

/** Worker response payload for one decoded `MarkerArray` message. */
export type MultimodalMarkerArrayDecodeResponse = {
  messageId: string;
  frame: Scene3dFrame;
};

/** Decodes one ROS2 CDR `visualization_msgs/msg/MarkerArray` payload. */
export function decodeMarkerArrayPayload(
  payload: Uint8Array
): MultimodalMarkerArrayDecodeResponse {
  const message = markerArrayReader.readMessage<MarkerArrayMessage>(payload);
  const primitives = (message.markers ?? [])
    .map((marker, index) => getMarkerPrimitive(marker, index))
    .filter((primitive): primitive is Scene3dPrimitive => Boolean(primitive));
  const bounds = createEmptyBounds();
  let pointCount = 0;
  let didInitializeBounds = false;

  primitives.forEach((primitive) => {
    const positions = primitive.positions;
    const count = positions.length / 3;
    pointCount += count;
    for (let index = 0; index < positions.length; index += 3) {
      updateBounds(
        bounds,
        positions[index],
        positions[index + 1],
        positions[index + 2],
        !didInitializeBounds
      );
      didInitializeBounds = true;
    }
  });

  return {
    messageId: "",
    frame: {
      id: "",
      pointCount,
      primitives,
      bounds: didInitializeBounds ? bounds : createEmptyBounds(),
      frameId: primitives.length === 1 ? primitives[0].frameId ?? null : null,
    },
  };
}
