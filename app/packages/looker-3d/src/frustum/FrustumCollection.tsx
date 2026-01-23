/**
 * Container component that renders all camera frustums in the scene.
 */

import { Suspense } from "react";
import { useFo3dContext } from "../fo3d/context";
import { Frustum } from "./Frustum";
import {
  useComputeFrustumGeometry,
  useFetchFrustumParameters,
} from "./hooks/internal";
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

  // Fetch frustum data (static transforms, intrinsics, image URLs)
  const { data: frustumData, isLoading, error } = useFetchFrustumParameters();

  // Compute geometry for all frustums
  const { geometries } = useComputeFrustumGeometry(
    frustumData,
    sceneBoundingBox
  );

  // Don't render if toggle is off
  if (!isVisible) {
    return null;
  }

  // Don't render while loading or if there's an error
  if (isLoading || error) {
    return null;
  }

  // Don't render if no frustum data
  if (!frustumData.length) {
    return null;
  }

  return (
    <group name="camera-frustums">
      {frustumData.map((frustum) => {
        const geometry = geometries.get(frustum.sliceName);

        // Skip if geometry couldn't be computed (invalid static transform)
        if (!geometry) {
          return null;
        }

        return (
          <Suspense key={frustum.sliceName} fallback={null}>
            <Frustum frustumData={frustum} geometry={geometry} />
          </Suspense>
        );
      })}
    </group>
  );
}
