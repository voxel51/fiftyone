/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  useAnnotationEngine,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import { LabelType } from "@fiftyone/utilities";
import { useCallback } from "react";
import useExit from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useExit";
import { useCurrentEditingOverlay } from "../state/accessors";
import type {
  DetectionMode,
  PolylineMode,
  RegisterLighterHandler,
  SegmentationMode,
} from "./lighterHandlerTypes";

/** Schema-driven TD check: a field whose label type is a temporal detection. */
const isTemporalDetectionType = (type: LabelType): boolean =>
  type === LabelType.TemporalDetection || type === LabelType.TemporalDetections;

/**
 * Editor teardown: a TemporalDetection deleted from the timeline context menu
 * removes its overlay directly; if it was open in the editor, tear the
 * now-dangling edit panel down.
 */
export const useRegisterEditorTeardownHandler = ({
  registerHandler,
}: {
  registerHandler: RegisterLighterHandler;
}): void => {
  const exit = useExit();
  const engine = useAnnotationEngine();
  const editingOverlay = useCurrentEditingOverlay();

  registerHandler(
    "lighter:overlay-removed",
    useCallback(
      (payload) => {
        // Identify the TD by the editing overlay's FIELD TYPE (the schema)
        // rather than an id shape: a fresh-draw detection swap (which also
        // removes an overlay mid-edit then re-selects its replacement) is a
        // Detection field, so it's left untouched.
        if (
          editingOverlay &&
          editingOverlay.id === payload.id &&
          isTemporalDetectionType(engine.getLabelType(editingOverlay.field))
        ) {
          // `overlay-removed` fires synchronously inside the engine's delete
          // dispatch; `exit()` writes `engine.interaction.setActive([])`, so
          // defer it outside the dispatch — a subscriber must never write back
          // to the engine.
          queueMicrotask(() => exit());
        }
      },
      [engine, exit, editingOverlay],
    ),
  );
};

/**
 * Mode quit: right-click and Esc deactivate whichever create mode is active.
 * `lighter:detection-mode-quit` / `lighter:segmentation-mode-quit` target their
 * own mode; the generic `lighter:active-mode-quit-requested` self-filters across
 * detection, segmentation, and polyline.
 */
export const useRegisterModeQuitHandlers = ({
  registerHandler,
  detectionMode,
  segmentationMode,
  polylineMode,
}: {
  registerHandler: RegisterLighterHandler;
  detectionMode: DetectionMode;
  segmentationMode: SegmentationMode;
  polylineMode: PolylineMode;
}): void => {
  registerHandler(
    "lighter:detection-mode-quit",
    useCallback(() => {
      detectionMode.deactivateDetectionMode();
    }, [detectionMode]),
  );

  registerHandler(
    "lighter:segmentation-mode-quit",
    useCallback(() => {
      if (segmentationMode.segmentationModeActive) {
        segmentationMode.deactivateSegmentationMode();
      }
    }, [segmentationMode]),
  );

  registerHandler(
    "lighter:active-mode-quit-requested",
    useCallback(() => {
      if (detectionMode.detectionModeActive) {
        detectionMode.deactivateDetectionMode();
        return;
      }

      if (segmentationMode.segmentationModeActive) {
        segmentationMode.deactivateSegmentationMode();
        return;
      }

      if (polylineMode.polylineModeActive) {
        polylineMode.deactivatePolylineMode();
      }
    }, [detectionMode, segmentationMode, polylineMode]),
  );
};

/**
 * Point-selection finalize: right-click during an AI click-to-segment session
 * commits the in-progress mask and re-arms a fresh point session for the next
 * detection. The committed label stays selected; `finalizePointSelection` flags
 * the next click to seed a NEW mask rather than refine the just-committed one.
 * Mirrors the image surface's `useBridge`.
 */
export const useRegisterPointSelectionFinalizeHandler = ({
  registerHandler,
  segmentationMode,
}: {
  registerHandler: RegisterLighterHandler;
  segmentationMode: SegmentationMode;
}): void => {
  registerHandler(
    "lighter:point-selection-finalize",
    useCallback(() => {
      if (segmentationMode.segmentationModeActive) {
        segmentationMode.finalizePointSelection();
      }
    }, [segmentationMode]),
  );
};

/**
 * Track deleted: tear down whichever create mode is active and drop the user
 * back to Select. A deleted track's creation handler goes with its overlay, so
 * a mode left armed would draw nothing.
 */
export const useRegisterTrackDeletedHandler = ({
  detectionMode,
  segmentationMode,
  polylineMode,
}: {
  detectionMode: DetectionMode;
  segmentationMode: SegmentationMode;
  polylineMode: PolylineMode;
}): void => {
  useAnnotationEventHandler(
    "annotation:trackDeleted",
    useCallback(() => {
      detectionMode.deactivateDetectionMode();

      if (segmentationMode.segmentationModeActive) {
        segmentationMode.deactivateSegmentationMode();
      }

      if (polylineMode.polylineModeActive) {
        polylineMode.deactivatePolylineMode();
      }
    }, [detectionMode, segmentationMode, polylineMode]),
  );
};
