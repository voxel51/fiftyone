import {
  KeypointOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useToolsState } from "./useToolsContext";
import { NEGATIVE_POINT_VARIANT, usePointSelection } from "./usePointSelection";
import { useCallback } from "react";

/** Minimum time the ripple ring stays on a freshly-placed point. */
const RIPPLE_VISIBLE_MS = 1200;

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
          // duration. Keeps the visual feedback decoupled from inference
          // timing — fast inference shouldn't make the indicator flash.
          const overlay = getOverlay(payload.id);
          if (overlay instanceof KeypointOverlay) {
            console.log("[ripple] point-added → start ripple", {
              pointId: payload.pointId,
              overlayId: payload.id,
            });
            overlay.addRipplePointId(payload.pointId);
            setTimeout(() => {
              console.log("[ripple] timer expired → remove ripple", {
                pointId: payload.pointId,
              });
              overlay.removeRipplePointId(payload.pointId);
            }, RIPPLE_VISIBLE_MS);
          }
        }
      },
      [addNegativePoint, addPositivePoint, getOverlay, isPointSelectionActive]
    )
  );

  useEventHandler(
    "lighter:keypoint-point-deleted",
    useCallback(
      (payload) => {
        if (isPointSelectionActive) {
          if (payload.variant === NEGATIVE_POINT_VARIANT) {
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
