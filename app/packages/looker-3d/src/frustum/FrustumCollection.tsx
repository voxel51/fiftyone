/**
 * Container component that renders all camera frustums in the scene.
 */

import { Suspense } from "react";
import { useFo3dContext } from "../fo3d/context";
import { computeFrustumDepth, isValidStaticTransform } from "./builders";
import { Frustum } from "./Frustum";
import { useFetchFrustumParameters } from "./hooks/internal";
import { useFrustums } from "./hooks/public";

/**
 * Renders camera frustums for all 2D slices in a grouped dataset.
 *
 * This component:
 * 1. Checks if frustums should be visible (global toggle)
 * 2. Fetches static transform/intrinsics data for all non-3D slices
 * 3. Computes frustum geometry based on scene bounds
 * 4. Renders individual Frustum components for each slice
 */
export function FrustumCollection() {
  const { isVisible } = useFrustums();
  const { sceneBoundingBox } = useFo3dContext();

  const { data: frustumData, isLoading, error } = useFetchFrustumParameters();
  const depth = computeFrustumDepth(sceneBoundingBox);
  const visibleFrustums = frustumData.filter((frustum) =>
    isValidStaticTransform(frustum.staticTransform),
  );

  if (!isVisible) {
    return null;
  }

  if (isLoading || error) {
    return null;
  }

  if (!visibleFrustums.length) {
    return null;
  }

  return (
    <group name="camera-frustums">
      {visibleFrustums.map((frustum) => (
        <Suspense key={frustum.sliceName} fallback={null}>
          <Frustum frustumData={frustum} depth={depth} />
        </Suspense>
      ))}
    </group>
  );
}
