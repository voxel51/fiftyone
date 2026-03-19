import { useMemo } from "react";
import { Vector3 } from "three";
import { staticTransformToMatrix4 } from "../../frustum/builders";
import type { FrustumData } from "../../frustum/types";
import type { PanelId } from "../../types";
import { projectToPixel } from "./geometry";
import type { ProjectedCorner } from "./types";

/**
 * Projects the current 3D raycast point onto a 2D image slice.
 *
 * Returns null when:
 * - there is no raycast data
 * - the raycast originated from the same panel (prevents redundant crosshair)
 * - frustum data is incomplete
 * - the point is behind the camera
 */
export function useProjected3dPoint(
  raycastResult: {
    worldPosition: [number, number, number] | null;
    sourcePanel: PanelId | null;
  },
  frustumData: FrustumData,
  currentPanelId: PanelId
): ProjectedCorner | null {
  return useMemo(() => {
    if (!raycastResult.worldPosition || !raycastResult.sourcePanel) {
      return null;
    }

    if (raycastResult.sourcePanel === currentPanelId) {
      return null;
    }

    if (!frustumData.intrinsics || !frustumData.staticTransform) {
      return null;
    }

    const worldPoint = new Vector3(...raycastResult.worldPosition);
    const camToWorld = staticTransformToMatrix4(frustumData.staticTransform);
    const worldToCam = camToWorld.clone().invert();

    return projectToPixel(worldPoint, worldToCam, frustumData.intrinsics);
  }, [raycastResult, frustumData, currentPanelId]);
}
