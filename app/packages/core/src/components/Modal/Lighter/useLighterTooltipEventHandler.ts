/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import {
  useLighterEventHandler,
  type LighterEventGroup,
  type Scene2D,
} from "@fiftyone/lighter";
import type { Hoverable } from "@fiftyone/lighter/src/types";
import * as fos from "@fiftyone/state";
import { useCallback, useEffect } from "react";
import { useRecoilCallback } from "recoil";

/**
 * Hook that handles tooltip events for lighter overlays.
 * Converts lighter hover events to tooltip state updates.
 */
export const useLighterTooltipEventHandler = (scene: Scene2D | null) => {
  const tooltip = fos.useTooltip();

  const tooltipEventHandler = useRecoilCallback(
    ({ snapshot, set }) =>
      (
        payload:
          | LighterEventGroup["lighter:overlay-hover"]
          | LighterEventGroup["lighter:overlay-unhover"]
          | LighterEventGroup["lighter:overlay-hover-move"],
        scene: Scene2D,
        isUnhover: boolean
      ) => {
        const isTooltipLocked = snapshot
          .getLoadable(fos.isTooltipLocked)
          .getValue();

        const id = payload?.id;
        const point = payload?.point;
        const overlay = scene?.getOverlay?.(id);

        if (!isUnhover) {
          if (overlay && isHoverable(overlay)) {
            overlay.forceHoverEnter();
            const tooltipInfo = overlay.getTooltipInfo();
            if (tooltipInfo) {
              set(fos.tooltipDetail, tooltipInfo);

              if (!isTooltipLocked && point) {
                // offset by canvas bounds to get tooltip coordinates
                const rect = scene.getCanvasBounds();
                const clientX = point.x + rect.left;
                const clientY = point.y + rect.top;

                tooltip.setCoords([clientX, clientY]);
              }
            }
          }
        } else if (!isTooltipLocked) {
          set(fos.tooltipDetail, null);
        }

        if (isUnhover) {
          if (overlay && isHoverable(overlay)) {
            overlay.forceHoverLeave();
          }
        }
      },
    [tooltip]
  );

  useLighterEventHandler(
    "lighter:overlay-hover",
    useCallback(
      (payload) => {
        if (scene) {
          tooltipEventHandler(payload, scene, false);
        }
      },
      [scene, tooltipEventHandler]
    )
  );

  useLighterEventHandler(
    "lighter:overlay-unhover",
    useCallback(
      (payload) => {
        if (scene) {
          tooltipEventHandler(payload, scene, true);
        }
      },
      [scene, tooltipEventHandler]
    )
  );

  useLighterEventHandler(
    "lighter:overlay-hover-move",
    useCallback(
      (payload) => {
        if (scene) {
          tooltipEventHandler(payload, scene, false);
        }
      },
      [scene, tooltipEventHandler]
    )
  );

  const handleDocumentMouseMove = useRecoilCallback(
    ({ snapshot, set }) =>
      (event: MouseEvent) => {
        const isTooltipLocked = snapshot
          .getLoadable(fos.isTooltipLocked)
          .getValue();

        if (isTooltipLocked || !scene) {
          return;
        }

        const canvas = scene.getCanvasDangerously();

        if (!canvas) {
          return;
        }

        const rect = canvas.getBoundingClientRect();

        const isOutsideCanvas =
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;

        if (isOutsideCanvas) {
          set(fos.tooltipDetail, null);
          scene?.getInteractionManager()?.resetHoveredHandler();
        }
      },
    [scene, tooltip]
  );

  useEffect(() => {
    if (!scene) {
      return;
    }

    document.addEventListener("mousemove", handleDocumentMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleDocumentMouseMove);
    };
  }, [scene, handleDocumentMouseMove]);
};

/**
 * Type guard to check if an overlay implements the Hoverable interface.
 */
function isHoverable(overlay: any): overlay is Hoverable {
  return overlay && typeof overlay.getTooltipInfo === "function";
}
