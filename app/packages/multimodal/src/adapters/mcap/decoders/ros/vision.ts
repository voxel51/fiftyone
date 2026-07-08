import type {
  DecodeContext,
  DecodedAttributeValue,
  DecodedOutput,
  ImageAnnotationPoints,
  ImageAnnotationText,
  RgbaColor,
  SceneCubePrimitive,
  SceneEntityDeletionVisualization,
  SceneEntityVisualization,
  ScenePose3D,
  SceneTextPrimitive,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import {
  decodePose,
  decodeVector3,
  IDENTITY_QUATERNION,
} from "../foxglove/protobuf/geometry";
import {
  arrayField,
  numberField,
  recordField,
  rosHeader,
  rosHeaderAttributes,
  rosHeaderFrameId,
  rosHeaderTimestampNs,
  timingFromRosHeader,
} from "./common";
import { rosDecodersForPayloads } from "./factory";
import {
  ROS_DETECTION_2D_ARRAY_PAYLOADS,
  ROS_DETECTION_3D_ARRAY_PAYLOADS,
} from "./payloads";

const BOX_2D_COLOR: RgbaColor = [0.16, 0.9, 0.42, 1];
const BOX_2D_FILL: RgbaColor = [0.16, 0.9, 0.42, 0.08];
const BOX_2D_LABEL_BACKGROUND: RgbaColor = [0, 0, 0, 0.72];
const BOX_2D_THICKNESS = 2;
const BOX_2D_FONT_SIZE = 14;

const BOX_3D_COLOR: RgbaColor = [0.16, 0.9, 0.42, 0.35];
const BOX_3D_LABEL_COLOR: RgbaColor = [0.9, 1, 0.92, 1];
const BOX_3D_LABEL_FONT_SIZE = 16;

interface DetectionLabel {
  readonly classId: string;
  readonly score?: number;
  readonly text: string;
}

/**
 * Decoders for ROS vision Detection2DArray messages.
 */
export const rosDetection2DArrayDecoders = rosDecodersForPayloads({
  id: "ros.detection-2d-array",
  map: decodeRosDetection2DArrayRecord,
  payloads: ROS_DETECTION_2D_ARRAY_PAYLOADS,
});

/**
 * Decoders for ROS vision Detection3DArray messages.
 */
export const rosDetection3DArrayDecoders = rosDecodersForPayloads({
  id: "ros.detection-3d-array",
  map: decodeRosDetection3DArrayRecord,
  payloads: ROS_DETECTION_3D_ARRAY_PAYLOADS,
});

/**
 * Normalizes a ROS vision_msgs/Detection2DArray record into image overlays.
 */
export function decodeRosDetection2DArrayRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const header = rosHeader(message);
  const detections = detectionRecords(message);
  const detectionBoxes = detections.map(detection2DBox);
  const boxes = detectionBoxes.filter(isPresent);
  const labels = detections
    .map((detection, index) =>
      detection2DText(detection, detectionBoxes[index]),
    )
    .filter(isPresent);
  const classIds = uniqueClassIds(detections);

  return {
    attributes: detectionAttributes({
      boxCount: boxes.length,
      classIds,
      detectionCount: detections.length,
      header,
      textCount: labels.length,
    }),
    timing: timingFromRosHeader(context, header),
    visualization: {
      circles: [],
      kind: VISUALIZATION_KIND.IMAGE_ANNOTATIONS,
      points: boxes,
      texts: labels,
    },
  };
}

/**
 * Normalizes a ROS vision_msgs/Detection3DArray record into transient 3D
 * scene overlays.
 */
export function decodeRosDetection3DArrayRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const header = rosHeader(message);
  const frameId = rosHeaderFrameId(header);
  const timestampNs = rosHeaderTimestampNs(header);
  const detections = detectionRecords(message);
  const entities = detections
    .map((detection, index) =>
      detection3DEntity({
        context,
        detection,
        frameId,
        index,
        timestampNs,
      }),
    )
    .filter(isPresent);
  const classIds = uniqueClassIds(detections);
  const deletions: readonly SceneEntityDeletionVisualization[] =
    timestampNs !== undefined
      ? [{ id: "", timestampNs, type: "all" }]
      : [{ id: "", type: "all" }];

  return {
    attributes: detectionAttributes({
      boxCount: entities.length,
      classIds,
      detectionCount: detections.length,
      header,
      textCount: sum(entities, (entity) => entity.textCount),
    }),
    timing: timingFromRosHeader(context, header),
    visualization: {
      deletions,
      entities,
      kind: VISUALIZATION_KIND.SCENE_UPDATE,
    },
  };
}

function detection2DBox(
  detection: Record<string, unknown>,
): ImageAnnotationPoints | null {
  const bbox = recordField(detection, "bbox");
  if (!bbox) {
    return null;
  }
  const width = numberField(bbox, "size_x", "sizeX", Number.NaN);
  const height = numberField(bbox, "size_y", "sizeY", Number.NaN);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return {
    fillColor: BOX_2D_FILL,
    outlineColor: BOX_2D_COLOR,
    outlineColors: [],
    points: rotatedBoxCorners({
      center: detection2DCenter(bbox),
      height,
      theta: detection2DTheta(bbox),
      width,
    }),
    thickness: BOX_2D_THICKNESS,
    type: "line-loop",
  };
}

function detection2DText(
  detection: Record<string, unknown>,
  box: ImageAnnotationPoints | null | undefined,
): ImageAnnotationText | null {
  const label = detectionLabel(detection);
  if (!label || !box || box.points.length === 0) {
    return null;
  }
  const x = Math.min(...box.points.map((point) => point[0]));
  const y = Math.min(...box.points.map((point) => point[1]));

  return {
    backgroundColor: BOX_2D_LABEL_BACKGROUND,
    fontSize: BOX_2D_FONT_SIZE,
    position: [x, Math.max(0, y - BOX_2D_FONT_SIZE)],
    text: label.text,
    textColor: BOX_2D_COLOR,
  };
}

function detection3DEntity({
  context,
  detection,
  frameId,
  index,
  timestampNs,
}: {
  readonly context: DecodeContext;
  readonly detection: Record<string, unknown>;
  readonly frameId: string | undefined;
  readonly index: number;
  readonly timestampNs: bigint | undefined;
}): SceneEntityVisualization | null {
  const bbox = recordField(detection, "bbox");
  if (!bbox) {
    return null;
  }
  const size = decodeVector3(recordField(bbox, "size"));
  const cube: SceneCubePrimitive = {
    color: BOX_3D_COLOR,
    pose: decodePose(recordField(bbox, "center")),
    size,
  };
  const label = detectionLabel(detection);
  const texts = label ? [detection3DText(cube.pose, size, label.text)] : [];
  const id = detectionId(detection) ?? String(index);

  return sceneEntity({
    cubes: [cube],
    frameId,
    id: `${context.streamId ?? "detections3d"}:detection3d:${id}`,
    metadata: detectionMetadata(detection, label),
    texts,
    timestampNs,
  });
}

function detection3DText(
  pose: ScenePose3D,
  size: readonly [number, number, number],
  text: string,
): SceneTextPrimitive {
  return {
    billboard: true,
    color: BOX_3D_LABEL_COLOR,
    fontSize: BOX_3D_LABEL_FONT_SIZE,
    pose: {
      position: [
        pose.position[0],
        pose.position[1],
        pose.position[2] + Math.max(0, size[2]) / 2,
      ],
      quaternion: IDENTITY_QUATERNION,
    },
    scaleInvariant: true,
    text,
  };
}

function detectionAttributes({
  boxCount,
  classIds,
  detectionCount,
  header,
  textCount,
}: {
  readonly boxCount: number;
  readonly classIds: readonly string[];
  readonly detectionCount: number;
  readonly header: Record<string, unknown> | undefined;
  readonly textCount: number;
}): Record<string, DecodedAttributeValue> {
  return {
    ...rosHeaderAttributes(header),
    boxCount,
    classIds,
    detectionCount,
    textCount,
  };
}

function detectionRecords(
  message: Record<string, unknown>,
): readonly Record<string, unknown>[] {
  return arrayRecords(message, "detections");
}

function detectionLabel(
  detection: Record<string, unknown>,
): DetectionLabel | null {
  const result = arrayRecords(detection, "results")[0];
  if (!result) {
    return null;
  }
  const hypothesis = recordField(result, "hypothesis") ?? result;
  const classId =
    stringFromValue(hypothesis["class_id"]) ??
    stringFromValue(hypothesis["classId"]) ??
    stringFromValue(hypothesis["id"]);
  const score = numberField(hypothesis, "score", undefined, Number.NaN);
  if (!classId) {
    return null;
  }

  return {
    classId,
    ...(Number.isFinite(score) ? { score } : {}),
    text: Number.isFinite(score) ? `${classId} ${score.toFixed(2)}` : classId,
  };
}

function detectionId(detection: Record<string, unknown>): string | undefined {
  return (
    stringFromValue(detection["id"]) ??
    stringFromValue(detection["tracking_id"]) ??
    stringFromValue(detection["trackingId"])
  );
}

function detectionMetadata(
  detection: Record<string, unknown>,
  label: DetectionLabel | null,
): Readonly<Record<string, string>> {
  const metadata: Record<string, string> = {
    source: "vision_msgs",
  };
  const id = detectionId(detection);
  if (id) {
    metadata.id = id;
  }
  if (label) {
    metadata.classId = label.classId;
    if (label.score !== undefined) {
      metadata.score = label.score.toFixed(4);
    }
  }

  return metadata;
}

function uniqueClassIds(
  detections: readonly Record<string, unknown>[],
): readonly string[] {
  return [
    ...new Set(
      detections
        .map((detection) => detectionLabel(detection)?.classId)
        .filter((classId): classId is string => Boolean(classId)),
    ),
  ].sort();
}

function detection2DCenter(
  bbox: Record<string, unknown>,
): readonly [number, number] {
  const center = recordField(bbox, "center");
  const position = recordField(center, "position");
  if (position) {
    return [
      numberField(position, "x", undefined, 0),
      numberField(position, "y", undefined, 0),
    ];
  }

  return [
    numberField(center, "x", undefined, 0),
    numberField(center, "y", undefined, 0),
  ];
}

function detection2DTheta(bbox: Record<string, unknown>): number {
  return numberField(recordField(bbox, "center"), "theta", undefined, 0);
}

function rotatedBoxCorners({
  center,
  height,
  theta,
  width,
}: {
  readonly center: readonly [number, number];
  readonly height: number;
  readonly theta: number;
  readonly width: number;
}): readonly (readonly [number, number])[] {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  return [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ].map(([x, y]) => [
    center[0] + x * cos - y * sin,
    center[1] + x * sin + y * cos,
  ]);
}

function sceneEntity({
  cubes,
  frameId,
  id,
  metadata,
  texts,
  timestampNs,
}: {
  readonly cubes: readonly SceneCubePrimitive[];
  readonly frameId: string | undefined;
  readonly id: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly texts: readonly SceneTextPrimitive[];
  readonly timestampNs: bigint | undefined;
}): SceneEntityVisualization {
  return {
    arrowCount: 0,
    arrows: [],
    cubeCount: cubes.length,
    cubes,
    cylinderCount: 0,
    cylinders: [],
    ...(frameId ? { frameId } : {}),
    frameLocked: false,
    id,
    lineCount: 0,
    lines: [],
    metadata,
    modelCount: 0,
    models: [],
    sphereCount: 0,
    spheres: [],
    textCount: texts.length,
    texts,
    ...(timestampNs !== undefined ? { timestampNs } : {}),
    triangleCount: 0,
    triangles: [],
  };
}

function arrayRecords(
  record: Record<string, unknown>,
  field: string,
): readonly Record<string, unknown>[] {
  return arrayField(record, field).map(
    (value) => recordField({ value }, "value") ?? {},
  );
}

function stringFromValue(value: unknown): string | undefined {
  if (typeof value === "string" && value) {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  return undefined;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function sum<T>(values: readonly T[], select: (value: T) => number): number {
  return values.reduce((total, value) => total + select(value), 0);
}
