import * as THREE from "three";

import { sourcePointIndexForRenderedIndex } from "./point-cloud-colors";
import {
  gpuPointCloudDrawCount,
  gpuPointCloudSampleIndex,
} from "./gpu/gpu-point-cloud-sampling";
import type { PointCloudPanelLayer } from "./types";

/**
 * Pure math for dwell-time point picking. Points carry no r3f handlers on
 * purpose — hover-driven raycasts against 100k+ vertices on every pointer
 * move are a real cost — so the picking layer raycasts manually once the
 * pointer rests, and resolves precedence here: labeled objects (entities,
 * frustums) always win over cloud points, and a point only counts as
 * picked when its projected vertex sits within a small screen radius of
 * the pointer.
 */

/** Base pick radius around the pointer, in CSS pixels. */
export const POINT_PICK_RADIUS_PX = 6;

/** userData key marking objects whose hits suppress point picking. */
export const POINT_PICK_BLOCKING_KEY = "episodeBlocksPointPick";

/** userData value for tagging pick-blocking objects declaratively. */
export const POINT_PICK_BLOCKING_USER_DATA = {
  [POINT_PICK_BLOCKING_KEY]: true,
} as const;

/** userData key carrying a pickable points object's stream-layer id. */
export const POINT_PICK_LAYER_ID_KEY = "episodePointsLayerId";

/** One resolved point pick, still in rendered-geometry index space. */
export interface ResolvedPointPick {
  /** Rendered color of the picked vertex, when the geometry carries one. */
  readonly color: readonly [number, number, number] | null;
  readonly layerId: string;
  readonly renderedIndex: number;
  readonly worldPosition: readonly [number, number, number];
}

/**
 * Maps a rendered vertex to its packed source record. Decoder-prepared frames
 * carry the exact mapping; frames without it use the sampling-walk fallback.
 */
export function sourcePointIndexForLayerRenderedIndex(
  layer: PointCloudPanelLayer,
  maxRenderedPoints: number,
  renderedIndex: number,
): number | null {
  const payload = layer.frame.renderPayload;
  if (!payload) {
    return sourcePointIndexForRenderedIndex(
      layer.frame.positions,
      maxRenderedPoints,
      renderedIndex,
    );
  }
  const renderedPointCount = gpuPointCloudDrawCount(
    payload.sampledPointCount,
    maxRenderedPoints,
  );
  const sampleIndex = gpuPointCloudSampleIndex(
    payload.sampledPointCount,
    renderedPointCount,
    renderedIndex,
  );
  if (sampleIndex === null || sampleIndex >= payload.sourceIndices.length) {
    return null;
  }
  const sourceIndex = payload.sourceIndices[sampleIndex];
  const sourcePointCount = payload.sourcePointCount ?? layer.frame.pointCount;
  return sourceIndex < sourcePointCount ? sourceIndex : null;
}

/**
 * World-space raycaster threshold that covers `pickRadiusPx` on screen at
 * the given viewing distance. The threshold only gates candidates — the
 * screen-space filter in {@link resolvePointPick} is authoritative.
 */
export function pointPickWorldThreshold({
  camera,
  pickRadiusPx,
  referenceDistance,
  viewportHeightPx,
}: {
  readonly camera: THREE.Camera;
  readonly pickRadiusPx: number;
  readonly referenceDistance: number;
  readonly viewportHeightPx: number;
}): number {
  if (viewportHeightPx <= 0) {
    return 0;
  }

  const orthographic = camera as THREE.OrthographicCamera;
  if (orthographic.isOrthographicCamera) {
    const worldHeight =
      (orthographic.top - orthographic.bottom) /
      Math.max(orthographic.zoom, 1e-6);
    return (worldHeight / viewportHeightPx) * pickRadiusPx;
  }

  const perspective = camera as THREE.PerspectiveCamera;
  const fovRadians = ((perspective.fov ?? 50) * Math.PI) / 180;
  const distance = Math.max(referenceDistance, perspective.near ?? 0.1);
  const worldHeight = 2 * distance * Math.tan(fovRadians / 2);
  return (worldHeight / viewportHeightPx) * pickRadiusPx;
}

/**
 * Reads the world position of one vertex of a points object. Rendered
 * geometry keeps positions in the sensor frame with the frame transform
 * on a parent group, so the vertex must go through `matrixWorld`.
 */
export function pointsVertexWorldPosition(
  object: THREE.Object3D,
  index: number,
  target: THREE.Vector3,
): THREE.Vector3 | null {
  const geometry = (object as THREE.Points).geometry as
    | THREE.BufferGeometry
    | undefined;
  const attribute = geometry?.getAttribute("position") as
    | THREE.BufferAttribute
    | undefined;
  if (!attribute || index < 0 || index >= attribute.count) {
    return null;
  }

  target.fromBufferAttribute(attribute, index);
  return object.localToWorld(target);
}

/**
 * Reads the rendered (colormapped) color of one vertex of a points
 * object, so hover emphasis can complement what's actually on screen.
 */
export function pointsVertexColor(
  object: THREE.Object3D,
  index: number,
): readonly [number, number, number] | null {
  const geometry = (object as THREE.Points).geometry as
    | THREE.BufferGeometry
    | undefined;
  const attribute = geometry?.getAttribute("color") as
    | THREE.BufferAttribute
    | undefined;
  if (!attribute || index < 0 || index >= attribute.count) {
    return null;
  }

  return [attribute.getX(index), attribute.getY(index), attribute.getZ(index)];
}

/** Walks up the parent chain for the pick-blocking tag. */
export function isPointPickBlocked(object: THREE.Object3D | null): boolean {
  let current = object;
  while (current) {
    if (current.userData?.[POINT_PICK_BLOCKING_KEY]) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Finds the outermost tagged roots for the blocker-only dwell raycast.
 * Descendants of a tagged root are intentionally not added again because
 * `Raycaster.intersectObjects(..., true)` will already visit them.
 */
export function collectPointPickBlockingRoots(
  scene: THREE.Object3D,
): THREE.Object3D[] {
  const roots: THREE.Object3D[] = [];
  const visit = (object: THREE.Object3D) => {
    if (object.userData?.[POINT_PICK_BLOCKING_KEY]) {
      roots.push(object);
      return;
    }
    for (const child of object.children) {
      visit(child);
    }
  };
  visit(scene);
  return roots;
}

/** Layer (topic) id of the pickable points object owning `object`, if any. */
export function pointsLayerIdForObject(
  object: THREE.Object3D | null,
): string | null {
  let current = object;
  while (current) {
    const layerId = current.userData?.[POINT_PICK_LAYER_ID_KEY];
    if (typeof layerId === "string") {
      return layerId;
    }
    current = current.parent;
  }
  return null;
}

/**
 * Resolves one raycast's intersections into at most one point pick.
 *
 * Precedence rule: any hit on a pick-blocking object (scene annotations,
 * frustums — which handle their own selection through r3f events) voids
 * the point pick entirely; points are the fallback when nothing labeled
 * was on the ray. Among point candidates, the nearest one whose actual
 * vertex re-projects within `maxScreenDistancePx` of the pointer wins —
 * the raw ray threshold over-accepts along the view direction, and
 * `intersection.point` sits on the ray rather than on the vertex, which
 * is why the caller must measure the vertex itself via
 * `screenDistanceForPoint`.
 */
export function resolvePointPick(
  intersections: readonly THREE.Intersection[],
  screenDistanceForPoint: (worldPoint: THREE.Vector3) => number,
  maxScreenDistancePx: number,
): ResolvedPointPick | null {
  for (const intersection of intersections) {
    if (isPointPickBlocked(intersection.object)) {
      return null;
    }
  }

  const vertex = new THREE.Vector3();
  for (const intersection of intersections) {
    const layerId = pointsLayerIdForObject(intersection.object);
    if (layerId === null || intersection.index === undefined) {
      continue;
    }
    const worldVertex = pointsVertexWorldPosition(
      intersection.object,
      intersection.index,
      vertex,
    );
    if (!worldVertex) {
      continue;
    }
    if (screenDistanceForPoint(worldVertex) > maxScreenDistancePx) {
      continue;
    }
    return {
      color: pointsVertexColor(intersection.object, intersection.index),
      layerId,
      renderedIndex: intersection.index,
      worldPosition: [worldVertex.x, worldVertex.y, worldVertex.z],
    };
  }

  return null;
}
