import type {
  DecodeContext,
  DecodedAttributeValue,
  PoseVisualization,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import {
  decodeQuaternion,
  decodeVector3,
  type ProtobufVector3,
} from "../foxglove/protobuf/geometry";
import {
  recordField,
  rosHeader,
  rosHeaderAttributes,
  rosHeaderFrameId,
  rosHeaderTimestampNs,
  stringField,
  timingFromRosHeader,
} from "./common";
import { rosDecodersForPayloads } from "./factory";
import { ROS_ODOMETRY_PAYLOADS, ROS_POSE_STAMPED_PAYLOADS } from "./payloads";

export const rosPoseStampedDecoders = rosDecodersForPayloads({
  id: "ros.pose-stamped",
  map(message, context) {
    const header = rosHeader(message);
    const pose = recordField(message, "pose");

    return poseOutput({
      attributes: rosHeaderAttributes(header),
      context,
      header,
      pose,
    });
  },
  payloads: ROS_POSE_STAMPED_PAYLOADS,
});

export const rosOdometryDecoders = rosDecodersForPayloads({
  id: "ros.odometry",
  map(message, context) {
    const header = rosHeader(message);
    const poseWithCovariance = recordField(message, "pose");
    const twistWithCovariance = recordField(message, "twist");
    const twist = recordField(twistWithCovariance, "twist");
    const childFrameId = stringField(message, "child_frame_id");
    const attributes: Record<string, DecodedAttributeValue> = {
      ...rosHeaderAttributes(header),
    };
    if (childFrameId) {
      attributes.childFrameId = childFrameId;
    }

    return poseOutput({
      angularVelocity: vectorOrUndefined(recordField(twist, "angular")),
      attributes,
      context,
      header,
      pose: recordField(poseWithCovariance, "pose"),
      velocity: vectorOrUndefined(recordField(twist, "linear")),
    });
  },
  payloads: ROS_ODOMETRY_PAYLOADS,
});

function poseOutput({
  angularVelocity,
  attributes,
  context,
  header,
  pose,
  velocity,
}: {
  readonly angularVelocity?: ProtobufVector3;
  readonly attributes: Record<string, DecodedAttributeValue>;
  readonly context: DecodeContext;
  readonly header: Record<string, unknown> | undefined;
  readonly pose: Record<string, unknown> | undefined;
  readonly velocity?: ProtobufVector3;
}) {
  const frameId = rosHeaderFrameId(header);
  const messageTimestamp = rosHeaderTimestampNs(header);
  const position = decodeVector3(recordField(pose, "position"));
  const quaternion = decodeQuaternion(recordField(pose, "orientation"));
  attributes.position = [position[0], position[1], position[2]];

  const visualization: PoseVisualization = {
    ...(angularVelocity ? { angularVelocity } : {}),
    ...(frameId ? { coordinateFrameId: frameId } : {}),
    kind: VISUALIZATION_KIND.POSE,
    position,
    quaternion,
    ...(messageTimestamp !== undefined
      ? { timestampNs: messageTimestamp }
      : {}),
    ...(velocity ? { velocity } : {}),
  };

  return {
    attributes,
    timing: timingFromRosHeader(context, header),
    visualization,
  };
}

function vectorOrUndefined(
  record: Record<string, unknown> | undefined,
): ProtobufVector3 | undefined {
  return record ? decodeVector3(record) : undefined;
}
