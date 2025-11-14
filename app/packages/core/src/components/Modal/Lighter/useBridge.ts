/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import {
  useAnnotationEventHandler,
  useAnnotationPersistence,
} from "@fiftyone/annotation";
import { LIGHTER_EVENTS, Scene2D, UpdateLabelCommand } from "@fiftyone/lighter";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { currentData, currentOverlay } from "../Sidebar/Annotate/Edit/state";
import { coerceStringBooleans } from "../Sidebar/Annotate/utils";
import useColorMappingContext from "./useColorMappingContext";
import { useLighterTooltipEventHandler } from "./useLighterTooltipEventHandler";

/**
 * Hook that bridges FiftyOne state management system with Lighter.
 *
 * This is two-way:
 * 1. We listen to certain events from "FiftyOne state" world and react to them, or
 * 2. We trigger certain events into "FiftyOne state" world based on user interactions in Lighter.
 */
export const useBridge = (scene: Scene2D | null) => {
  useLighterTooltipEventHandler(scene);

  useAnnotationPersistence();

  const save = useSetAtom(currentData);
  const overlay = useAtomValue(currentOverlay);

  useAnnotationEventHandler(
    "annotation:notification:sidebarValueUpdated",
    useCallback(
      (payload) => {
        if (!scene) {
          return;
        }

        const overlay = scene.getOverlay(payload.overlayId);

        if (!overlay) {
          return;
        }

        scene.executeCommand(
          new UpdateLabelCommand(overlay, payload.currentLabel, payload.value)
        );
      },
      [scene]
    )
  );

  useEffect(() => {
    if (!scene) {
      return;
    }

    const handler = (event: any) => {
      // Here, this would be true for `undo` or `redo`
      if (!(event.detail?.command instanceof UpdateLabelCommand)) {
        const label = overlay?.label;

        if (label) {
          save(label);
        }

        return;
      }

      const newLabel = coerceStringBooleans(event.detail.command.nextLabel);

      if (newLabel) {
        save(newLabel);
      }
    };

    scene.on(LIGHTER_EVENTS.COMMAND_EXECUTED, handler);
    scene.on(LIGHTER_EVENTS.REDO, handler);
    scene.on(LIGHTER_EVENTS.UNDO, handler);

    return () => {
      scene.off(LIGHTER_EVENTS.COMMAND_EXECUTED, handler);
      scene.off(LIGHTER_EVENTS.REDO, handler);
      scene.off(LIGHTER_EVENTS.UNDO, handler);
    };
  }, [scene, overlay, save]);

  const context = useColorMappingContext();

  // Effect to update scene with color scheme changes
  useEffect(() => {
    if (!scene) {
      return;
    }

    // Update the scene's color mapping context
    scene.updateColorMappingContext(context);

    // Mark all overlays as dirty to trigger re-rendering with new colors
    for (const overlay of scene.getAllOverlays()) {
      overlay.markDirty();
    }
  }, [scene, context]);
};
