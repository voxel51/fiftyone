/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  AnnotationEventGroup,
  useAnnotationEventBus,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import {
  type LighterEventGroup,
  type Scene2D,
  UNDEFINED_LIGHTER_SCENE_ID,
  UpdateLabelCommand,
  useLighterEventBus,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { currentData } from "../Sidebar/Annotate/Edit/state";
import { coerceStringBooleans, useLabelsContext } from "../Sidebar/Annotate";
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
  const { updateLabelData } = useLabelsContext();

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
            payload.currentLabel,
            payload.value,
            annotationEventBus
          )
        );
      },
      [annotationEventBus, scene]
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
    "lighter:overlay-removed",
    useCallback(
      (payload) => {
        annotationEventBus.dispatch(
          "annotation:canvasDetectionOverlayRemoved",
          {
            id: payload.id,
          }
        );
      },
      [annotationEventBus]
    )
  );

  useEventHandler(
    "lighter:drawing-session-ended",
    useCallback(() => {
      annotationEventBus.dispatch(
        "annotation:drawingSessionEnded",
        undefined as never
      );
    }, [annotationEventBus])
  );

  useAnnotationEventHandler(
    "annotation:sidebarLabelSelected",
    useCallback(
      (payload) => {
        if (!scene) {
          return;
        }

        scene.selectOverlay(payload.id, { ignoreSideEffects: true });
      },
      [scene]
    )
  );

  const handleUndoRedo = useCallback(
    (
      payload:
        | AnnotationEventGroup["annotation:labelEdit"]
        | AnnotationEventGroup["annotation:undoLabelEdit"]
    ) => {
      // sync data with the sidebar
      if (payload.label) {
        updateLabelData(payload.label._id ?? payload.label.id, payload.label);
      }
    },
    [updateLabelData]
  );

  useAnnotationEventHandler("annotation:labelEdit", handleUndoRedo);
  useAnnotationEventHandler("annotation:undoLabelEdit", handleUndoRedo);

  const handleCommandEvent = useCallback(
    (payload: LighterEventGroup["lighter:command-executed"]) => {
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
    [save]
  );

  useEventHandler("lighter:command-executed", handleCommandEvent);

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
