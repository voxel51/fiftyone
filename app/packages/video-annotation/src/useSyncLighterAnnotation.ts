/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  EditTemporalDetectionCommand,
  useAnnotationEventBus,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import {
  DetectionOverlay,
  type Scene2D,
  TemporalOverlay,
  type TemporalLabel,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useCallback } from "react";
import { useLabelsContext } from "../../core/src/components/Modal/Sidebar/Annotate";
import useFocus from "../../core/src/components/Modal/Sidebar/Annotate/useFocus";
import { useDetectionMode } from "../../core/src/components/Modal/Sidebar/Annotate/Edit/useDetectionMode";

/**
 * Bridges Lighter overlay events into the annotation systems for the video
 * surface.
 *
 * Event-handler-only: state changes flow through public hook interfaces
 * (`useDetectionMode`, `useFocus`) rather than direct atom access, so this
 * stays decoupled from those modules' internals.
 *
 * Wires the following bridges:
 *   - **Draw**: `lighter:overlay-create` → `detectionMode.create()`.
 *   - **Establish**: `lighter:overlay-establish` →
 *     `annotation:canvasDetectionOverlayEstablish` so the modal-level
 *     handler can open the sidebar inspector for the new label.
 *   - **Selection**: `lighter:overlay-select` / `deselect` →
 *     `focus.selectOverlay` / `deselectOverlay`.
 *   - **Mode quit**: `lighter:detection-mode-quit` and
 *     `lighter:active-mode-quit-requested` (right-click / Esc) →
 *     `detectionMode.deactivateDetectionMode()`.
 *   - **Transient sidebar cleanup**: `lighter:overlay-removed` →
 *     `removeLabelFromSidebar`. Snapshot-driven membership lives in
 *     {@link useSyncSidebarFromSnapshot}.
 *
 * Sidebar membership and per-frame data freshness are otherwise owned by
 * {@link useSyncSidebarFromSnapshot}, which reconciles against the current
 * `FrameLabelSnapshot`.
 * @param scene - The scene to bridge, or `null` while it's still being
 *   set up. When `null`, handlers attach to an inert sentinel channel
 *   and re-bind once the real scene becomes available.
 */
export const useSyncLighterAnnotation = (scene: Scene2D | null): void => {
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const annotationEventBus = useAnnotationEventBus();
  const commandBus = useCommandBus();
  const { getLabelById, removeLabelFromSidebar, updateLabelData } =
    useLabelsContext();
  const detectionMode = useDetectionMode();
  const focus = useFocus();

  useAnnotationEventHandler(
    "annotation:sidebarValueUpdated",
    useCallback(
      (payload) => {
        if (!scene) return;
        const overlay = scene.getOverlay(payload.overlayId);
        if (!(overlay instanceof TemporalOverlay)) return;
        const detectionId = overlay.label?._id;
        if (!detectionId) return;
        void commandBus.execute(
          new EditTemporalDetectionCommand(
            overlay.field,
            detectionId,
            payload.value as Partial<TemporalLabel>
          )
        );
      },
      [commandBus, scene]
    )
  );

  useAnnotationEventHandler(
    "annotation:labelEdit",
    useCallback(
      (payload) => {
        const label = payload.label as {
          _cls?: string;
          _id?: string;
        } | null;
        if (label?._cls !== "TemporalDetection") return;
        if (!label._id) return;
        const annotationLabel = getLabelById(label._id);
        if (!annotationLabel) return;
        updateLabelData(annotationLabel.overlay.id, payload.label as never);
      },
      [getLabelById, updateLabelData]
    )
  );

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
