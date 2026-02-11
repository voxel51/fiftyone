import { useMemo } from "react";
import { Box3, Vector3 } from "three";
import type { RenderModel } from "../annotation/store/types";
import type {
  ReconciledDetection3D,
  ReconciledPolyline3D,
} from "../annotation/types";

function computeBoundsForDetection(detection: ReconciledDetection3D): Box3 {
  const [cx, cy, cz] = detection.location;
  const [dx, dy, dz] = detection.dimensions;
  return new Box3(
    new Vector3(cx - dx / 2, cy - dy / 2, cz - dz / 2),
    new Vector3(cx + dx / 2, cy + dy / 2, cz + dz / 2)
  );
}

function computeBoundsForPolyline(polyline: ReconciledPolyline3D): Box3 {
  const box = new Box3();
  for (const segment of polyline.points3d) {
    for (const [x, y, z] of segment) {
      box.expandByPoint(new Vector3(x, y, z));
    }
  }
  return box;
}

/**
 * Computes the bounding box that encompasses all labels in the render model.
 *
 * @param renderModel - The render model containing detections and polylines
 * @returns A Box3 representing the union of all label bounds, or null if no labels exist
 */
export function useLabelBounds(renderModel: RenderModel): Box3 | null {
  return useMemo(() => {
    if (
      renderModel.detections.length === 0 &&
      renderModel.polylines.length === 0
    ) {
      return null;
    }

    const unionBox = new Box3();

    for (const detection of renderModel.detections) {
      unionBox.union(computeBoundsForDetection(detection));
    }

    for (const polyline of renderModel.polylines) {
      const polylineBounds = computeBoundsForPolyline(polyline);
      if (!polylineBounds.isEmpty()) {
        unionBox.union(polylineBounds);
      }
    }

    return unionBox.isEmpty() ? null : unionBox;
  }, [renderModel.detections, renderModel.polylines]);
}
