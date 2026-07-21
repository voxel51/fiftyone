import { Quaternion, Vector3 } from "three";

import type { DecodeContext } from "../../../../decoders";
import type {
  DecodedAttributeValue,
  DecodedOutput,
  RgbaColor,
  SceneArrowPrimitive,
  SceneCubePrimitive,
  SceneCylinderPrimitive,
  SceneEntityDeletionKind,
  SceneEntityDeletionVisualization,
  SceneEntityVisualization,
  SceneLinePrimitive,
  SceneLinePrimitiveKind,
  SceneModelPrimitive,
  ScenePoint3D,
  ScenePose3D,
  SceneSpherePrimitive,
  SceneTextPrimitive,
  SceneTrianglePrimitive,
} from "../../../../ir";
import { VISUALIZATION_KIND } from "../../../../ir";
import {
  decodePose,
  decodeQuaternion,
  decodeVector3,
  IDENTITY_QUATERNION,
  ZERO_VECTOR3,
} from "../foxglove/protobuf/geometry";
import {
  arrayField,
  numberField,
  recordField,
  rosHeader,
  rosHeaderFrameId,
  rosHeaderTimestampNs,
  rosTimestampNs,
  sceneEntityVisualization,
  stringField,
  timingFromRosHeader,
} from "./common";
import { rosDecodersForPayloads } from "./factory";
import { ROS_MARKER_ARRAY_PAYLOADS, ROS_MARKER_PAYLOADS } from "./payloads";

const MARKER_TYPE = {
  ARROW: 0,
  CUBE: 1,
  SPHERE: 2,
  CYLINDER: 3,
  LINE_STRIP: 4,
  LINE_LIST: 5,
  CUBE_LIST: 6,
  SPHERE_LIST: 7,
  POINTS: 8,
  TEXT_VIEW_FACING: 9,
  MESH_RESOURCE: 10,
  TRIANGLE_LIST: 11,
} as const;

const MARKER_ACTION = {
  ADD: 0,
  DELETE: 2,
  DELETEALL: 3,
} as const;

const MARKER_TYPE_BY_NAME: Readonly<Record<string, number>> = {
  ARROW: MARKER_TYPE.ARROW,
  CUBE: MARKER_TYPE.CUBE,
  CUBE_LIST: MARKER_TYPE.CUBE_LIST,
  CYLINDER: MARKER_TYPE.CYLINDER,
  LINE_LIST: MARKER_TYPE.LINE_LIST,
  LINE_STRIP: MARKER_TYPE.LINE_STRIP,
  MESH_RESOURCE: MARKER_TYPE.MESH_RESOURCE,
  POINTS: MARKER_TYPE.POINTS,
  SPHERE: MARKER_TYPE.SPHERE,
  SPHERE_LIST: MARKER_TYPE.SPHERE_LIST,
  TEXT_VIEW_FACING: MARKER_TYPE.TEXT_VIEW_FACING,
  TRIANGLE_LIST: MARKER_TYPE.TRIANGLE_LIST,
};

const MARKER_ACTION_BY_NAME: Readonly<Record<string, number>> = {
  ADD: MARKER_ACTION.ADD,
  DELETE: MARKER_ACTION.DELETE,
  DELETEALL: MARKER_ACTION.DELETEALL,
  MODIFY: MARKER_ACTION.ADD,
};

const DEFAULT_LINE_THICKNESS = 1;
const DEFAULT_POINT_SIZE = 0.1;
const DEFAULT_ARROW_HEAD_FRACTION = 0.2;
const MAX_POINT_MARKER_SPHERES = 512;

interface MarkerDecodeStats {
  readonly transparentMarkers: number;
  readonly unsupportedTypes: readonly string[];
}

interface MarkerEntityResult {
  readonly entity?: SceneEntityVisualization;
  readonly unsupportedType?: string;
}

/**
 * Decoders for ROS visualization Marker messages.
 */
export const rosMarkerDecoders = rosDecodersForPayloads({
  id: "ros.marker",
  map: decodeRosMarkerRecord,
  payloads: ROS_MARKER_PAYLOADS,
});

/**
 * Decoders for ROS visualization MarkerArray messages.
 */
export const rosMarkerArrayDecoders = rosDecodersForPayloads({
  id: "ros.marker-array",
  map: decodeRosMarkerArrayRecord,
  payloads: ROS_MARKER_ARRAY_PAYLOADS,
});

/**
 * Normalizes one ROS Marker into a SceneUpdate delta.
 */
export function decodeRosMarkerRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  return markerOutput([message], context);
}

/**
 * Normalizes one ROS MarkerArray into a SceneUpdate delta.
 */
export function decodeRosMarkerArrayRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  return markerOutput(
    arrayField(message, "markers").map((marker) =>
      recordField({ marker }, "marker"),
    ),
    context,
  );
}

function markerOutput(
  markers: readonly (Record<string, unknown> | undefined)[],
  context: DecodeContext,
): DecodedOutput {
  const entities: SceneEntityVisualization[] = [];
  const deletions: SceneEntityDeletionVisualization[] = [];
  const unsupportedTypes: string[] = [];
  let transparentMarkers = 0;

  for (const marker of markers) {
    if (!marker) {
      continue;
    }

    const action = markerAction(marker["action"]);
    if (action === MARKER_ACTION.DELETE || action === MARKER_ACTION.DELETEALL) {
      deletions.push(deletionForMarker(marker, context, action));
      continue;
    }

    if (markerAlpha(marker) <= 0) {
      transparentMarkers += 1;
    }

    const result = entityForMarker(marker, context);
    if (result.entity) {
      entities.push(result.entity);
    }
    if (result.unsupportedType) {
      unsupportedTypes.push(result.unsupportedType);
    }
  }

  const stats: MarkerDecodeStats = {
    transparentMarkers,
    unsupportedTypes,
  };

  return {
    attributes: markerAttributes(markers.length, entities, deletions, stats),
    timing: markerTiming(context, markers),
    visualization: {
      deletions,
      entities,
      kind: VISUALIZATION_KIND.SCENE_UPDATE,
    },
  };
}

function deletionForMarker(
  marker: Record<string, unknown>,
  context: DecodeContext,
  action: number,
): SceneEntityDeletionVisualization {
  const timestampNs = markerTimestampNs(marker);
  const type: SceneEntityDeletionKind =
    action === MARKER_ACTION.DELETEALL ? "all" : "matching-id";

  return {
    id: type === "all" ? "" : markerEntityId(marker, context),
    ...(timestampNs !== undefined ? { timestampNs } : {}),
    type,
  };
}

function entityForMarker(
  marker: Record<string, unknown>,
  context: DecodeContext,
): MarkerEntityResult {
  const markerType = markerTypeValue(marker["type"]);
  const color = markerColor(marker);
  const colors = markerColors(marker);
  const pose = markerPose(marker);
  const points = markerPoints(marker);
  const scale = markerScale(marker);
  const metadata = markerMetadata(marker, markerType);

  const base = {
    arrows: [] as SceneArrowPrimitive[],
    cubes: [] as SceneCubePrimitive[],
    cylinders: [] as SceneCylinderPrimitive[],
    lines: [] as SceneLinePrimitive[],
    models: [] as SceneModelPrimitive[],
    spheres: [] as SceneSpherePrimitive[],
    texts: [] as SceneTextPrimitive[],
    triangles: [] as SceneTrianglePrimitive[],
  };
  let unsupportedType: string | undefined;

  switch (markerType) {
    case MARKER_TYPE.ARROW:
      base.arrows.push(...markerArrows({ color, points, pose, scale }));
      break;
    case MARKER_TYPE.CUBE:
      base.cubes.push({ color, pose, size: scale });
      break;
    case MARKER_TYPE.SPHERE:
      base.spheres.push({ color, pose, size: scale });
      break;
    case MARKER_TYPE.CYLINDER:
      base.cylinders.push({
        bottomScale: 1,
        color,
        pose,
        size: scale,
        topScale: 1,
      });
      break;
    case MARKER_TYPE.LINE_STRIP:
      base.lines.push(
        markerLine({
          color,
          colors,
          points,
          pose,
          scale,
          type: "line-strip",
        }),
      );
      break;
    case MARKER_TYPE.LINE_LIST:
      base.lines.push(
        markerLine({
          color,
          colors,
          points,
          pose,
          scale,
          type: "line-list",
        }),
      );
      break;
    case MARKER_TYPE.CUBE_LIST:
      if (points.length <= MAX_POINT_MARKER_SPHERES) {
        base.cubes.push(
          ...points.map((point, index) => ({
            color: colors[index] ?? color,
            pose: composeMarkerPointPose(pose, point),
            size: scale,
          })),
        );
      } else {
        unsupportedType = `CUBE_LIST(${points.length})`;
      }
      break;
    case MARKER_TYPE.SPHERE_LIST:
      if (points.length <= MAX_POINT_MARKER_SPHERES) {
        base.spheres.push(
          ...points.map((point, index) => ({
            color: colors[index] ?? color,
            pose: composeMarkerPointPose(pose, point),
            size: scale,
          })),
        );
      } else {
        unsupportedType = `SPHERE_LIST(${points.length})`;
      }
      break;
    case MARKER_TYPE.POINTS:
      if (points.length <= MAX_POINT_MARKER_SPHERES) {
        base.spheres.push(
          ...points.map((point, index) => ({
            color: colors[index] ?? color,
            pose: composeMarkerPointPose(pose, point),
            size: markerPointSize(scale),
          })),
        );
      } else {
        unsupportedType = `POINTS(${points.length})`;
      }
      break;
    case MARKER_TYPE.TEXT_VIEW_FACING:
      base.texts.push({
        billboard: true,
        color,
        fontSize: positiveOr(scale[2], 1),
        pose,
        scaleInvariant: false,
        text: stringField(marker, "text"),
      });
      break;
    case MARKER_TYPE.MESH_RESOURCE: {
      const model = markerModel(marker, color, pose, scale);
      if (model) {
        base.models.push(model);
      } else {
        unsupportedType = "MESH_RESOURCE";
      }
      break;
    }
    case MARKER_TYPE.TRIANGLE_LIST:
      base.triangles.push({
        color,
        colors,
        indices: [],
        points,
        pose,
      });
      break;
    default:
      unsupportedType = `type:${String(marker["type"])}`;
      break;
  }

  const primitiveCount =
    base.arrows.length +
    base.cubes.length +
    base.cylinders.length +
    base.lines.length +
    base.models.length +
    base.spheres.length +
    base.texts.length +
    base.triangles.length;
  if (primitiveCount === 0) {
    return { ...(unsupportedType ? { unsupportedType } : {}) };
  }

  const header = rosHeader(marker);
  const frameId = rosHeaderFrameId(header);
  const lifetimeNs = rosTimestampNs(recordField(marker, "lifetime"));
  const timestampNs = markerTimestampNs(marker);

  const entity = sceneEntityVisualization({
    arrows: base.arrows,
    cubes: base.cubes,
    cylinders: base.cylinders,
    frameLocked: booleanField(marker, "frame_locked", "frameLocked"),
    frameId,
    id: markerEntityId(marker, context),
    lifetimeNs,
    metadata,
    lines: base.lines,
    models: base.models,
    spheres: base.spheres,
    texts: base.texts,
    timestampNs,
    triangles: base.triangles,
  });

  return {
    entity,
    ...(unsupportedType ? { unsupportedType } : {}),
  };
}

function markerArrows({
  color,
  points,
  pose,
  scale,
}: {
  readonly color: RgbaColor | null;
  readonly points: readonly ScenePoint3D[];
  readonly pose: ScenePose3D;
  readonly scale: ScenePoint3D;
}): readonly SceneArrowPrimitive[] {
  if (points.length >= 2) {
    const start = transformPointByPose(pose, points[0]);
    const end = transformPointByPose(pose, points[1]);
    const delta = new Vector3(
      end[0] - start[0],
      end[1] - start[1],
      end[2] - start[2],
    );
    const length = delta.length();
    if (!Number.isFinite(length) || length <= 0) {
      return [];
    }
    const headLength = positiveOr(
      scale[2],
      length * DEFAULT_ARROW_HEAD_FRACTION,
    );
    const shaftLength = Math.max(0, length - headLength);
    const quaternion = new Quaternion().setFromUnitVectors(
      new Vector3(1, 0, 0),
      delta.normalize(),
    );

    return [
      {
        color,
        headDiameter: positiveOr(scale[1], positiveOr(scale[0], 0.1) * 2),
        headLength,
        pose: {
          position: start,
          quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
        },
        shaftDiameter: positiveOr(scale[0], 0.05),
        shaftLength,
      },
    ];
  }

  const totalLength = positiveOr(scale[0], 1);
  const headLength = Math.min(
    totalLength,
    positiveOr(scale[2], totalLength * DEFAULT_ARROW_HEAD_FRACTION),
  );
  const headDiameter = positiveOr(scale[1], 0.2);

  return [
    {
      color,
      headDiameter,
      headLength,
      pose,
      shaftDiameter: headDiameter * 0.5,
      shaftLength: Math.max(0, totalLength - headLength),
    },
  ];
}

function markerLine({
  color,
  colors,
  points,
  pose,
  scale,
  type,
}: {
  readonly color: RgbaColor | null;
  readonly colors: readonly RgbaColor[];
  readonly points: readonly ScenePoint3D[];
  readonly pose: ScenePose3D;
  readonly scale: ScenePoint3D;
  readonly type: SceneLinePrimitiveKind;
}): SceneLinePrimitive {
  return {
    color,
    colors,
    indices: [],
    points,
    pose,
    scaleInvariant: false,
    thickness: positiveOr(scale[0], DEFAULT_LINE_THICKNESS),
    type,
  };
}

function markerModel(
  marker: Record<string, unknown>,
  color: RgbaColor | null,
  pose: ScenePose3D,
  scale: ScenePoint3D,
): SceneModelPrimitive | null {
  const url = stringField(marker, "mesh_resource", "");
  if (!url.startsWith("data:")) {
    return null;
  }

  return {
    color,
    mediaType: mediaTypeFromDataUri(url),
    overrideColor: !booleanField(marker, "mesh_use_embedded_materials"),
    pose,
    scale,
    url,
  };
}

function markerAttributes(
  markerCount: number,
  entities: readonly SceneEntityVisualization[],
  deletions: readonly SceneEntityDeletionVisualization[],
  { transparentMarkers, unsupportedTypes }: MarkerDecodeStats,
): Record<string, DecodedAttributeValue> {
  const attributes: Record<string, DecodedAttributeValue> = {
    deletionCount: deletions.length,
    entityCount: entities.length,
    markerCount,
    transparentMarkerCount: transparentMarkers,
    unsupportedMarkerCount: unsupportedTypes.length,
  };
  if (unsupportedTypes.length > 0) {
    attributes.unsupportedMarkerTypes = [...new Set(unsupportedTypes)].sort();
  }

  return attributes;
}

function markerMetadata(
  marker: Record<string, unknown>,
  markerType: number,
): Readonly<Record<string, string>> {
  const metadata: Record<string, string> = {
    id: String(integerField(marker, "id", 0)),
    namespace: stringField(marker, "ns"),
    source: "visualization_msgs/Marker",
    type: markerTypeName(markerType),
  };
  const meshResource = stringField(marker, "mesh_resource");
  if (meshResource) {
    metadata.meshResource = meshResource;
    if (!meshResource.startsWith("data:")) {
      metadata.unsupportedReason =
        "Only inline data: mesh resources are supported";
    }
  }

  return metadata;
}

function markerTiming(
  context: DecodeContext,
  markers: readonly (Record<string, unknown> | undefined)[],
) {
  const firstHeader = markers.find((marker) => marker && rosHeader(marker));
  return timingFromRosHeader(
    context,
    firstHeader ? rosHeader(firstHeader) : undefined,
  );
}

function markerTimestampNs(
  marker: Record<string, unknown>,
): bigint | undefined {
  return rosHeaderTimestampNs(rosHeader(marker));
}

function markerEntityId(
  marker: Record<string, unknown>,
  context: DecodeContext,
): string {
  const topic = context.streamId ?? "marker";
  return `${topic}:${stringField(marker, "ns")}:${integerField(marker, "id", 0)}`;
}

function markerPose(marker: Record<string, unknown>): ScenePose3D {
  const pose = decodePose(recordField(marker, "pose"));
  return {
    position: pose.position,
    quaternion: pose.quaternion,
  };
}

function markerScale(marker: Record<string, unknown>): ScenePoint3D {
  const scale = decodeVector3(recordField(marker, "scale"), [1, 1, 1]);
  return [
    positiveOr(scale[0], 1),
    positiveOr(scale[1], 1),
    positiveOr(scale[2], 1),
  ];
}

function markerPointSize(scale: ScenePoint3D): ScenePoint3D {
  return [
    positiveOr(scale[0], DEFAULT_POINT_SIZE),
    positiveOr(scale[1], DEFAULT_POINT_SIZE),
    positiveOr(scale[1], DEFAULT_POINT_SIZE),
  ];
}

function markerPoints(
  marker: Record<string, unknown>,
): readonly ScenePoint3D[] {
  return arrayField(marker, "points").map((point) =>
    decodeVector3(recordField({ point }, "point"), ZERO_VECTOR3),
  );
}

function markerColor(marker: Record<string, unknown>): RgbaColor | null {
  return colorFromRecord(recordField(marker, "color"));
}

function markerColors(marker: Record<string, unknown>): readonly RgbaColor[] {
  return arrayField(marker, "colors").map((color) =>
    colorFromRecord(recordField({ color }, "color")),
  );
}

function markerAlpha(marker: Record<string, unknown>): number {
  return markerColor(marker)?.[3] ?? 0;
}

function colorFromRecord(
  record: Record<string, unknown> | undefined,
): RgbaColor {
  return [
    numberField(record, "r", undefined, 0),
    numberField(record, "g", undefined, 0),
    numberField(record, "b", undefined, 0),
    numberField(record, "a", undefined, 0),
  ];
}

function composeMarkerPointPose(
  markerPoseValue: ScenePose3D,
  point: ScenePoint3D,
): ScenePose3D {
  return {
    position: transformPointByPose(markerPoseValue, point),
    quaternion: markerPoseValue.quaternion,
  };
}

function transformPointByPose(
  pose: ScenePose3D,
  point: ScenePoint3D,
): ScenePoint3D {
  const q = decodeQuaternion(
    {
      w: pose.quaternion[3],
      x: pose.quaternion[0],
      y: pose.quaternion[1],
      z: pose.quaternion[2],
    },
    IDENTITY_QUATERNION,
  );
  const quaternion = new Quaternion(q[0], q[1], q[2], q[3]);
  if (quaternion.lengthSq() === 0) {
    quaternion.identity();
  } else {
    quaternion.normalize();
  }
  const transformed = new Vector3(...point)
    .applyQuaternion(quaternion)
    .add(new Vector3(...pose.position));

  return [transformed.x, transformed.y, transformed.z];
}

function mediaTypeFromDataUri(uri: string): string {
  const match = /^data:([^;,]+)/.exec(uri);
  return match?.[1] || "model/gltf-binary";
}

function markerTypeValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    return MARKER_TYPE_BY_NAME[value] ?? -1;
  }
  return -1;
}

function markerAction(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    return MARKER_ACTION_BY_NAME[value] ?? MARKER_ACTION.ADD;
  }
  return MARKER_ACTION.ADD;
}

function markerTypeName(type: number): string {
  return (
    Object.entries(MARKER_TYPE_BY_NAME).find(
      ([, value]) => value === type,
    )?.[0] ?? String(type)
  );
}

function booleanField(
  record: Record<string, unknown>,
  field: string,
  fallbackField?: string,
): boolean {
  const value =
    record[field] ?? (fallbackField ? record[fallbackField] : undefined);
  return typeof value === "boolean" ? value : Boolean(value);
}

function integerField(
  record: Record<string, unknown>,
  field: string,
  defaultValue: number,
): number {
  const value = numberField(record, field, undefined, defaultValue);
  return Number.isFinite(value) ? Math.trunc(value) : defaultValue;
}

function positiveOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
