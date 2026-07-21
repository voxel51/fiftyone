import type { DecodeContext, Decoder } from "../../../../decoders";
import type {
  DecodedAttributeValue,
  DecodedOutput,
  PoseVisualization,
} from "../../../../ir";
import { VISUALIZATION_KIND } from "../../../../ir";
import { rosDecodersForPayloads } from "../ros/factory";
import { decodeProtobufMessage } from "./protobuf";
import { decodeQuaternion, decodeVector3 } from "./protobuf/geometry";
import {
  FOXGLOVE_POSE_IN_FRAME_CDR_PAYLOADS,
  FOXGLOVE_POSE_IN_FRAME_PAYLOAD,
} from "./payloads";
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
    return decodeFoxglovePoseInFrameRecord(message, context);
  },
};

/**
 * Decoders for Foxglove PoseInFrame messages carried over ROS 2 CDR.
 */
export const foxglovePoseInFrameCdrDecoders = rosDecodersForPayloads({
  id: "foxglove.pose-in-frame.cdr",
  map: decodeFoxglovePoseInFrameRecord,
  payloads: FOXGLOVE_POSE_IN_FRAME_CDR_PAYLOADS,
});

export function decodeFoxglovePoseInFrameRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
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
}
