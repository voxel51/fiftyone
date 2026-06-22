/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  toFrameEnginePath,
  useAnnotationEngine,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import {
  type Scene2D,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { LabelType } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useAnnotationContext } from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useAnnotationContext";
import { useDetectionMode } from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useDetectionMode";
import useExit from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useExit";
import { useVideoSurfaceActions } from "../hooks/useVideoSurfaceActions";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { autoExtendTargetFrames } from "../tracks/autoExtend";
import { useCurrentEditingOverlay } from "../state/accessors";

/** Schema-driven TD check: a field whose label type is a temporal detection. */
const isTemporalDetectionType = (type: LabelType): boolean =>
  type === LabelType.TemporalDetection || type === LabelType.TemporalDetections;

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
  const { clear } = useAnnotationContext();
  const editingOverlay = useCurrentEditingOverlay();
  const stream = useFrameLabelsStream();
  const engine = useAnnotationEngine();
  const surfaceActions = useVideoSurfaceActions();

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

  // Establishing a freshly-drawn overlay: the engine bridge's establish handler
  // commits + selects the draw synchronously, so a microtask later the engine
  // owns the label and the interaction anchor IS the new track's ref. Two things
  // happen here, both keyed off that anchor:
  //
  //  1. Hand the form off from the surface-owned draft to the engine anchor. The
  //     draft pins the ENGINE path (`frames.<field>`) so the write routes to the
  //     FrameStore and carries no engine ref, so the form shows the raw path and
  //     neither playhead-follow nor live re-sync engage. Dropping the draft
  //     (`clear`) lets `useFormAnchor` adopt the anchor — schema field + ref — so
  //     the form reads `<field>` and tracks the playhead, as a deselect→reselect
  //     does manually.
  //  2. Auto-extend a freshly-drawn box forward as a short track. `establish`
  //     fires only for a new draw (a new track), so this is new-tracks-only by
  //     construction; copy its box onto the next frames as non-keyframe filler
  //     (`extendTrack` semantics), matching a manual drag-to-extend. Leaves a
  //     single keyframe, so a later propagate/auto-lerp fills these in place.
  useEventHandler(
    "lighter:overlay-establish",
    useCallback(() => {
      if (!stream) {
        return;
      }

      queueMicrotask(() => {
        const anchor = engine.interaction.getAnchor();

        if (!anchor || anchor.frame == null) {
          return;
        }

        const source = engine.getLabel(anchor);

        if (!source) {
          return;
        }

        clear();

        // boxes only — a fresh draw of another label kind isn't a track
        if (!Array.isArray(source.bounding_box)) {
          return;
        }

        const targetFrames = autoExtendTargetFrames(
          anchor.frame,
          stream.totalFrames
        );

        if (targetFrames.length === 0) {
          return;
        }

        surfaceActions.extendTrack(
          anchor.instanceId,
          anchor.frame,
          targetFrames
        );
      });
    }, [clear, engine, surfaceActions, stream])
  );

  useEventHandler(
    "lighter:overlay-removed",
    useCallback(
      (payload) => {
        // A TemporalDetection deleted from the timeline context menu removes
        // its overlay directly; if it was the one open in the editor, tear the
        // now-dangling edit panel down. We identify the TD by the editing
        // overlay's FIELD TYPE (the schema) rather than an id shape: a
        // fresh-draw detection swap (which also removes an overlay mid-edit
        // then re-selects its replacement) is a Detection field, so it's left
        // untouched. Sidebar rows are engine-derived — nothing to prune here.
        if (
          editingOverlay &&
          editingOverlay.id === payload.id &&
          isTemporalDetectionType(engine.getLabelType(editingOverlay.field))
        ) {
          exit();
        }
      },
      [engine, exit, editingOverlay]
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
