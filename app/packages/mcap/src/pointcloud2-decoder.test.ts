import { parse } from "@foxglove/rosmsg";
import { MessageWriter } from "@foxglove/rosmsg2-serialization";
import { describe, expect, it } from "vitest";
import { decodePointCloud2Payload } from "./pointcloud2-decoder";

const POINT_CLOUD2_DEFINITION = `sensor_msgs/msg/Header header
uint32 height
uint32 width
sensor_msgs/msg/PointField[] fields
bool is_bigendian
uint32 point_step
uint32 row_step
uint8[] data
bool is_dense
================================================================================
MSG: sensor_msgs/msg/Header
builtin_interfaces/msg/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/msg/Time
int32 sec
uint32 nanosec
================================================================================
MSG: sensor_msgs/msg/PointField
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

const writer = new MessageWriter(
  parse(POINT_CLOUD2_DEFINITION, { ros2: true })
);

function createPointCloudPayload({
  includeIntensity = true,
  includeXYZ = true,
  includeInvalidPoint = false,
}: {
  includeIntensity?: boolean;
  includeXYZ?: boolean;
  includeInvalidPoint?: boolean;
}) {
  const fields = [
    includeXYZ ? { name: "x", offset: 0, datatype: 7, count: 1 } : null,
    includeXYZ ? { name: "y", offset: 4, datatype: 7, count: 1 } : null,
    includeXYZ ? { name: "z", offset: 8, datatype: 7, count: 1 } : null,
    includeIntensity
      ? {
          name: "intensity",
          offset: 12,
          datatype: 7,
          count: 1,
        }
      : null,
  ].filter(Boolean);
  const pointStep = includeIntensity ? 16 : 12;
  const pointCount = 2;
  const data = new Uint8Array(pointCount * pointStep);
  const view = new DataView(data.buffer);

  view.setFloat32(0, 1, true);
  view.setFloat32(4, 2, true);
  view.setFloat32(8, 3, true);
  if (includeIntensity) {
    view.setFloat32(12, 0.25, true);
  }

  view.setFloat32(pointStep, includeInvalidPoint ? Number.NaN : 4, true);
  view.setFloat32(pointStep + 4, 5, true);
  view.setFloat32(pointStep + 8, 6, true);
  if (includeIntensity) {
    view.setFloat32(pointStep + 12, 0.75, true);
  }

  return writer.writeMessage({
    header: {
      stamp: { sec: 0, nanosec: 0 },
      frame_id: "map",
    },
    height: 1,
    width: pointCount,
    fields,
    is_bigendian: false,
    point_step: pointStep,
    row_step: pointStep * pointCount,
    data,
    is_dense: !includeInvalidPoint,
  });
}

describe("decodePointCloud2Payload", () => {
  it("extracts XYZ, intensity, and bounds", () => {
    const decoded = decodePointCloud2Payload(createPointCloudPayload({}));

    expect(decoded.frame.pointCount).toBe(2);
    expect(Array.from(decoded.frame.positions)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Array.from(decoded.frame.intensity ?? [])).toEqual([0.25, 0.75]);
    expect(decoded.frame.bounds).toEqual({
      min: [1, 2, 3],
      max: [4, 5, 6],
    });
  });

  it("returns a null intensity buffer when the field is absent", () => {
    const decoded = decodePointCloud2Payload(
      createPointCloudPayload({ includeIntensity: false })
    );

    expect(decoded.frame.intensity).toBeNull();
    expect(decoded.frame.pointCount).toBe(2);
  });

  it("drops invalid points instead of emitting NaNs", () => {
    const decoded = decodePointCloud2Payload(
      createPointCloudPayload({ includeInvalidPoint: true })
    );

    expect(decoded.frame.pointCount).toBe(1);
    expect(Array.from(decoded.frame.positions)).toEqual([1, 2, 3]);
    expect(Array.from(decoded.frame.intensity ?? [])).toEqual([0.25]);
  });

  it("rejects payloads without XYZ fields", () => {
    expect(() => {
      decodePointCloud2Payload(createPointCloudPayload({ includeXYZ: false }));
    }).toThrow(/missing x, y, or z fields/i);
  });
});
