import { useSetCurrent3dAnnotationMode } from "@fiftyone/looker-3d/src/state/accessors";
import { useCallback } from "react";
import { useClassificationMode } from "./Edit/useClassificationMode";
import { useDetectionMode } from "./Edit/useDetectionMode";
import { usePolylineMode } from "./Edit/usePolylineMode";
import { useSegmentationMode } from "./Edit/useSegmentationMode";

/**
 * Returns a callback that deactivates every annotation mode (2D + 3D).
 *
 * Used to switch between modes and to clear mode state on exit, so modes do
 * not leak out of the Annotate tab.
 */
export const useDeactivateAllModes = () => {
  const { deactivateClassificationMode } = useClassificationMode();
  const { deactivateDetectionMode } = useDetectionMode();
  const { deactivateSegmentationMode } = useSegmentationMode();
  const { deactivatePolylineMode } = usePolylineMode();
  const setCurrent3dAnnotationMode = useSetCurrent3dAnnotationMode();

  return useCallback(() => {
    deactivateClassificationMode();
    deactivateDetectionMode();
    deactivateSegmentationMode();
    deactivatePolylineMode();
    setCurrent3dAnnotationMode(null);
  }, [
    deactivateClassificationMode,
    deactivateDetectionMode,
    deactivatePolylineMode,
    deactivateSegmentationMode,
    setCurrent3dAnnotationMode,
  ]);
};
