/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import * as fos from "@fiftyone/state";
import { useCallback, useEffect } from "react";
import { useRecoilCallback } from "recoil";
import { LIGHTER_EVENTS, Scene2D } from "../index";
import type { Hoverable } from "../types";

/**
 * Hook that handles tooltip events for lighter overlays.
 * Converts lighter hover events to tooltip state updates.
 */
export const useLighterTooltipEventHandler = (scene: Scene2D | null) => {
  const tooltip = fos.useTooltip();

  const tooltipEventHandler = useRecoilCallback(
    ({ snapshot, set }) =>
      (event: CustomEvent, scene: Scene2D) => {
        console.log(">>> here in tooltip event handler <<<");
        const isTooltipLocked = snapshot
          .getLoadable(fos.isTooltipLocked)
          .getValue();

        if (event.detail) {
          const { id, point } = event.detail;
          const overlay = scene?.getOverlay?.(id);

          if (overlay && isHoverable(overlay)) {
            const tooltipInfo = overlay.getTooltipInfo();
            if (tooltipInfo) {
              set(fos.tooltipDetail, tooltipInfo);

              if (!isTooltipLocked && point) {
                tooltip.setCoords([point.x, point.y]);
              }
            }
          }
        } else if (!isTooltipLocked) {
          set(fos.tooltipDetail, null);
        }
      },
    [tooltip]
  );

  const handler = useCallback(
    (scene: Scene2D) => {
      const handleHover = (event: CustomEvent) => {
        tooltipEventHandler(event, scene);
      };

      const handleUnhover = (event: CustomEvent) => {
        tooltipEventHandler(event, scene);
      };

      scene.on(LIGHTER_EVENTS.OVERLAY_HOVER, handleHover);
      scene.on(LIGHTER_EVENTS.OVERLAY_UNHOVER, handleUnhover);

      return () => {
        scene.off(LIGHTER_EVENTS.OVERLAY_HOVER, handleHover);
        scene.off(LIGHTER_EVENTS.OVERLAY_UNHOVER, handleUnhover);
      };
    },
    [tooltipEventHandler]
  );

  useEffect(() => {
    if (!scene) {
      return;
    }

    return handler(scene);
  }, [scene, handler]);
};

/**
 * Type guard to check if an overlay implements the Hoverable interface.
 */
function isHoverable(overlay: any): overlay is Hoverable {
  return overlay && typeof overlay.getTooltipInfo === "function";
}
