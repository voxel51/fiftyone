/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAnnotationEventBus } from "@fiftyone/annotation";
import {
  DetectionOverlay,
  type Scene2D,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import type { DetectionLabel } from "@fiftyone/looker";
import { useCallback } from "react";
import { useLabelsContext } from "../../core/src/components/Modal/Sidebar/Annotate";
import useFocus from "../../core/src/components/Modal/Sidebar/Annotate/useFocus";
import { useDetectionMode } from "../../core/src/components/Modal/Sidebar/Annotate/Edit/useDetectionMode";

/**
 * Bridges Lighter overlay events into the annotation / sidebar systems
 * for the video surface. Event-handler-only — state changes flow
 * through public hook interfaces (`useLabelsContext`, `useDetectionMode`,
 * `useFocus`) rather than direct atom access.
 */
export const useSyncLighterAnnotation = (scene: Scene2D | null) => {
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const annotationEventBus = useAnnotationEventBus();
  const { addLabelToSidebar, removeLabelFromSidebar } = useLabelsContext();
  const detectionMode = useDetectionMode();
  const focus = useFocus();

  useEventHandler(
    "lighter:overlay-create",
    useCallback(() => {
      if (detectionMode.detectionModeActive) {
        detectionMode.create();
      }
    }, [detectionMode])
  );

  useEventHandler(
    "lighter:overlay-establish",
    useCallback(
      (payload) => {
        if (!(payload.handler.overlay instanceof DetectionOverlay)) {
          return;
        }
        annotationEventBus.dispatch(
          "annotation:canvasDetectionOverlayEstablish",
          { id: payload.id, overlay: payload.handler.overlay }
        );
      },
      [annotationEventBus]
    )
  );

  useEventHandler(
    "lighter:overlay-added",
    useCallback(
      (payload) => {
        if (
          payload.overlay instanceof DetectionOverlay &&
          payload.overlay.field
        ) {
          addLabelToSidebar({
            data: payload.overlay.label as DetectionLabel,
            overlay: payload.overlay,
            path: payload.overlay.field,
            type: "Detection",
          });
        }
      },
      [addLabelToSidebar]
    )
  );

  useEventHandler(
    "lighter:overlay-removed",
    useCallback(
      (payload) => {
        removeLabelFromSidebar(payload.id);
      },
      [removeLabelFromSidebar]
    )
  );

  useEventHandler(
    "lighter:overlay-select",
    useCallback(
      (payload) => {
        focus.selectOverlay(payload.id, {
          ignoreSideEffects: payload.ignoreSideEffects,
        });
      },
      [focus]
    )
  );

  useEventHandler(
    "lighter:overlay-deselect",
    useCallback(
      (payload) => {
        focus.deselectOverlay({
          ignoreSideEffects: payload.ignoreSideEffects,
        });
      },
      [focus]
    )
  );

  useEventHandler(
    "lighter:detection-mode-quit",
    useCallback(() => {
      detectionMode.deactivateDetectionMode();
    }, [detectionMode])
  );

  useEventHandler(
    "lighter:active-mode-quit-requested",
    useCallback(() => {
      if (detectionMode.detectionModeActive) {
        detectionMode.deactivateDetectionMode();
      }
    }, [detectionMode])
  );
};
