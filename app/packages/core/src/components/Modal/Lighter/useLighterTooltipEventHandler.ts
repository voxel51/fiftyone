/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Scene2D } from "@fiftyone/lighter";
import { LIGHTER_EVENTS } from "@fiftyone/lighter";
import type { Hoverable } from "@fiftyone/lighter/src/types";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilCallback } from "recoil";

/**
 * Hook that handles tooltip events for lighter overlays.
 * Converts lighter hover events to tooltip state updates.
 */
export const useLighterTooltipEventHandler = (scene: Scene2D | null) => {
  const tooltip = fos.useTooltip();

  const tooltipEventHandler = useRecoilCallback(
    ({ snapshot, set }) =>
      (event: CustomEvent, scene: Scene2D, isUnhover: boolean) => {
        const isTooltipLocked = snapshot
          .getLoadable(fos.isTooltipLocked)
          .getValue();

        const id = event.detail?.id;
        const point = event.detail?.point;
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
            overlay.markDirty();
          }
        }
      },
    [tooltip]
  );

  useEffect(() => {
    if (!scene) {
      return;
    }

    const handleHover = (event: CustomEvent) => {
      tooltipEventHandler(event, scene, false);
    };

    const handleUnhover = (event: CustomEvent) => {
      tooltipEventHandler(event, scene, true);
    };

    const handleHoverMove = (event: CustomEvent) => {
      tooltipEventHandler(event, scene, false);
    };

    scene.on(LIGHTER_EVENTS.OVERLAY_HOVER, handleHover);
    scene.on(LIGHTER_EVENTS.OVERLAY_UNHOVER, handleUnhover);
    scene.on(LIGHTER_EVENTS.OVERLAY_HOVER_MOVE, handleHoverMove);

    return () => {
      scene.off(LIGHTER_EVENTS.OVERLAY_HOVER, handleHover);
      scene.off(LIGHTER_EVENTS.OVERLAY_UNHOVER, handleUnhover);
      scene.off(LIGHTER_EVENTS.OVERLAY_HOVER_MOVE, handleHoverMove);
    };
  }, [scene, tooltipEventHandler]);
};

/**
 * Type guard to check if an overlay implements the Hoverable interface.
 */
function isHoverable(overlay: any): overlay is Hoverable {
  return overlay && typeof overlay.getTooltipInfo === "function";
}
