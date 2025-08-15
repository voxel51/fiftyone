/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { selectedLabels, useOnSelectLabel } from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilCallback } from "recoil";
import { LIGHTER_EVENTS, Scene2D } from "../index";

/**
 * Hook that bridges FiftyOne state management system with Lighter.
 *
 * This is two-way:
 * 1. We listen to certain events from "FiftyOne state" world and react to them, or
 * 2. We trigger certain events into "FiftyOne state" world based on user interactions in Lighter.
 */
export const useBridge = (scene: Scene2D | null) => {
  const onSelectLabel = useOnSelectLabel();

  const getSelectedLabels = useRecoilCallback(
    ({ snapshot }) =>
      async () => {
        return await snapshot.getPromise(selectedLabels);
      },
    []
  );

  // this effect is for (1) above,
  // listening to certain events from "FiftyOne state" world and reacting to them.
  useEffect(() => {
    if (!scene) {
      return;
    }

    (async () => {
      const selectedLabelsValue = await getSelectedLabels();

      for (const label of selectedLabelsValue) {
        scene.selectOverlay(label.labelId, { isBridgeLogicHandled: true });
      }
    })();

    return () => {};
  }, [scene, getSelectedLabels]);

  // this effect is for (2) above,
  // triggering certain events into "FiftyOne state" world based on user interactions in Lighter.
  useEffect(() => {
    if (!scene || !onSelectLabel) {
      return;
    }

    const handleOverlaySelect = async (event: CustomEvent) => {
      const { id, isShiftPressed, isBridgeLogicHandled } = event.detail;

      if (isBridgeLogicHandled) {
        return;
      }

      const overlay = scene.getOverlay(id);

      if (overlay) {
        const selectEvent = {
          detail: {
            id,
            field: overlay.field || "",
            frameNumber: overlay.label?.frame_number,
            sampleId: overlay.sampleId || "",
            instanceId: overlay.label?.instance?._id,
            isShiftPressed: isShiftPressed || false,
          },
        };
        await onSelectLabel(selectEvent);
      }
    };

    const handleOverlayDeselect = async (event: CustomEvent) => {
      const { id, isBridgeLogicHandled } = event.detail;

      if (isBridgeLogicHandled) {
        return;
      }

      const overlay = scene.getOverlay(id);

      if (overlay) {
        const selectEvent = {
          detail: {
            id,
            field: overlay.field || "",
            frameNumber: overlay.label?.frame_number,
            sampleId: overlay.sampleId || "",
            instanceId: overlay.label?.instance?._id,
            isShiftPressed: false,
          },
        };

        await onSelectLabel(selectEvent);
      }
    };

    const handleSelectionCleared = async (event: CustomEvent) => {
      const { isBridgeLogicHandled } = event.detail;

      if (isBridgeLogicHandled) {
        return;
      }

      const overlays = scene.getSelectedOverlays();
      const promises = overlays.map((overlay) => {
        onSelectLabel({
          detail: {
            id: overlay.id,
            isShiftPressed: false,
            instanceId: (overlay as any).label?.instance?._id,
            field: (overlay as any).field || "",
            frameNumber: (overlay as any).label?.frame_number,
            sampleId: overlay.sampleId || "",
          },
        });
      });
      await Promise.all(promises).then(() => {});
    };

    scene.on(LIGHTER_EVENTS.OVERLAY_SELECT, handleOverlaySelect);
    scene.on(LIGHTER_EVENTS.OVERLAY_DESELECT, handleOverlayDeselect);
    scene.on(LIGHTER_EVENTS.SELECTION_CLEARED, handleSelectionCleared);

    return () => {
      scene.off(LIGHTER_EVENTS.OVERLAY_SELECT, handleOverlaySelect);
      scene.off(LIGHTER_EVENTS.OVERLAY_DESELECT, handleOverlayDeselect);
      scene.off(LIGHTER_EVENTS.SELECTION_CLEARED, handleSelectionCleared);
    };
  }, [scene, onSelectLabel]);
};
