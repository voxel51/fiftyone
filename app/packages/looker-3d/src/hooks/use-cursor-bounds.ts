import { useMemo } from "react";
import { Box3 } from "three";

/**
 * Computes the cursor bounds by merging scene bounds with label bounds.
 * This is used to clamp the crosshair position to the area that includes
 * both the core scene assets and any 3D labels.
 *
 * @param sceneBoundingBox - The bounding box of the core scene assets like point clouds and meshes (excludes labels)
 * @param labelBounds - The bounding box of all 3D labels from the render model
 * @returns A Box3 representing the merged bounds for cursor clamping, or null if both inputs are null
 */
export function useCursorBounds(
  sceneBoundingBox: Box3 | null,
  labelBounds: Box3 | null
): Box3 | null {
  return useMemo(() => {
    if (!sceneBoundingBox && !labelBounds) {
      return null;
    }
    if (!sceneBoundingBox) {
      return labelBounds;
    }
    if (!labelBounds) {
      return sceneBoundingBox;
    }
    return sceneBoundingBox.clone().union(labelBounds);
  }, [sceneBoundingBox, labelBounds]);
}
