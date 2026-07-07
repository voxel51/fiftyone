import type { DecodedAttributeValue, Decoder } from "../../../../decoders";
import { resourceHintsForArrayBufferViews } from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { decodeProtobufMessage } from "./protobuf";
import {
  decodePose,
  normalizedQuaternion,
  type ProtobufPose3D,
} from "./protobuf/geometry";
import { FOXGLOVE_LASER_SCAN_PAYLOAD } from "./protobuf/payloads";
import {
  numberField,
  optionalRecord,
  optionalString,
} from "./protobuf/records";
import { timingFromContext, timestampNs } from "./protobuf/timing";

export const LASER_SCAN_POINT_COMPONENT_COUNT = 3;

// Canonical scalar-channel name shared with the point-cloud decoder so
// auto-coloring and future color-by-field pick up scan intensities.
const INTENSITY_FIELD_NAME = "intensity";

/**
 * Decoder for Foxglove LaserScan protobuf messages. Converts the polar scan
 * (equally-spaced bearings between start_angle and end_angle, counterclockwise
 * around +Z from +X, in the scan pose's x-y plane) into cartesian points and
 * emits the existing point-cloud visualization kind, so transforms, rendering,
 * coloring, and inspection all apply unchanged.
 */
export const foxgloveLaserScanDecoder: Decoder = {
  id: "foxglove.laser-scan",
  payload: FOXGLOVE_LASER_SCAN_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(
      bytes,
      FOXGLOVE_LASER_SCAN_PAYLOAD,
      context,
    );
    const frameId = optionalString(message, "frameId", "frame_id");
    const messageTimestamp = timestampNs(optionalRecord(message, "timestamp"));
    const startAngle = numberField(message, "startAngle", "start_angle");
    const endAngle = numberField(message, "endAngle", "end_angle");
    const ranges = numberArrayField(message, "ranges");
    const intensities = numberArrayField(message, "intensities");
    const pose = decodePose(optionalRecord(message, "pose"));
    const decoded = scanToPoints({
      endAngle,
      // Intensities are per-range by schema; a mismatched array is
      // untrustworthy, so it is dropped rather than misaligned.
      intensities:
        intensities.length === ranges.length ? intensities : undefined,
      pose,
      ranges,
      startAngle,
    });
    const pointCount =
      decoded.positions.length / LASER_SCAN_POINT_COMPONENT_COUNT;

    const attributes: Record<string, DecodedAttributeValue> = {
      endAngle,
      pointCount,
      rangeCount: ranges.length,
      startAngle,
    };
    if (frameId) {
      attributes.frameId = frameId;
    }

    const transferableViews = [
      decoded.positions,
      ...(decoded.intensities ? [decoded.intensities] : []),
    ];

    return {
      attributes,
      resourceHints: resourceHintsForArrayBufferViews(...transferableViews),
      timing: timingFromContext(context, messageTimestamp),
      visualization: {
        ...(frameId ? { coordinateFrameId: frameId } : {}),
        fields: [],
        kind: VISUALIZATION_KIND.POINT_CLOUD,
        pointCount,
        positions: decoded.positions,
        ...(decoded.intensities
          ? {
              scalarFields: [
                { name: INTENSITY_FIELD_NAME, values: decoded.intensities },
              ],
            }
          : {}),
      },
    };
  },
};

export interface DecodedScanPoints {
  readonly intensities?: Float32Array;
  readonly positions: Float32Array;
}

export function scanToPoints({
  endAngle,
  intensities,
  pose,
  ranges,
  startAngle,
}: {
  readonly endAngle: number;
  readonly intensities?: readonly number[];
  readonly pose: ProtobufPose3D;
  readonly ranges: readonly number[];
  readonly startAngle: number;
}): DecodedScanPoints {
  // Bearings span start..end inclusive; a single-return scan sits at start.
  const angleStep =
    ranges.length > 1 ? (endAngle - startAngle) / (ranges.length - 1) : 0;
  const transform = poseTransform(pose);
  const positions = new Float32Array(
    ranges.length * LASER_SCAN_POINT_COMPONENT_COUNT,
  );
  const scanIntensities = intensities
    ? new Float32Array(ranges.length)
    : undefined;
  let pointCount = 0;

  for (let index = 0; index < ranges.length; index++) {
    const range = ranges[index];
    // Non-finite ranges are "no return" samples; dropping them keeps
    // positions, bounds, and scalar channels aligned and NaN-free.
    if (!Number.isFinite(range)) {
      continue;
    }

    const angle = startAngle + angleStep * index;
    const offset = pointCount * LASER_SCAN_POINT_COMPONENT_COUNT;
    transform(
      positions,
      offset,
      range * Math.cos(angle),
      range * Math.sin(angle),
    );
    if (scanIntensities) {
      scanIntensities[pointCount] = intensities?.[index] ?? 0;
    }
    pointCount++;
  }

  // Dropped no-return samples leave a partially filled tail; copy down to
  // exact-size arrays so consumers and worker transfer see only real points.
  if (pointCount === ranges.length) {
    return {
      ...(scanIntensities ? { intensities: scanIntensities } : {}),
      positions,
    };
  }

  return {
    ...(scanIntensities
      ? { intensities: scanIntensities.slice(0, pointCount) }
      : {}),
    positions: positions.slice(
      0,
      pointCount * LASER_SCAN_POINT_COMPONENT_COUNT,
    ),
  };
}

type WritePoint = (
  positions: Float32Array,
  offset: number,
  x: number,
  y: number,
) => void;

function poseTransform(pose: ProtobufPose3D): WritePoint {
  const [px, py, pz] = pose.position;
  const normalized = normalizedQuaternion(pose.quaternion);

  if (!normalized && px === 0 && py === 0 && pz === 0) {
    return (positions, offset, x, y) => {
      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = 0;
    };
  }

  const [qx, qy, qz, qw] = normalized ?? [0, 0, 0, 1];

  return (positions, offset, x, y) => {
    // Quaternion-rotate the in-plane point v = (x, y, 0) via
    // t = 2(q_vec × v); v' = v + w·t + q_vec × t, then translate.
    const tx = -2 * qz * y;
    const ty = 2 * qz * x;
    const tz = 2 * (qx * y - qy * x);
    positions[offset] = px + x + qw * tx + qy * tz - qz * ty;
    positions[offset + 1] = py + y + qw * ty + qz * tx - qx * tz;
    positions[offset + 2] = pz + qw * tz + qx * ty - qy * tx;
  };
}

function numberArrayField(
  record: Record<string, unknown>,
  field: string,
): readonly number[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) =>
    typeof entry === "number"
      ? entry
      : typeof entry === "bigint"
        ? Number(entry)
        : Number.NaN,
  );
}
