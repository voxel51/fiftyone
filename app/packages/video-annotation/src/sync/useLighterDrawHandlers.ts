/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAnnotationEngine } from "@fiftyone/annotation";
import { useCallback } from "react";
import { useAnnotationContext } from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useAnnotationContext";
import { useVideoSurfaceActions } from "../hooks/useVideoSurfaceActions";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { autoExtendTargetFrames } from "../tracks/autoExtend";
import { establishPatchFor } from "../tracks/establishPatch";
import { takeEstablishKey } from "./establishKeyRelay";
import type {
  DetectionMode,
  RegisterLighterHandler,
  SegmentationMode,
} from "./lighterHandlerTypes";

/**
 * Draw: a Lighter overlay create opens a new draft on the engine frame path —
 * a masked detection while segmentation mode is active, else a plain detection
 * while detection mode is active. (Polylines self-create through their own
 * creation handler — see {@link usePolylineModeInstaller}.)
 */
export const useRegisterDrawHandler = ({
  registerHandler,
  detectionMode,
  segmentationMode,
}: {
  registerHandler: RegisterLighterHandler;
  detectionMode: DetectionMode;
  segmentationMode: SegmentationMode;
}): void => {
  registerHandler(
    "lighter:overlay-create",
    useCallback(() => {
      // The schema exposes the frame field at its real `frames.<field>` path,
      // so default field resolution stamps it and the write routes to the
      // FrameStore — no pinned destination needed.
      if (segmentationMode.segmentationModeActive) {
        segmentationMode.create();
      } else if (detectionMode.detectionModeActive) {
        detectionMode.create();
      }
    }, [detectionMode, segmentationMode]),
  );
};

/**
 * Draw establish: the engine bridge commits + selects the draw synchronously, so
 * a microtask later the engine owns the label and the interaction anchor IS the
 * new track's ref. Two things happen here, both keyed off that anchor:
 *
 *  1. Hand the form off from the surface-owned draft to the engine anchor. The
 *     draft pins the ENGINE path (`frames.<field>`) so the write routes to the
 *     FrameStore and carries no engine ref, so the form shows the raw path and
 *     neither playhead-follow nor live re-sync engage. Dropping the draft
 *     (`clear`) lets `useFormAnchor` adopt the anchor — schema field + ref — so
 *     the form reads `<field>` and tracks the playhead, as a deselect→reselect
 *     does manually.
 *  2. Auto-extend a freshly-drawn box forward as a short track. `establish` fires
 *     only for a new draw (a new track), so this is new-tracks-only by
 *     construction; copy its box onto the next frames as non-keyframe filler
 *     (`extendTrack` semantics), matching a manual drag-to-extend. Leaves a
 *     single keyframe, so a later propagate/auto-lerp fills these in place.
 */
export const useRegisterDrawEstablishHandler = ({
  registerHandler,
}: {
  registerHandler: RegisterLighterHandler;
}): void => {
  const { clear } = useAnnotationContext();
  const stream = useFrameLabelsStream();
  const engine = useAnnotationEngine();
  const surfaceActions = useVideoSurfaceActions();

  registerHandler(
    "lighter:overlay-establish",
    useCallback(
      (payload) => {
        if (!stream) {
          return;
        }

        queueMicrotask(() => {
          // The bridge stashed this draw's gesture key by overlay id during its
          // synchronous establish commit; take it (consume-once) so the
          // auto-extend folds into the draw's undo unit. Microtask order
          // guarantees the stash ran first, and it's keyed by identity.
          const drawUndoKey = takeEstablishKey(payload.overlayId);
          const anchor = engine.interaction.getAnchor();

          if (!anchor || anchor.frame == null) {
            return;
          }

          const source = engine.getLabel(anchor);

          if (!source) {
            return;
          }

          clear();

          // Geometry-bearing draws become tracks: a box, or a keypoint /
          // polyline's `points`. `useKeyframePromotionOnEdit` already treats both
          // as track geometry when a frame is EDITED, so gating the DRAW on boxes
          // alone left the two halves disagreeing: editing a polyline promoted a
          // keyframe, but drawing one never established the track in the first
          // place — no first keyframe, no auto-extend, no timeline row. A fresh
          // draw of a non-geometry label kind still isn't a track.
          const hasTrackGeometry =
            Array.isArray(source.bounding_box) ||
            (Array.isArray(source.points) &&
              (source.points as unknown[]).length > 0);

          if (!hasTrackGeometry) {
            return;
          }

          // The drawn frame is this track's first keyframe, and the anchor
          // gets the track's `instance` stamped (see `establishPatchFor`).
          // Folded into the draw's undo unit.
          const establishPatch = establishPatchFor(source, anchor.instanceId);

          if (Object.keys(establishPatch).length > 0) {
            engine.transaction(
              () => {
                engine.updateLabel(anchor, establishPatch);
              },
              { undoKey: drawUndoKey },
            );
          }

          const targetFrames = autoExtendTargetFrames(
            anchor.frame,
            stream.totalFrames,
          );

          if (targetFrames.length === 0) {
            return;
          }

          // fold the filler into the draw's undo unit (key taken above), on the
          // field the shape was actually drawn on — not the stream's primary,
          // which a draw onto a non-primary active field would miss
          surfaceActions.extendTrack(
            anchor.instanceId,
            anchor.frame,
            targetFrames,
            drawUndoKey,
            anchor.path,
          );
        });
      },
      [clear, engine, surfaceActions, stream],
    ),
  );
};
