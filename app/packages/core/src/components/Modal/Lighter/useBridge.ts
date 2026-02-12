/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAnnotationEventHandler } from "@fiftyone/annotation";
import {
  UpdateLabelCommand,
  useLighterEventBus,
  useLighterEventHandler,
  type LighterEventGroup,
  type Scene2D,
} from "@fiftyone/lighter";
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
export const useBridge = (scene: Scene2D | null, sceneId: string) => {
  useLighterTooltipEventHandler(scene, sceneId);
  const eventBus = useLighterEventBus(sceneId);
  const useEventHandler = useLighterEventHandler(sceneId);
  const save = useSetAtom(currentData);
  const overlay = useAtomValue(currentOverlay);

  useAnnotationEventHandler(
    "annotation:sidebarValueUpdated",
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

  useAnnotationEventHandler(
    "annotation:sidebarLabelHover",
    useCallback(
      (payload) => {
        if (!scene) {
          return;
        }

        eventBus.dispatch("lighter:do-overlay-hover", {
          id: payload.id,
          tooltip: payload.tooltip ?? false,
        });
      },
      [scene, eventBus]
    )
  );

  useAnnotationEventHandler(
    "annotation:sidebarLabelUnhover",
    useCallback(
      (payload) => {
        if (!scene) {
          return;
        }

        eventBus.dispatch("lighter:do-overlay-unhover", {
          id: payload.id,
        });
      },
      [scene, eventBus]
    )
  );

  const handleCommandEvent = useCallback(
    (
      payload:
        | LighterEventGroup["lighter:command-executed"]
        | LighterEventGroup["lighter:undo"]
        | LighterEventGroup["lighter:redo"]
    ) => {
      // Here, this would be true for `undo` or `redo`
      if (
        !("command" in payload) ||
        !(payload.command instanceof UpdateLabelCommand)
      ) {
        const label = overlay?.label;

        if (label) {
          save(label);
        }

        return;
      }

      if (!payload.command.nextLabel) {
        return;
      }

      const newLabel = coerceStringBooleans(
        payload.command.nextLabel as Record<string, unknown>
      );

      if (newLabel) {
        save(newLabel);
      }
    },
    [overlay, save]
  );

  useEventHandler("lighter:command-executed", handleCommandEvent);
  useEventHandler("lighter:redo", handleCommandEvent);
  useEventHandler("lighter:undo", handleCommandEvent);

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
