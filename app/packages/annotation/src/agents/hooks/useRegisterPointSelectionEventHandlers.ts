import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useToolsState } from "./useToolsContext";
import { usePointSelection } from "./usePointSelection";
import { useCallback } from "react";

/**
 * Hook which registers event handlers for the positive/negative point
 * selection tool.
 *
 * **Note: this hook must only be invoked in a single top-level component;
 * reuse will cause duplicate event handler registration.**
 */
export const useRegisterPointSelectionEventHandlers = () => {
  const { scene } = useLighter();
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

  useEventHandler(
    "lighter:keypoint-point-added",
    useCallback(
      (payload) => {
        if (isPointSelectionActive) {
          const descriptor = {
            id: payload.pointId,
            point: [payload.point.x, payload.point.y] as [number, number],
          };

          if (payload.onMask) {
            addNegativePoint(descriptor);
          } else {
            addPositivePoint(descriptor);
          }
        }
      },
      [addNegativePoint, addPositivePoint, isPointSelectionActive]
    )
  );

  useEventHandler(
    "lighter:keypoint-point-deleted",
    useCallback(
      (payload) => {
        if (isPointSelectionActive) {
          if (payload.onMask) {
            removeNegativePoint(payload.pointId);
          } else {
            removePositivePoint(payload.pointId);
          }
        }
      },
      [isPointSelectionActive, removeNegativePoint, removePositivePoint]
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
