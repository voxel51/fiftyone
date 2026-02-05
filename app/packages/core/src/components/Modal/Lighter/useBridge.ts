/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  useAnnotationEventBus,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import { type AnnotationLabel } from "@fiftyone/state";
import {
  type LighterEventGroup,
  type Scene2D,
  UNDEFINED_LIGHTER_SCENE_ID,
  UpdateLabelCommand,
  useLighterEventBus,
  useLighterEventHandler,
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
export const useBridge = (scene: Scene2D | null) => {
  useLighterTooltipEventHandler(scene);
  const annotationEventBus = useAnnotationEventBus();
  const eventBus = useLighterEventBus(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
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
          new UpdateLabelCommand(
            overlay,
            eventBus,
            payload.currentLabel,
            payload.value,
            payload.origin
          )
        );
      },
      [scene, eventBus]
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

  useEventHandler(
    "lighter:overlay-establish",
    useCallback(
      (payload) => {
        annotationEventBus.dispatch(
          "annotation:canvasDetectionOverlayEstablish",
          {
            id: payload.id,
            overlay: payload.overlay.overlay,
          }
        );
      },
      [annotationEventBus]
    )
  );

  useEventHandler(
    "lighter:label-updated",
    useCallback(
      (payload) => {
        const labelData = payload.label
          ? coerceStringBooleans(payload.label as Record<string, unknown>)
          : {};
        save({
          data: labelData as Partial<AnnotationLabel["data"]>,
          __undo_replacement__: true,
        });
        if (payload.origin !== "sidebar") {
          annotationEventBus.dispatch("annotation:externalUpdate", {
            origin: payload.origin,
          });
        }
      },
      [annotationEventBus, save]
    )
  );

  const handleCommandEvent = useCallback(
    (
      payload:
        | LighterEventGroup["lighter:command-executed"]
        | LighterEventGroup["lighter:undo"]
        | LighterEventGroup["lighter:redo"]
    ) => {
      if (
        "command" in payload &&
        payload.command instanceof UpdateLabelCommand
      ) {
        return;
      }
      const label = overlay?.label;
      if (label) {
        save(label);
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
