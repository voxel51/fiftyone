/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Splits cuboid detections into the single actively-edited ("hero") label,
 * if any, and every other ("batched") label — see the looker3dInstanceMesh
 * plan, §7. The edited label keeps its full interactive standalone path
 * (TransformControls, face-resize handles, orientation markers); everything
 * else renders through the batched `CuboidInstances` path. Both arrays are
 * derived from the same input list in one pass, so a box popping between the
 * two paths lands at the identical transform in the same commit — no
 * flicker or jump.
 */
export function partitionCuboidsByEditedLabel<
  T extends { label: { _id: string } },
>(
  detections: readonly T[],
  editedLabelId: string | undefined,
): { standaloneDetections: T[]; instancedDetections: T[] } {
  if (!editedLabelId) {
    return { standaloneDetections: [], instancedDetections: [...detections] };
  }

  const standalone: T[] = [];
  const instanced: T[] = [];
  for (const overlay of detections) {
    (overlay.label._id === editedLabelId ? standalone : instanced).push(
      overlay,
    );
  }
  return { standaloneDetections: standalone, instancedDetections: instanced };
}
