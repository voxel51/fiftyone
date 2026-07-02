import type {
  DecodedAttributeValue,
  Decoder,
  PoseVisualization,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { decodeProtobufMessage } from "./protobuf";
import { FOXGLOVE_POSE_IN_FRAME_PAYLOAD } from "./protobuf/payloads";
import { optionalRecord, optionalString } from "./protobuf/records";
import { timingFromContext, timestampNs } from "./protobuf/timing";

/**
 * Decoder for Foxglove PoseInFrame protobuf messages. Emits one pose
 * sample of the normalized ego-pose stream; kinematics stay undefined
 * because the schema carries none.
 */
export const foxglovePoseInFrameDecoder: Decoder = {
  id: "foxglove.pose-in-frame",
  payload: FOXGLOVE_POSE_IN_FRAME_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(
      bytes,
      FOXGLOVE_POSE_IN_FRAME_PAYLOAD,
      context,
    );
    const frameId = optionalString(message, "frameId", "frame_id");
    const messageTimestamp = timestampNs(optionalRecord(message, "timestamp"));
    const pose = optionalRecord(message, "pose");
    const position = decodeVector3(pose && optionalRecord(pose, "position"));
    const quaternion = decodeQuaternion(
      pose && optionalRecord(pose, "orientation"),
    );

    const attributes: Record<string, DecodedAttributeValue> = {
      position: [position[0], position[1], position[2]],
    };
    if (frameId) {
      attributes.frameId = frameId;
    }

    const visualization: PoseVisualization = {
      ...(frameId ? { coordinateFrameId: frameId } : {}),
      kind: VISUALIZATION_KIND.POSE,
      position,
      quaternion,
      ...(messageTimestamp !== undefined
        ? { timestampNs: messageTimestamp }
        : {}),
    };

    return {
      attributes,
      timing: timingFromContext(context, messageTimestamp),
      visualization,
    };
  },
};

function decodeVector3(
  record: Record<string, unknown> | undefined,
): readonly [number, number, number] {
  return [
    numberField(record, "x"),
    numberField(record, "y"),
    numberField(record, "z"),
  ];
}

function decodeQuaternion(
  record: Record<string, unknown> | undefined,
): readonly [number, number, number, number] {
  return [
    numberField(record, "x"),
    numberField(record, "y"),
    numberField(record, "z"),
    numberField(record, "w", 1),
  ];
}

function numberField(
  record: Record<string, unknown> | undefined,
  field: string,
  defaultValue = 0,
): number {
  const value = record?.[field];
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return defaultValue;
}
