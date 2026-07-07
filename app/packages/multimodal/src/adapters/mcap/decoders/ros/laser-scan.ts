import {
  resourceHintsForArrayBufferViews,
  type DecodedAttributeValue,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { scanToPoints } from "../foxglove/laser-scan";
import {
  IDENTITY_QUATERNION,
  ZERO_VECTOR3,
  type ProtobufPose3D,
} from "../foxglove/protobuf/geometry";
import {
  numberArrayField,
  numberField,
  rosHeader,
  rosHeaderAttributes,
  rosHeaderFrameId,
  timingFromRosHeader,
} from "./common";
import { rosDecodersForPayloads } from "./factory";
import { ROS_LASER_SCAN_PAYLOADS } from "./payloads";

const POINT_COMPONENT_COUNT = 3;
const INTENSITY_FIELD_NAME = "intensity";
const IDENTITY_POSE: ProtobufPose3D = {
  position: ZERO_VECTOR3,
  quaternion: IDENTITY_QUATERNION,
};

export const rosLaserScanDecoders = rosDecodersForPayloads({
  id: "ros.laser-scan",
  map(message, context) {
    const header = rosHeader(message);
    const frameId = rosHeaderFrameId(header);
    const startAngle = numberField(message, "angle_min");
    const angleMax = numberField(message, "angle_max", undefined, startAngle);
    const angleIncrement = numberField(message, "angle_increment");
    const rawRanges = numberArrayField(message, "ranges");
    const intensities = numberArrayField(message, "intensities");
    const rangeMin = numberField(message, "range_min", undefined, Number.NaN);
    const rangeMax = numberField(message, "range_max", undefined, Number.NaN);
    const ranges = boundedRanges(rawRanges, rangeMin, rangeMax);
    const endAngle =
      Number.isFinite(angleIncrement) &&
      angleIncrement !== 0 &&
      ranges.length > 1
        ? startAngle + angleIncrement * (ranges.length - 1)
        : angleMax;
    const decoded = scanToPoints({
      endAngle,
      intensities:
        intensities.length === ranges.length ? intensities : undefined,
      pose: IDENTITY_POSE,
      ranges,
      startAngle,
    });
    const pointCount = decoded.positions.length / POINT_COMPONENT_COUNT;

    const attributes: Record<string, DecodedAttributeValue> = {
      ...rosHeaderAttributes(header),
      angleIncrement,
      angleMax,
      pointCount,
      rangeCount: rawRanges.length,
      startAngle,
    };
    if (Number.isFinite(rangeMin)) {
      attributes.rangeMin = rangeMin;
    }
    if (Number.isFinite(rangeMax)) {
      attributes.rangeMax = rangeMax;
    }

    const transferableViews = [
      decoded.positions,
      ...(decoded.intensities ? [decoded.intensities] : []),
    ];

    return {
      attributes,
      resourceHints: resourceHintsForArrayBufferViews(...transferableViews),
      timing: timingFromRosHeader(context, header),
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
  payloads: ROS_LASER_SCAN_PAYLOADS,
});

function boundedRanges(
  ranges: readonly number[],
  rangeMin: number,
  rangeMax: number,
): readonly number[] {
  if (!Number.isFinite(rangeMin) && !Number.isFinite(rangeMax)) {
    return ranges;
  }

  return ranges.map((range) => {
    if (!Number.isFinite(range)) {
      return range;
    }
    if (Number.isFinite(rangeMin) && range < rangeMin) {
      return Number.NaN;
    }
    if (Number.isFinite(rangeMax) && range > rangeMax) {
      return Number.NaN;
    }
    return range;
  });
}
