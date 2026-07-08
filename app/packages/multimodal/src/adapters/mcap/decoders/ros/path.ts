import type {
  DecodeContext,
  DecodedAttributeValue,
  DecodedOutput,
  RgbaColor,
  SceneArrowPrimitive,
  SceneEntityVisualization,
  SceneLinePrimitive,
  ScenePoint3D,
  ScenePose3D,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import {
  decodePose,
  decodeVector3,
  IDENTITY_QUATERNION,
  ZERO_VECTOR3,
} from "../foxglove/protobuf/geometry";
import {
  arrayField,
  recordField,
  rosHeader,
  rosHeaderAttributes,
  rosHeaderFrameId,
  rosHeaderTimestampNs,
  timingFromRosHeader,
} from "./common";
import { rosDecodersForPayloads } from "./factory";
import { ROS_PATH_PAYLOADS, ROS_POSE_ARRAY_PAYLOADS } from "./payloads";

const PATH_COLOR: RgbaColor = [0.2, 0.72, 1, 1];
const PATH_THICKNESS = 2;
const MAX_PATH_POINTS = 4_096;
const POSE_ARRAY_COLOR: RgbaColor = [1, 0.62, 0.18, 1];
const POSE_ARROW_SHAFT_LENGTH = 0.35;
const POSE_ARROW_SHAFT_DIAMETER = 0.04;
const POSE_ARROW_HEAD_LENGTH = 0.12;
const POSE_ARROW_HEAD_DIAMETER = 0.12;
const MAX_POSE_ARRAY_ARROWS = 1_024;

/**
 * Decoders for ROS Path messages.
 */
export const rosPathDecoders = rosDecodersForPayloads({
  id: "ros.path",
  map: decodeRosPathRecord,
  payloads: ROS_PATH_PAYLOADS,
});

/**
 * Decoders for ROS PoseArray messages.
 */
export const rosPoseArrayDecoders = rosDecodersForPayloads({
  id: "ros.pose-array",
  map: decodeRosPoseArrayRecord,
  payloads: ROS_POSE_ARRAY_PAYLOADS,
});

/**
 * Normalizes a ROS nav_msgs/Path record into a SceneUpdate line-strip overlay.
 */
export function decodeRosPathRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const header = rosHeader(message);
  const frameId = rosHeaderFrameId(header);
  const timestampNs = rosHeaderTimestampNs(header);
  const points = pathPoints(message);
  const attributes: Record<string, DecodedAttributeValue> = {
    ...rosHeaderAttributes(header),
    pointCount: points.length,
    poseCount: points.length,
  };
  const entities =
    points.length > 0
      ? [
          sceneEntity({
            frameId,
            id: `${context.streamId ?? "path"}:path`,
            lines: [pathLine(points)],
            metadata: {
              poseCount: String(points.length),
              source: "nav_msgs/Path",
            },
            timestampNs,
          }),
        ]
      : [];

  return {
    attributes,
    timing: timingFromRosHeader(context, header),
    visualization: {
      deletions: [],
      entities,
      kind: VISUALIZATION_KIND.SCENE_UPDATE,
    },
  };
}

/**
 * Normalizes a ROS geometry_msgs/PoseArray record into a SceneUpdate overlay.
 * Each pose renders as one orientation arrow to keep large hypothesis clouds
 * fast enough for interactive playback.
 */
export function decodeRosPoseArrayRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const header = rosHeader(message);
  const frameId = rosHeaderFrameId(header);
  const timestampNs = rosHeaderTimestampNs(header);
  const poseRecords = arrayRecords(message, "poses");
  const renderedPoseRecords = poseRecords.slice(0, MAX_POSE_ARRAY_ARROWS);
  const renderedPoses = poseArrayPoses(renderedPoseRecords);
  const attributes: Record<string, DecodedAttributeValue> = {
    ...rosHeaderAttributes(header),
    poseCount: poseRecords.length,
    renderedPoseCount: renderedPoses.length,
  };
  if (poseRecords.length > renderedPoses.length) {
    attributes.truncatedPoseCount = poseRecords.length - renderedPoses.length;
  }
  const entities =
    renderedPoses.length > 0
      ? [
          sceneEntity({
            arrows: renderedPoses.map(poseArrow),
            frameId,
            id: `${context.streamId ?? "pose-array"}:pose-array`,
            metadata: {
              poseCount: String(poseRecords.length),
              renderedPoseCount: String(renderedPoses.length),
              source: "geometry_msgs/PoseArray",
            },
            timestampNs,
          }),
        ]
      : [];

  return {
    attributes,
    timing: timingFromRosHeader(context, header),
    visualization: {
      deletions: [],
      entities,
      kind: VISUALIZATION_KIND.SCENE_UPDATE,
    },
  };
}

function pathPoints(message: Record<string, unknown>): readonly ScenePoint3D[] {
  return arrayRecords(message, "poses")
    .slice(0, MAX_PATH_POINTS)
    .map((poseStamped) =>
      decodeVector3(
        recordField(recordField(poseStamped, "pose"), "position"),
        ZERO_VECTOR3,
      ),
    );
}

function poseArrayPoses(
  poses: readonly Record<string, unknown>[],
): readonly ScenePose3D[] {
  return poses.map((pose) => {
    const decoded = decodePose(pose);
    return {
      position: decoded.position,
      quaternion: decoded.quaternion,
    };
  });
}

function pathLine(points: readonly ScenePoint3D[]): SceneLinePrimitive {
  return {
    color: PATH_COLOR,
    colors: [],
    indices: [],
    points,
    pose: identityPose(),
    scaleInvariant: false,
    thickness: PATH_THICKNESS,
    type: "line-strip",
  };
}

function poseArrow(pose: ScenePose3D): SceneArrowPrimitive {
  return {
    color: POSE_ARRAY_COLOR,
    headDiameter: POSE_ARROW_HEAD_DIAMETER,
    headLength: POSE_ARROW_HEAD_LENGTH,
    pose,
    shaftDiameter: POSE_ARROW_SHAFT_DIAMETER,
    shaftLength: POSE_ARROW_SHAFT_LENGTH,
  };
}

function sceneEntity({
  arrows = [],
  frameId,
  id,
  lines = [],
  metadata,
  timestampNs,
}: {
  readonly arrows?: readonly SceneArrowPrimitive[];
  readonly frameId: string | undefined;
  readonly id: string;
  readonly lines?: readonly SceneLinePrimitive[];
  readonly metadata: Readonly<Record<string, string>>;
  readonly timestampNs: bigint | undefined;
}): SceneEntityVisualization {
  return {
    arrowCount: arrows.length,
    arrows,
    cubeCount: 0,
    cubes: [],
    cylinderCount: 0,
    cylinders: [],
    ...(frameId ? { frameId } : {}),
    frameLocked: false,
    id,
    lineCount: lines.length,
    lines,
    metadata,
    modelCount: 0,
    models: [],
    sphereCount: 0,
    spheres: [],
    textCount: 0,
    texts: [],
    ...(timestampNs !== undefined ? { timestampNs } : {}),
    triangleCount: 0,
    triangles: [],
  };
}

function arrayRecords(
  record: Record<string, unknown>,
  field: string,
): readonly Record<string, unknown>[] {
  return arrayField(record, field).map((value) =>
    isRecord(value) ? value : {},
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function identityPose(): ScenePose3D {
  return {
    position: ZERO_VECTOR3,
    quaternion: IDENTITY_QUATERNION,
  };
}
