import { parse } from "@foxglove/rosmsg";
import { MessageReader } from "@foxglove/rosmsg2-serialization";
import type { Scene3dFrame } from "./archetypes";

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

type LaserScanMessage = {
  header: {
    frame_id: string;
  };
  angle_min: number;
  angle_increment: number;
  range_min: number;
  range_max: number;
  ranges: number[];
  intensities: number[];
};

const laserScanReader = new MessageReader<LaserScanMessage>(
  parse(LASER_SCAN_DEFINITION, { ros2: true })
);

function createEmptyBounds(): Scene3dFrame["bounds"] {
  return {
    min: [0, 0, 0],
    max: [0, 0, 0],
  };
}

/** Worker request payload for one raw `LaserScan` Multimodal message. */
export type MultimodalLaserScanDecodeRequest = {
  messageId: string;
  payload: ArrayBuffer;
};

/** Worker response payload for one decoded `LaserScan` message. */
export type MultimodalLaserScanDecodeResponse = {
  messageId: string;
  frame: Scene3dFrame;
};

/** Decodes one ROS2 CDR `sensor_msgs/msg/LaserScan` payload. */
export function decodeLaserScanPayload(
  payload: Uint8Array
): MultimodalLaserScanDecodeResponse {
  const message = laserScanReader.readMessage<LaserScanMessage>(payload);
  const ranges = Array.from(message.ranges ?? []);
  const intensities = Array.from(message.intensities ?? []);
  const positions = new Float32Array(ranges.length * 3);
  const intensityBuffer =
    intensities.length > 0 ? new Float32Array(ranges.length) : null;
  const bounds = createEmptyBounds();
  let validPointCount = 0;

  ranges.forEach((range, index) => {
    if (
      !Number.isFinite(range) ||
      range < (message.range_min ?? 0) ||
      range > (message.range_max ?? Number.POSITIVE_INFINITY)
    ) {
      return;
    }

    const angle =
      (message.angle_min ?? 0) + index * (message.angle_increment ?? 0);
    const x = range * Math.cos(angle);
    const y = range * Math.sin(angle);
    const z = 0;
    const positionOffset = validPointCount * 3;
    positions[positionOffset] = x;
    positions[positionOffset + 1] = y;
    positions[positionOffset + 2] = z;

    if (validPointCount === 0) {
      bounds.min = [x, y, z];
      bounds.max = [x, y, z];
    } else {
      bounds.min[0] = Math.min(bounds.min[0], x);
      bounds.min[1] = Math.min(bounds.min[1], y);
      bounds.min[2] = Math.min(bounds.min[2], z);
      bounds.max[0] = Math.max(bounds.max[0], x);
      bounds.max[1] = Math.max(bounds.max[1], y);
      bounds.max[2] = Math.max(bounds.max[2], z);
    }

    if (intensityBuffer) {
      intensityBuffer[validPointCount] = Number.isFinite(intensities[index])
        ? intensities[index]
        : 0;
    }

    validPointCount += 1;
  });

  return {
    messageId: "",
    frame: {
      id: "",
      pointCount: validPointCount,
      bounds: validPointCount > 0 ? bounds : createEmptyBounds(),
      frameId: message.header?.frame_id || "",
      primitives: [
        {
          kind: "points",
          id: "laser-points",
          frameId: message.header?.frame_id || "",
          pointCount: validPointCount,
          positions: positions.slice(0, validPointCount * 3),
          intensity: intensityBuffer
            ? intensityBuffer.slice(0, validPointCount)
            : null,
          colors: null,
          solidColor: null,
          pointSize: 2,
        },
      ],
    },
  };
}
