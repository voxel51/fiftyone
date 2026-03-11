import * as fos from "@fiftyone/state";
import { useCallback } from "react";

/**
 * Hook that provides a function to apply the appropriate visibility settings
 * for a given annotation slice.
 *
 * For 3D slices: shows 3D viewer, hides 2D viewer / carousel, pins the 3D slice
 * For other slices: shows 2D viewer, hides 3D/carousel, unpins 3D
 */
export function useApplyAnnotationSliceVisibility() {
  const { actions } = fos.useRenderConfig3d();

  return useCallback(
    (sliceName: string) => {
      actions.focusSlice(sliceName);
    },
    [actions]
  );
}
