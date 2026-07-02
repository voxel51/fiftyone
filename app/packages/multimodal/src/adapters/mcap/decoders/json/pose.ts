import type {
  DecodedAttributeValue,
  Decoder,
  PoseVisualization,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
// Context-only timing helper; nothing protobuf-specific despite its home.
import { timingFromContext } from "../foxglove/protobuf/timing";
import { decodeJsonRecord, finiteNumberField, recordField } from "./decode";
import { JSON_POSE_PAYLOAD } from "./payloads";

/**
 * Decoder for JSON `Pose` messages (odometry-style exports). Field names
 * are tolerant aliases: `pos|position` (required), `orientation|quaternion`
 * (defaults to identity), `vel|velocity`, `accel|acceleration`,
 * `rotation_rate|angular_velocity` (optional).
 *
 * "Pose" is an unnamespaced, exporter-chosen schema name, so shape
 * mismatches DEGRADE instead of throwing: the synchronized-batch read
 * path has no per-message error isolation, and one throwing decoder would
 * reject whole playback windows for every topic in them. A mismatched
 * message yields attributes-only output (with a `decodeError`) that the
 * playback store drops for this topic while everything else keeps playing.
 */
export const jsonPoseDecoder: Decoder = {
  id: "json.pose",
  payload: JSON_POSE_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    let message: Record<string, unknown>;
    try {
      message = decodeJsonRecord(bytes);
    } catch (error) {
      return degraded(
        context,
        error instanceof Error ? error.message : "Invalid JSON message",
      );
    }

    const position = vector3(recordField(message, "pos", "position"));
    if (!position) {
      return degraded(context, "JSON Pose message has no numeric pos/position");
    }

    const quaternion = quaternionField(
      recordField(message, "orientation", "quaternion"),
    );
    const velocity = vector3(recordField(message, "vel", "velocity"));
    const acceleration = vector3(recordField(message, "accel", "acceleration"));
    const angularVelocity = vector3(
      recordField(message, "rotation_rate", "angular_velocity"),
    );

    const visualization: PoseVisualization = {
      ...(acceleration ? { acceleration } : {}),
      ...(angularVelocity ? { angularVelocity } : {}),
      kind: VISUALIZATION_KIND.POSE,
      position,
      quaternion,
      ...(velocity ? { velocity } : {}),
    };
    const attributes: Record<string, DecodedAttributeValue> = {
      position: [position[0], position[1], position[2]],
      ...(velocity ? { speed: Math.hypot(...velocity) } : {}),
    };

    return {
      attributes,
      timing: timingFromContext(context, undefined),
      visualization,
    };
  },
};

function degraded(
  context: Parameters<Decoder["decode"]>[1],
  decodeError: string,
) {
  return {
    attributes: { decodeError },
    timing: timingFromContext(context, undefined),
  };
}

function vector3(
  record: Record<string, unknown> | undefined,
): readonly [number, number, number] | undefined {
  if (!record) {
    return undefined;
  }

  const x = finiteNumberField(record, "x");
  const y = finiteNumberField(record, "y");
  const z = finiteNumberField(record, "z");
  if (x === undefined || y === undefined || z === undefined) {
    return undefined;
  }

  return [x, y, z];
}

function quaternionField(
  record: Record<string, unknown> | undefined,
): readonly [number, number, number, number] {
  const x = finiteNumberField(record, "x");
  const y = finiteNumberField(record, "y");
  const z = finiteNumberField(record, "z");
  const w = finiteNumberField(record, "w");
  if (
    x === undefined ||
    y === undefined ||
    z === undefined ||
    w === undefined
  ) {
    return [0, 0, 0, 1];
  }

  return [x, y, z, w];
}
