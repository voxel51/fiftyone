/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useOnSelectLabel } from "@fiftyone/state";
import { useEffect } from "react";
import { LIGHTER_EVENTS, Scene2D } from "../index";

/**
 * Hook that bridges FiftyOne state management system with Lighter.
 */
export const useBridge = (scene: Scene2D | null) => {
  const onSelectLabel = useOnSelectLabel();

  useEffect(() => {
    if (!scene || !onSelectLabel) {
      return;
    }

    const handleOverlaySelect = (event: CustomEvent) => {
      const { id, isShiftPressed } = event.detail;
      const overlay = scene.getOverlay(id);

      if (overlay) {
        const selectEvent = {
          detail: {
            id,
            field: (overlay as any).field || "",
            frameNumber: (overlay as any).label?.frame_number,
            sampleId: (overlay as any).sampleId || "",
            instanceId: (overlay as any).label?.instance?._id,
            isShiftPressed: isShiftPressed || false,
          },
        };
        // punting to next tick to avoid race condition
        // hacky but this is how useOnSelectLabel is implemented :(
        setTimeout(() => onSelectLabel(selectEvent), 0);
      }
    };

    const handleOverlayDeselect = (event: CustomEvent) => {
      const { id } = event.detail;
      const overlay = scene.getOverlay(id);

      if (overlay) {
        const selectEvent = {
          detail: {
            id,
            field: (overlay as any).field || "",
            frameNumber: (overlay as any).label?.frame_number,
            sampleId: (overlay as any).sampleId || "",
            instanceId: (overlay as any).label?.instance?._id,
            isShiftPressed: false,
          },
        };
        // punting to next tick to avoid race condition
        // hacky but this is how useOnSelectLabel is implemented :(
        setTimeout(() => onSelectLabel(selectEvent), 0);
      }
    };

    scene.on(LIGHTER_EVENTS.OVERLAY_SELECT, handleOverlaySelect);
    scene.on(LIGHTER_EVENTS.OVERLAY_DESELECT, handleOverlayDeselect);

    return () => {
      scene.off(LIGHTER_EVENTS.OVERLAY_SELECT, handleOverlaySelect);
      scene.off(LIGHTER_EVENTS.OVERLAY_DESELECT, handleOverlayDeselect);
    };
  }, [scene, onSelectLabel]);
};
