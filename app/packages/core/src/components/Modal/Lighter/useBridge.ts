/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  DeleteAnnotationCommand,
  getFieldSchema,
  useAnnotationEventBus,
} from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import {
  DetectionOverlay,
  type Scene2D,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import type { DetectionLabel } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useEffect } from "react";
import { useRecoilValue } from "recoil";
import { editing } from "../Sidebar/Annotate/Edit";
import { current } from "../Sidebar/Annotate/Edit/state";
import { useDetectionMode } from "../Sidebar/Annotate/Edit/useDetectionMode";
import {
  usePolylineMode,
  usePolylineModeInstaller,
} from "../Sidebar/Annotate/Edit/usePolylineMode";
import { useSegmentationMode } from "../Sidebar/Annotate/Edit/useSegmentationMode";
import { useLabelsContext } from "../Sidebar/Annotate";
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
  const commandBus = useCommandBus();
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const setEditing = useSetAtom(editing);
  const getCurrentLabel = useAtomCallback(
    useCallback((get) => get(current), [])
  );
  const { addLabelToSidebar, getLabelById, removeLabelFromSidebar } =
    useLabelsContext();
  const fieldSchema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );

  const segmentationMode = useSegmentationMode();
  const detectionMode = useDetectionMode();
  const polylineMode = usePolylineMode();

  usePolylineModeInstaller();

  useEventHandler(
    "lighter:overlay-establish",
    useCallback(
      (payload) => {
        // Only route detection overlays into the detection establish path.
        // Non-detection overlays (e.g. keypoints) fire the same event but
        // should not enter the detection sidebar flow.
        if (!(payload.handler.overlay instanceof DetectionOverlay)) {
          return;
        }

        annotationEventBus.dispatch(
          "annotation:canvasDetectionOverlayEstablish",
          {
            id: payload.id,
            overlay: payload.handler.overlay,
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
        // Read at event-handling time to avoid stale closure
        const currentLabel = getCurrentLabel();

        // If the removed overlay is the one being edited, close the sidebar
        if (currentLabel?.overlay?.id === payload.id) {
          setEditing(null);
        }

        removeLabelFromSidebar(payload.id);
      },
      [getCurrentLabel, removeLabelFromSidebar, setEditing]
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
    "lighter:overlay-undone",
    useCallback(
      (payload) => {
        // Look up the label before it gets removed from the sidebar
        // (lighter:overlay-undone fires before lighter:overlay-removed)
        const label = getLabelById(payload.id);
        if (!label) {
          return;
        }

        const schema = getFieldSchema(fieldSchema, label.path);
        if (!schema) {
          return;
        }

        commandBus
          .execute(new DeleteAnnotationCommand(label, schema))
          .catch((error) => {
            console.error("Failed to persist undo of creation:", error);
          });
      },
      [commandBus, fieldSchema, getLabelById]
    )
  );

  // Mode bookkeeping when an overlay's label is mutated outside the command
  // stack (e.g. AI inference applying a new mask). Form/list data sync is
  // the engine's: the wiring hook commits the overlay change, the read-half
  // re-derives rows, and the form follows the anchor — no save-backs.
  useEventHandler(
    "lighter:overlay-label-updated",
    useCallback(
      (payload) => {
        segmentationMode.setEditingMask(payload.id, payload.hasMask);
        detectionMode.setEditingMask(payload.id, payload.hasMask);
      },
      [detectionMode, segmentationMode]
    )
  );

  useEventHandler(
    "lighter:overlay-create",
    useCallback(() => {
      if (segmentationMode.segmentationModeActive) {
        segmentationMode.create();
      } else if (detectionMode.detectionModeActive) {
        detectionMode.create();
      }
    }, [detectionMode, segmentationMode])
  );

  useEventHandler(
    "lighter:segmentation-mode-quit",
    useCallback(() => {
      if (segmentationMode.segmentationModeActive) {
        segmentationMode.deactivateSegmentationMode();
      }
    }, [segmentationMode])
  );

  useEventHandler(
    "lighter:detection-mode-quit",
    useCallback(() => {
      detectionMode.deactivateDetectionMode();
    }, [detectionMode])
  );

  // Generic "quit the active mode" request from global gestures (e.g.
  // right-click on empty canvas). Each mode self-filters on its own active
  // state so InteractionManager doesn't need to know about modes.
  useEventHandler(
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
        return;
      }
    }, [detectionMode, polylineMode, segmentationMode])
  );

  useEventHandler(
    "lighter:point-selection-finalize",
    useCallback(() => {
      if (segmentationMode.segmentationModeActive) {
        segmentationMode.finalizePointSelection();
      }
    }, [segmentationMode])
  );

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
