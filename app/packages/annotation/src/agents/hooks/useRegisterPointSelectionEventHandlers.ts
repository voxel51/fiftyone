import {
  RIPPLE_VISIBLE_MS,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useToolsState } from "./useToolsContext";
import {
  NEGATIVE_POINT_VARIANT,
  usePointSelection,
  useSyncPointSelectionWithScene,
} from "./usePointSelection";
import { useCallback } from "react";
import { useKeypointRippleEffect } from "./useKeypointRippleEffect";

/**
 * Hook which registers event handlers for the positive/negative point
 * selection tool.
 *
 * **Note: this hook must only be invoked in a single top-level component;
 * reuse will cause duplicate event handler registration.**
 */
export const useRegisterPointSelectionEventHandlers = () => {
  const { scene, getOverlay } = useLighter();
  const {
    addNegativePoint,
    addPositivePoint,
    removeNegativePoint,
    removePositivePoint,
    updatePoint,
  } = useToolsState();

  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const { isActive: isPointSelectionActive } = usePointSelection();
  const { add: addRipple, remove: removeRipple } =
    useKeypointRippleEffect(getOverlay);

  // Keep overlay + interactive handler bound to the current scene across
  // sample navigation so the tool keeps working after the user moves on.
  useSyncPointSelectionWithScene();

  useEventHandler(
    "lighter:keypoint-point-added",
    useCallback(
      (payload) => {
        if (isPointSelectionActive) {
          const descriptor = {
            id: payload.pointId,
            point: [payload.point.x, payload.point.y] as [number, number],
          };

          if (payload.variant === NEGATIVE_POINT_VARIANT) {
            addNegativePoint(descriptor);
          } else {
            addPositivePoint(descriptor);
          }

          // Surface a ripple on the new point for a guaranteed-visible
          // duration. Decoupled from inference timing so fast inference
          // doesn't make the indicator flash invisibly.
          addRipple(payload.id, payload.pointId, RIPPLE_VISIBLE_MS);
        }
      },
      [addNegativePoint, addPositivePoint, addRipple, isPointSelectionActive]
    )
  );

  useEventHandler(
    "lighter:keypoint-point-deleted",
    useCallback(
      (payload) => {
        // Defensive cleanup of any active ripple. Time-based pruning in
        // the rAF loop covers finite deadlines, but indefinite ripples
        // would otherwise keep the loop alive forever once the source
        // point is gone.
        removeRipple(payload.id, payload.pointId);

        if (isPointSelectionActive) {
          if (payload.variant === NEGATIVE_POINT_VARIANT) {
            removeNegativePoint(payload.pointId);
          } else {
            removePositivePoint(payload.pointId);
          }
        }
      },
      [
        isPointSelectionActive,
        removeNegativePoint,
        removePositivePoint,
        removeRipple,
      ]
    )
  );

  useEventHandler(
    "lighter:keypoint-point-moved",
    useCallback(
      (payload) => {
        if (isPointSelectionActive) {
          updatePoint({
            id: payload.pointId,
            point: [payload.to.x, payload.to.y] as [number, number],
          });
        }
      },
      [isPointSelectionActive, updatePoint]
    )
  );
};
