/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  toFrameEnginePath,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import {
  type Scene2D,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useCallback } from "react";
import { useDetectionMode } from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useDetectionMode";
import useExit from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useExit";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { useCurrentEditingOverlay } from "../state/accessors";

/**
 * Bridges Lighter overlay events into the annotation systems for the video
 * surface.
 *
 * Event-handler-only: state changes flow through the public `useDetectionMode`
 * interface rather than direct atom access, so this stays decoupled from that
 * module's internals. Canvas selection is handled by the engine's Lighter
 * bridge, not here (see the note inline).
 *
 * Wires the following bridges:
 *   - **Draw**: `lighter:overlay-create` → `detectionMode.create()`.
 *   - **Mode quit**: `lighter:detection-mode-quit` and
 *     `lighter:active-mode-quit-requested` (right-click / Esc) →
 *     `detectionMode.deactivateDetectionMode()`.
 *   - **Editor teardown**: `lighter:overlay-removed` for a `td-` overlay that
 *     is open in the editor → `exit()`.
 *
 * Sidebar membership is engine-derived (`useEntries` reads engine presence), so
 * nothing here pushes or prunes sidebar rows.
 * @param scene - The scene to bridge, or `null` while it's still being
 *   set up. When `null`, handlers attach to an inert sentinel channel
 *   and re-bind once the real scene becomes available.
 */
export const useSyncLighterAnnotation = (scene: Scene2D | null): void => {
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const detectionMode = useDetectionMode();
  const exit = useExit();
  const editingOverlay = useCurrentEditingOverlay();
  const stream = useFrameLabelsStream();

  useEventHandler(
    "lighter:overlay-create",
    useCallback(() => {
      if (detectionMode.detectionModeActive) {
        // Pin the destination to the frame engine path. The schema only exposes
        // the sample-level detection field, so the default resolution would
        // stamp that path on the overlay and route the write to the sample
        // store; the seam maps the relative field to `frames.<field>`.
        detectionMode.create(
          stream ? toFrameEnginePath(stream.labelsField) : undefined
        );
      }
    }, [detectionMode, stream])
  );

  // Establishing a freshly-drawn overlay opens the sidebar inspector via the
  // engine bridge (create → anchor → form-follows-anchor), so the old
  // `annotation:canvasDetectionOverlayEstablish` dispatch is gone. Wired with
  // the bridge in the surface re-lay.

  useEventHandler(
    "lighter:overlay-removed",
    useCallback(
      (payload) => {
        // A TemporalDetection deleted from the timeline context menu removes
        // its overlay directly; if it was the one open in the editor, tear
        // the now-dangling edit panel down. Scoped to `td-` ids so the
        // fresh-draw overlay swap (which also removes an overlay mid-edit,
        // then re-selects its replacement) is left untouched. Sidebar rows are
        // engine-derived, so there's nothing to prune here.
        if (
          payload.id?.startsWith("td-") &&
          editingOverlay?.id === payload.id
        ) {
          exit();
        }
      },
      [exit, editingOverlay]
    )
  );

  // Canvas selection (`lighter:overlay-select` / `deselect`) is owned by the
  // engine's Lighter `frame-locked` bridge (`SurfaceController.selectHandle`),
  // which maps an overlay handle to its `LabelRef` and drives
  // `engine.interaction`. Mirrors the image surface, which has no event bridge
  // here. Wired with the bridge in the surface re-lay.

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

  // Deleting a track leaves no useful edit/draw state to keep open, so tear
  // detection mode down.
  useAnnotationEventHandler(
    "annotation:trackDeleted",
    useCallback(() => {
      detectionMode.deactivateDetectionMode();
    }, [detectionMode])
  );
};
