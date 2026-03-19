import { useMemo } from "react";
import type { FrustumData } from "../../frustum/types";
import type { CuboidTransformData } from "../types";
import { computeCuboidProjection } from "./geometry";
import type { CuboidProjectionData } from "./types";

/**
 * Computes the 2D projection of a cuboid onto an image slice.
 *
 * @param cuboid - Cuboid transform data (location, dimensions, rotation).
 * @param frustumData - Camera intrinsics + extrinsics for the target image slice
 */
export function useProjectedCuboid(
  cuboid: CuboidTransformData | null | undefined,
  frustumData: FrustumData
): CuboidProjectionData | null {
  return useMemo(() => {
    if (!cuboid) return null;
    return computeCuboidProjection(cuboid, frustumData);
  }, [cuboid, frustumData]);
}
