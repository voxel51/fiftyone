import { useMemo } from "react";
import type { Box3 } from "three";
import {
  buildFrustumGeometry,
  computeFrustumDepth,
  isValidStaticTransform,
} from "../../builders";
import type { FrustumData, FrustumGeometry } from "../../types";

/**
 * Computes frustum geometry for all provided frustum data.
 *
 * @param frustumData - Array of frustum data from useFetchFrustumParameters
 * @param sceneBounds - Bounding box of the scene for depth scaling
 * @returns Map of slice name to computed frustum geometry
 */

export function useComputeFrustumGeometry(
  frustumData: FrustumData[],
  sceneBounds: Box3 | null
) {
  const geometries = useMemo(() => {
    const result = new Map<string, FrustumGeometry>();

    if (!frustumData.length) {
      return result;
    }

    const depth = computeFrustumDepth(sceneBounds);

    for (const frustum of frustumData) {
      if (!isValidStaticTransform(frustum.staticTransform)) {
        continue;
      }

      const geometry = buildFrustumGeometry(
        frustum.staticTransform,
        frustum.intrinsics,
        depth,
        frustum.imageAspectRatio
      );

      result.set(frustum.sliceName, geometry);
    }

    return result;
  }, [frustumData, sceneBounds]);

  return { geometries };
}
