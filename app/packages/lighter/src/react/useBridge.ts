/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import {
  colorScheme,
  colorSeed,
  selectedLabels,
  useOnSelectLabel,
} from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { Scene2D } from "../index";
import { useLighterTooltipEventHandler } from "./useLighterTooltipEventHandler";

/**
 * Hook that bridges FiftyOne state management system with Lighter.
 *
 * This is two-way:
 * 1. We listen to certain events from "FiftyOne state" world and react to them, or
 * 2. We trigger certain events into "FiftyOne state" world based on user interactions in Lighter.
 */
export const useBridge = (scene: Scene2D | null) => {
  const onSelectLabel = useOnSelectLabel();
  const currentColorScheme = useRecoilValue(colorScheme);
  const currentColorSeed = useRecoilValue(colorSeed);

  useLighterTooltipEventHandler(scene);

  const getSelectedLabels = useRecoilCallback(
    ({ snapshot }) =>
      async () => {
        return await snapshot.getPromise(selectedLabels);
      },
    []
  );

  /**
   * These effects are for (1) above,
   * i.e., listening to events from "FiftyOne state" world and reacting to them.
   */

  // Effect to run during scene initialization
  // useEffect(() => {
  //   if (!scene) {
  //     return;
  //   }

  //   (async () => {
  //     const selectedLabelsValue = await getSelectedLabels();

  //     for (const label of selectedLabelsValue) {
  //       scene.selectOverlay(label.labelId, { isBridgeLogicHandled: true });
  //     }
  //   })();

  //   return () => {};
  // }, [scene, getSelectedLabels]);

  // Effect to update scene with color scheme changes
  useEffect(() => {
    if (!scene) {
      return;
    }

    // Update the scene's color mapping context
    scene.updateColorMappingContext({
      colorScheme: currentColorScheme,
      seed: currentColorSeed,
    });

    // Mark all overlays as dirty to trigger re-rendering with new colors
    scene.getAllOverlays().forEach((overlay) => {
      overlay.markDirty();
    });
  }, [scene, currentColorScheme, currentColorSeed]);

  /**
   * These effects are for (2) above,
   * i.e., triggering certain events into "FiftyOne state" world based on user interactions in Lighter.
   */

  // Effect to handle overlay selection
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
      const promises = overlays.map((overlay) =>
        onSelectLabel({
          detail: {
            id: overlay.id,
            isShiftPressed: false,
            instanceId: (overlay as any).label?.instance?._id,
            field: (overlay as any).field || "",
            frameNumber: (overlay as any).label?.frame_number,
            sampleId: overlay.sampleId || "",
          },
        })
      );
      await Promise.all(promises);
    };

    // note: in "annotate" mode, selection means "select the overlay for annotation" now
    // so we need not interface with FO just yet
    // scene.on(LIGHTER_EVENTS.OVERLAY_SELECT, handleOverlaySelect);
    // scene.on(LIGHTER_EVENTS.OVERLAY_DESELECT, handleOverlayDeselect);
    // scene.on(LIGHTER_EVENTS.SELECTION_CLEARED, handleSelectionCleared);

    return () => {
      // see note above
      // scene.off(LIGHTER_EVENTS.OVERLAY_SELECT, handleOverlaySelect);
      // scene.off(LIGHTER_EVENTS.OVERLAY_DESELECT, handleOverlayDeselect);
      // scene.off(LIGHTER_EVENTS.SELECTION_CLEARED, handleSelectionCleared);
    };
  }, [scene, onSelectLabel]);
};
