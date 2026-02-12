import { useMemo } from "react";
import type { FrustumData } from "../../frustum/types";
import type { PolylineTransformData } from "../types";
import { computePolylineProjection } from "./geometry";
import type { PolylineProjectionData } from "./types";

/**
 * Computes the 2D projection of a polyline onto an image slice.
 *
 * @param polyline - Polyline transform data (points3d, closed).
 * @param frustumData - Camera intrinsics + extrinsics for the target image slice
 */
export function useProjectedPolyline(
  polyline: PolylineTransformData | null | undefined,
  frustumData: FrustumData
): PolylineProjectionData | null {
  return useMemo(() => {
    if (!polyline) return null;
    return computePolylineProjection(polyline, frustumData);
  }, [polyline, frustumData]);
}
