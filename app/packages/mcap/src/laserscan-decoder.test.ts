import { parse } from "@foxglove/rosmsg";
import { MessageWriter } from "@foxglove/rosmsg2-serialization";
import { describe, expect, it } from "vitest";
import { decodeLaserScanPayload } from "./laserscan-decoder";

const LASER_SCAN_DEFINITION = `std_msgs/msg/Header header
float32 angle_min
float32 angle_max
float32 angle_increment
float32 time_increment
float32 scan_time
float32 range_min
float32 range_max
float32[] ranges
float32[] intensities
================================================================================
MSG: std_msgs/msg/Header
builtin_interfaces/msg/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/msg/Time
int32 sec
uint32 nanosec`;

const writer = new MessageWriter(parse(LASER_SCAN_DEFINITION, { ros2: true }));

function createLaserScanPayload() {
  return writer.writeMessage({
    header: {
      stamp: { sec: 0, nanosec: 0 },
      frame_id: "laser",
    },
    angle_min: 0,
    angle_max: Math.PI / 2,
    angle_increment: Math.PI / 4,
    time_increment: 0,
    scan_time: 0,
    range_min: 0.1,
    range_max: 10,
    ranges: [1, 2, Number.POSITIVE_INFINITY],
    intensities: [0.2, 0.9, 0],
  });
}

describe("decodeLaserScanPayload", () => {
  it("decodes a scan into a points primitive", () => {
    const decoded = decodeLaserScanPayload(createLaserScanPayload());
    const pointsPrimitive = decoded.frame.primitives[0];
    const positions = Array.from(pointsPrimitive?.positions ?? []);

    expect(decoded.frame.frameId).toBe("laser");
    expect(decoded.frame.pointCount).toBe(2);
    expect(pointsPrimitive?.kind).toBe("points");
    expect(positions[0]).toBeCloseTo(1);
    expect(positions[1]).toBeCloseTo(0);
    expect(positions[2]).toBeCloseTo(0);
    expect(positions[3]).toBeCloseTo(Math.sqrt(2));
    expect(positions[4]).toBeCloseTo(Math.sqrt(2));
    expect(positions[5]).toBeCloseTo(0);
    const intensities = Array.from(pointsPrimitive?.intensity ?? []);
    expect(intensities[0]).toBeCloseTo(0.2);
    expect(intensities[1]).toBeCloseTo(0.9);
  });
});
