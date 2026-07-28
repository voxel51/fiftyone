import { useMemo } from "react";
import type { Box3 } from "three";
import { Vector3 } from "three";
import { useRenderModel } from "../annotation/store/renderModel";
import { DEFAULT_BOUNDING_BOX } from "../constants";
import { useCursorBounds } from "./use-cursor-bounds";
import { useLabelBounds } from "./use-label-bounds";

/**
 * Computes fallback bounds and other derived scene values for interaction state.
 */
export const useFo3dDerivedSceneState = (sceneBoundingBox: Box3 | null) => {
  const effectiveSceneBoundingBox = sceneBoundingBox || DEFAULT_BOUNDING_BOX;

  const renderModel = useRenderModel();
  const labelBounds = useLabelBounds(renderModel);
  const cursorBounds = useCursorBounds(effectiveSceneBoundingBox, labelBounds);

  const lookAt = useMemo(
    () => effectiveSceneBoundingBox.getCenter(new Vector3()),
    [effectiveSceneBoundingBox],
  );

  return {
    effectiveSceneBoundingBox,
    cursorBounds,
    lookAt,
  };
};
