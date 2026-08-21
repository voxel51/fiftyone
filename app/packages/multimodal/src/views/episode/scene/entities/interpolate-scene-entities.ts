/**
 * Pure geometry engine for interpolating decoded 3D scene entities between two
 * cached SceneUpdate messages at a sub-message playhead position. Intentionally
 * free of React, cache, and timeline concerns so it can be unit-tested in
 * isolation; the React/cache wiring lives in `use-interpolated-scene-updates`.
 *
 * 3D label streams typically arrive at ~2 Hz against much faster transforms,
 * so held boxes visibly snap every label tick while ego motion glides. To
 * bridge that we lerp entity geometry between the previous and next message.
 *
 * Unlike 2D image annotations, Foxglove SceneUpdate entities carry stable
 * `id`s, so matching is exact: entities are paired by id, matched pairs lerp
 * their primitive poses (and sizes), and unmatched prev entities stay put.
 * Entities that only exist in the next message do not appear until that
 * message becomes current — symmetric with the 2D interpolation policy.
 */
import { Quaternion } from "three";

import type {
  SceneArrowPrimitive,
  SceneCubePrimitive,
  SceneCylinderPrimitive,
  SceneEntityVisualization,
  SceneLinePrimitive,
  SceneModelPrimitive,
  ScenePoint3d,
  ScenePose3d,
  SceneSpherePrimitive,
  SceneTextPrimitive,
  SceneTrianglePrimitive,
  SceneUpdateVisualization,
} from "../../../../ir/index";

/**
 * Interpolates `prev` toward `next` by fraction `f` in [0, 1]. When
 * `atTimeNs` is provided, interpolated entities are restamped to it so
 * downstream frame placement resolves transforms at the synthesized time
 * rather than at the previous message's time.
 */
export function interpolateSceneUpdate(
  prev: SceneUpdateVisualization,
  next: SceneUpdateVisualization,
  f: number,
  atTimeNs?: bigint,
): SceneUpdateVisualization {
  const nextById = indexSceneEntitiesByStableId(next.entities);

  return {
    ...prev,
    entities: prev.entities.map((entity) => {
      const match = entity.id ? nextById.get(entity.id) : undefined;
      // Entities are only comparable within one coordinate frame; a frame
      // hop between messages is a re-parent, not motion.
      if (
        !match ||
        match.frameId !== entity.frameId ||
        !hasCompatiblePrimitiveFamily(entity, match)
      ) {
        return entity;
      }
      return interpolateSceneEntity(entity, match, f, atTimeNs);
    }),
  };
}

/** Whether an update pair contains geometry safe to synthesize by stable ID. */
export function hasInterpolatableSceneEntityPair(
  prev: SceneUpdateVisualization,
  next: SceneUpdateVisualization,
): boolean {
  const nextById = indexSceneEntitiesByStableId(next.entities);
  return prev.entities.some((entity) => {
    if (!entity.id) return false;
    const match = nextById.get(entity.id);
    return (
      match !== undefined &&
      match.frameId === entity.frameId &&
      hasCompatiblePrimitiveFamily(entity, match)
    );
  });
}

function indexSceneEntitiesByStableId(
  entities: readonly SceneEntityVisualization[],
): ReadonlyMap<string, SceneEntityVisualization> {
  const byId = new Map<string, SceneEntityVisualization>();
  for (const entity of entities) {
    if (entity.id && !byId.has(entity.id)) {
      byId.set(entity.id, entity);
    }
  }
  return byId;
}

/**
 * Interpolates one id-matched entity pair. Primitive families lerp pairwise
 * by index when their lengths match; a count change means objects appeared
 * or disappeared, so the family holds the previous geometry instead of
 * lerping mismatched pairs.
 */
export function interpolateSceneEntity(
  prev: SceneEntityVisualization,
  next: SceneEntityVisualization,
  f: number,
  atTimeNs?: bigint,
): SceneEntityVisualization {
  return {
    ...prev,
    ...(atTimeNs !== undefined ? { timestampNs: atTimeNs } : {}),
    arrows: lerpFamily(prev.arrows, next.arrows, f, lerpArrow),
    cubes: lerpFamily(prev.cubes, next.cubes, f, lerpCube),
    cylinders: lerpFamily(prev.cylinders, next.cylinders, f, lerpCylinder),
    lines: lerpFamily(prev.lines, next.lines, f, lerpLine),
    models: lerpFamily(prev.models, next.models, f, lerpModel),
    spheres: lerpFamily(prev.spheres, next.spheres, f, lerpSphere),
    texts: lerpFamily(prev.texts, next.texts, f, lerpText),
    triangles: lerpFamily(prev.triangles, next.triangles, f, lerpTriangle),
  };
}

function hasCompatiblePrimitiveFamily(
  prev: SceneEntityVisualization,
  next: SceneEntityVisualization,
): boolean {
  return (
    isCompatibleFamily(prev.arrows, next.arrows) ||
    isCompatibleFamily(prev.cubes, next.cubes) ||
    isCompatibleFamily(prev.cylinders, next.cylinders) ||
    isCompatibleFamily(prev.lines, next.lines) ||
    isCompatibleFamily(prev.models, next.models) ||
    isCompatibleFamily(prev.spheres, next.spheres) ||
    isCompatibleFamily(prev.texts, next.texts) ||
    isCompatibleFamily(prev.triangles, next.triangles)
  );
}

function isCompatibleFamily(
  prev: readonly unknown[],
  next: readonly unknown[],
): boolean {
  return prev.length > 0 && prev.length === next.length;
}

function lerpFamily<T>(
  prev: readonly T[],
  next: readonly T[],
  f: number,
  lerpOne: (p: T, n: T, f: number) => T,
): readonly T[] {
  if (prev.length === 0 || prev.length !== next.length) {
    return prev;
  }
  return prev.map((p, i) => lerpOne(p, next[i], f));
}

function lerpArrow(
  p: SceneArrowPrimitive,
  n: SceneArrowPrimitive,
  f: number,
): SceneArrowPrimitive {
  return {
    ...p,
    headDiameter: lerp(p.headDiameter, n.headDiameter, f),
    headLength: lerp(p.headLength, n.headLength, f),
    pose: lerpPose(p.pose, n.pose, f),
    shaftDiameter: lerp(p.shaftDiameter, n.shaftDiameter, f),
    shaftLength: lerp(p.shaftLength, n.shaftLength, f),
  };
}

function lerpCube(
  p: SceneCubePrimitive,
  n: SceneCubePrimitive,
  f: number,
): SceneCubePrimitive {
  return {
    ...p,
    pose: lerpPose(p.pose, n.pose, f),
    size: lerpPoint(p.size, n.size, f),
  };
}

function lerpCylinder(
  p: SceneCylinderPrimitive,
  n: SceneCylinderPrimitive,
  f: number,
): SceneCylinderPrimitive {
  return {
    ...p,
    bottomScale: lerp(p.bottomScale, n.bottomScale, f),
    pose: lerpPose(p.pose, n.pose, f),
    size: lerpPoint(p.size, n.size, f),
    topScale: lerp(p.topScale, n.topScale, f),
  };
}

function lerpLine(
  p: SceneLinePrimitive,
  n: SceneLinePrimitive,
  f: number,
): SceneLinePrimitive {
  return {
    ...p,
    points: lerpPoints(p.points, n.points, f),
    pose: lerpPose(p.pose, n.pose, f),
    thickness: lerp(p.thickness, n.thickness, f),
  };
}

function lerpModel(
  p: SceneModelPrimitive,
  n: SceneModelPrimitive,
  f: number,
): SceneModelPrimitive {
  return {
    ...p,
    pose: lerpPose(p.pose, n.pose, f),
    scale: lerpPoint(p.scale, n.scale, f),
  };
}

function lerpSphere(
  p: SceneSpherePrimitive,
  n: SceneSpherePrimitive,
  f: number,
): SceneSpherePrimitive {
  return {
    ...p,
    pose: lerpPose(p.pose, n.pose, f),
    size: lerpPoint(p.size, n.size, f),
  };
}

function lerpText(
  p: SceneTextPrimitive,
  n: SceneTextPrimitive,
  f: number,
): SceneTextPrimitive {
  return {
    ...p,
    fontSize: lerp(p.fontSize, n.fontSize, f),
    pose: lerpPose(p.pose, n.pose, f),
  };
}

function lerpTriangle(
  p: SceneTrianglePrimitive,
  n: SceneTrianglePrimitive,
  f: number,
): SceneTrianglePrimitive {
  return {
    ...p,
    points: lerpPoints(p.points, n.points, f),
    pose: lerpPose(p.pose, n.pose, f),
  };
}

function lerpPoints(
  prev: readonly ScenePoint3d[],
  next: readonly ScenePoint3d[],
  f: number,
): readonly ScenePoint3d[] {
  // A vertex-count change is a topology change; hold the previous shape.
  if (prev.length !== next.length) {
    return prev;
  }
  return prev.map((p, i) => lerpPoint(p, next[i], f));
}

function lerpPose(a: ScenePose3d, b: ScenePose3d, f: number): ScenePose3d {
  const rotation = new Quaternion(...a.quaternion)
    .slerp(new Quaternion(...b.quaternion), f)
    .normalize();
  return {
    position: lerpPoint(a.position, b.position, f),
    quaternion: [rotation.x, rotation.y, rotation.z, rotation.w],
  };
}

function lerpPoint(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  f: number,
): readonly [number, number, number] {
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}
