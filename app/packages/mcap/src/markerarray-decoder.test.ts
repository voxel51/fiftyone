import { parse } from "@foxglove/rosmsg";
import { MessageWriter } from "@foxglove/rosmsg2-serialization";
import { describe, expect, it } from "vitest";
import { decodeMarkerArrayPayload } from "./markerarray-decoder";

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

const writer = new MessageWriter(
  parse(MARKER_ARRAY_DEFINITION, { ros2: true })
);

function createMarkerArrayPayload() {
  return writer.writeMessage({
    markers: [
      {
        header: {
          stamp: { sec: 0, nanosec: 0 },
          frame_id: "map",
        },
        ns: "lines",
        id: 1,
        type: 4,
        action: 0,
        pose: {
          position: { x: 0, y: 0, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
        scale: { x: 0.05, y: 0.05, z: 0.05 },
        color: { r: 1, g: 0.4, b: 0.2, a: 1 },
        lifetime: { sec: 0, nanosec: 0 },
        frame_locked: false,
        points: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 1, y: 1, z: 0 },
        ],
        colors: [],
        text: "",
        mesh_resource: "",
        mesh_use_embedded_materials: false,
      },
      {
        header: {
          stamp: { sec: 0, nanosec: 0 },
          frame_id: "map",
        },
        ns: "points",
        id: 2,
        type: 8,
        action: 0,
        pose: {
          position: { x: 1, y: 2, z: 3 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
        scale: { x: 0.1, y: 0.1, z: 0.1 },
        color: { r: 0.2, g: 0.7, b: 1, a: 1 },
        lifetime: { sec: 0, nanosec: 0 },
        frame_locked: false,
        points: [{ x: 0, y: 0, z: 0 }],
        colors: [],
        text: "",
        mesh_resource: "",
        mesh_use_embedded_materials: false,
      },
    ],
  });
}

describe("decodeMarkerArrayPayload", () => {
  it("decodes line and point markers into 3d primitives", () => {
    const decoded = decodeMarkerArrayPayload(createMarkerArrayPayload());

    expect(decoded.frame.primitives).toHaveLength(2);
    expect(decoded.frame.primitives[0]?.kind).toBe("line-strip");
    expect(decoded.frame.primitives[1]?.kind).toBe("points");
    expect(decoded.frame.frameId).toBeNull();
    expect(decoded.frame.bounds.min).toEqual([0, 0, 0]);
    expect(decoded.frame.bounds.max).toEqual([1, 2, 3]);
  });
});
