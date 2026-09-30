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
 * Draw establish: a microtask after the engine bridge commits a new draw, hand
 * the form from the surface-owned draft to the engine anchor (`clear`), stamp
 * the drawn frame as the track's first keyframe, and auto-extend the geometry
 * forward as non-keyframe filler. All writes fold into the draw's undo unit.
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

          // geometry-bearing draws (a box, or a keypoint / polyline's `points`)
          // become tracks; any other label kind does not
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
