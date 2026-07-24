import * as THREE from "three";

import type {
  ImageAnnotationPoints,
  RgbaColor,
  SceneCubePrimitive,
  ScenePoint3d,
  SceneUpdateVisualization,
} from "../../../ir";
import { VISUALIZATION_KIND } from "../../../visualization";
import type { ImageAnnotationSetInput } from "../../../visualization/media-2d/gpu-image-annotation-preparation";
import type {
  ImageAnnotationBounds,
  ImageAnnotationLineListGroup,
} from "../../../visualization/media-2d/image-annotation-render-metadata";
import { DEFAULT_SCENE_CUBE_COLOR } from "../../../visualization/scene-3d/utils";
import { entityLabel } from "../interaction/selection/selected-object";
import type { CameraModel } from "../spatial/camera-geometry/camera-model";
import { projectCameraPoint } from "../spatial/camera-geometry/camera-model";
import type { FrameTransformResolver } from "../spatial/frame-transforms/use-frame-transforms";
import type { StreamPlaybackFrame } from "../playback/use-stream-values";

const CUBE_CORNERS = [
  [-0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5],
  [0.5, 0.5, -0.5],
  [-0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5],
  [0.5, -0.5, 0.5],
  [0.5, 0.5, 0.5],
  [-0.5, 0.5, 0.5],
] as const;

const CUBE_EDGES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
] as const;

const PROJECTION_CURVE_ERROR_PX = 0.25;
const PROJECTION_MAX_DEPTH = 8;
const CUBOID_LINE_THICKNESS_PX = 2;

type Point2 = readonly [number, number];
type Point3 = readonly [number, number, number];
type ProjectedSegment = readonly [Point2, Point2];

/**
 * Projects every cuboid in one lifecycle-resolved scene update into an image
 * annotation set. Entity-frame transforms are resolved at the same timestamp
 * semantics used by the 3D tile.
 */
export function projectSceneAnnotationsToImage({
  cameraFrameId,
  cameraModel,
  outputHeight,
  outputWidth,
  playbackFrame,
  resolve,
  stream,
}: {
  readonly cameraFrameId: string;
  readonly cameraModel: CameraModel;
  readonly outputHeight: number;
  readonly outputWidth: number;
  readonly playbackFrame: StreamPlaybackFrame<SceneUpdateVisualization>;
  readonly resolve: FrameTransformResolver;
  readonly stream: string;
}): ImageAnnotationSetInput | null {
  if (
    !cameraFrameId ||
    !validPositive(outputWidth) ||
    !validPositive(outputHeight) ||
    !validPositive(cameraModel.width) ||
    !validPositive(cameraModel.height)
  ) {
    return null;
  }

  const scaleX = outputWidth / cameraModel.width;
  const scaleY = outputHeight / cameraModel.height;
  const points: ImageAnnotationPoints[] = [];
  const lineListGroups: ImageAnnotationLineListGroup[][] = [];

  for (
    let entityIndex = 0;
    entityIndex < playbackFrame.frame.entities.length;
    entityIndex++
  ) {
    const entity = playbackFrame.frame.entities[entityIndex];
    if (!entity.frameId || entity.cubes.length === 0) {
      continue;
    }
    const timeNs = entity.frameLocked
      ? playbackFrame.requestedTimeNs
      : (entity.timestampNs ?? playbackFrame.contentTimeNs);
    const frameTransform =
      entity.frameId === cameraFrameId
        ? null
        : resolve(entity.frameId, cameraFrameId, timeNs);
    if (frameTransform && frameTransform.status !== "resolved") {
      continue;
    }

    for (
      let primitiveIndex = 0;
      primitiveIndex < entity.cubes.length;
      primitiveIndex++
    ) {
      const cube = entity.cubes[primitiveIndex];
      const segments = projectCube({
        cameraModel,
        cube,
        frameRotation: frameTransform?.transform.rotation ?? null,
        frameTranslation: frameTransform?.transform.translation ?? null,
        scaleX,
        scaleY,
      }).flatMap((segment) => {
        const clipped = clipSegmentToImage(segment, outputWidth, outputHeight);
        return clipped ? [clipped] : [];
      });
      const bounds = segmentBounds(segments);
      if (!bounds) {
        continue;
      }

      const primitive: ImageAnnotationPoints = {
        fillColor: null,
        outlineColor: cube.color,
        outlineColors: [],
        points: segments.flatMap(([start, end]) => [start, end]),
        thickness: CUBOID_LINE_THICKNESS_PX,
        type: "line-list",
      };
      const entityId = entity.id || String(entityIndex);
      const group: ImageAnnotationLineListGroup = {
        bounds,
        color: colorForCube(cube.color),
        key: `${entityId}:cube:${primitiveIndex}`,
        label: entityLabel(entity),
        points: primitive.points,
        sceneEntityId: entityId,
        segments,
      };
      points.push(primitive);
      lineListGroups.push([group]);
    }
  }

  if (points.length === 0) {
    return null;
  }

  return {
    frame: {
      circles: [],
      kind: VISUALIZATION_KIND.IMAGE_ANNOTATIONS,
      points,
      texts: [],
    },
    renderMetadata: { lineListGroups },
    stream,
  };
}

function projectCube({
  cameraModel,
  cube,
  frameRotation,
  frameTranslation,
  scaleX,
  scaleY,
}: {
  readonly cameraModel: CameraModel;
  readonly cube: SceneCubePrimitive;
  readonly frameRotation: THREE.Quaternion | null;
  readonly frameTranslation: THREE.Vector3 | null;
  readonly scaleX: number;
  readonly scaleY: number;
}): readonly ProjectedSegment[] {
  if (!validSize(cube.size) || !validPose(cube)) {
    return [];
  }

  const cubeRotation = new THREE.Quaternion(
    ...cube.pose.quaternion,
  ).normalize();
  const cubePosition = new THREE.Vector3(...cube.pose.position);
  const sourceToCameraRotation = frameRotation
    ? new THREE.Quaternion(
        frameRotation.x,
        frameRotation.y,
        frameRotation.z,
        frameRotation.w,
      ).normalize()
    : null;
  const sourceToCameraTranslation = frameTranslation
    ? new THREE.Vector3(
        frameTranslation.x,
        frameTranslation.y,
        frameTranslation.z,
      )
    : null;
  const corners = CUBE_CORNERS.map(([x, y, z]): Point3 => {
    const corner = new THREE.Vector3(
      x * cube.size[0],
      y * cube.size[1],
      z * cube.size[2],
    )
      .applyQuaternion(cubeRotation)
      .add(cubePosition);
    if (sourceToCameraRotation) {
      corner.applyQuaternion(sourceToCameraRotation);
    }
    if (sourceToCameraTranslation) {
      corner.add(sourceToCameraTranslation);
    }
    return [corner.x, corner.y, corner.z];
  });

  return CUBE_EDGES.flatMap(([startIndex, endIndex]) =>
    projectEdge(
      corners[startIndex],
      corners[endIndex],
      cameraModel,
      scaleX,
      scaleY,
    ),
  );
}

/**
 * Adaptively projects an edge. Distorted camera models can bend a straight
 * 3D segment, while mixed valid/invalid intervals occur at the near plane or
 * camera-model domain boundary.
 */
function projectEdge(
  start: Point3,
  end: Point3,
  cameraModel: CameraModel,
  scaleX: number,
  scaleY: number,
): readonly ProjectedSegment[] {
  return projectEdgeInterval({
    cameraModel,
    depth: 0,
    end,
    endProjection: scaledProjection(cameraModel, end, scaleX, scaleY),
    scaleX,
    scaleY,
    start,
    startProjection: scaledProjection(cameraModel, start, scaleX, scaleY),
  });
}

function projectEdgeInterval({
  cameraModel,
  depth,
  end,
  endProjection,
  scaleX,
  scaleY,
  start,
  startProjection,
}: {
  readonly cameraModel: CameraModel;
  readonly depth: number;
  readonly end: Point3;
  readonly endProjection: Point2 | null;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly start: Point3;
  readonly startProjection: Point2 | null;
}): readonly ProjectedSegment[] {
  const midpoint = midpoint3(start, end);
  const midpointProjection = scaledProjection(
    cameraModel,
    midpoint,
    scaleX,
    scaleY,
  );
  if (!startProjection && !midpointProjection && !endProjection) {
    return [];
  }

  if (depth >= PROJECTION_MAX_DEPTH) {
    const projected = [startProjection, midpointProjection, endProjection];
    const segments: ProjectedSegment[] = [];
    for (let index = 0; index + 1 < projected.length; index++) {
      const projectedStart = projected[index];
      const projectedEnd = projected[index + 1];
      if (projectedStart && projectedEnd) {
        segments.push([projectedStart, projectedEnd]);
      }
    }
    return segments;
  }

  if (startProjection && midpointProjection && endProjection) {
    // Projective transforms preserve straight lines. Only distorted camera
    // models need curvature-driven tessellation.
    if (cameraModel.kind === "pinhole") {
      return [[startProjection, endProjection]];
    }
    const linearMidpoint: Point2 = [
      (startProjection[0] + endProjection[0]) / 2,
      (startProjection[1] + endProjection[1]) / 2,
    ];
    if (
      distance2(midpointProjection, linearMidpoint) <= PROJECTION_CURVE_ERROR_PX
    ) {
      return [[startProjection, endProjection]];
    }
  }

  return [
    ...projectEdgeInterval({
      cameraModel,
      depth: depth + 1,
      end: midpoint,
      endProjection: midpointProjection,
      scaleX,
      scaleY,
      start,
      startProjection,
    }),
    ...projectEdgeInterval({
      cameraModel,
      depth: depth + 1,
      end,
      endProjection,
      scaleX,
      scaleY,
      start: midpoint,
      startProjection: midpointProjection,
    }),
  ];
}

function scaledProjection(
  cameraModel: CameraModel,
  point: Point3,
  scaleX: number,
  scaleY: number,
): Point2 | null {
  const projected = projectCameraPoint(cameraModel, point);
  if (
    !projected ||
    !Number.isFinite(projected.u) ||
    !Number.isFinite(projected.v)
  ) {
    return null;
  }
  return [projected.u * scaleX, projected.v * scaleY];
}

function segmentBounds(
  segments: readonly ProjectedSegment[],
): ImageAnnotationBounds | null {
  if (segments.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [[startX, startY], [endX, endY]] of segments) {
    minX = Math.min(minX, startX, endX);
    minY = Math.min(minY, startY, endY);
    maxX = Math.max(maxX, startX, endX);
    maxY = Math.max(maxY, startY, endY);
  }
  return { maxX, maxY, minX, minY };
}

/** Clips a projected edge so offscreen/near-plane geometry cannot own picks. */
function clipSegmentToImage(
  [[startX, startY], [endX, endY]]: ProjectedSegment,
  width: number,
  height: number,
): ProjectedSegment | null {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  let startT = 0;
  let endT = 1;
  for (const [direction, distance] of [
    [-deltaX, startX],
    [deltaX, width - startX],
    [-deltaY, startY],
    [deltaY, height - startY],
  ] as const) {
    if (direction === 0) {
      if (distance < 0) return null;
      continue;
    }
    const candidate = distance / direction;
    if (direction < 0) {
      startT = Math.max(startT, candidate);
    } else {
      endT = Math.min(endT, candidate);
    }
    if (startT > endT) return null;
  }
  return [
    [startX + startT * deltaX, startY + startT * deltaY],
    [startX + endT * deltaX, startY + endT * deltaY],
  ];
}

function colorForCube(color: RgbaColor | null): string {
  const [r, g, b] = color ?? DEFAULT_SCENE_CUBE_COLOR;
  const component = (value: number) =>
    Math.round(Math.max(0, Math.min(1, value)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${component(r)}${component(g)}${component(b)}`;
}

function validPose(cube: SceneCubePrimitive): boolean {
  return (
    cube.pose.position.every(Number.isFinite) &&
    cube.pose.quaternion.every(Number.isFinite) &&
    new THREE.Quaternion(...cube.pose.quaternion).lengthSq() > 0
  );
}

function validSize(size: readonly number[]): size is ScenePoint3d {
  return size.length === 3 && size.every(validPositive);
}

function validPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function midpoint3(start: Point3, end: Point3): Point3 {
  return [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2,
  ];
}

function distance2(first: Point2, second: Point2): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}
